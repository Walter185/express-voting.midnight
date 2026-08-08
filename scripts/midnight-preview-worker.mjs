import path from 'node:path'
import crypto from 'node:crypto'
import pino from 'pino'

import {
  PreviewTestEnvironment,
  MidnightWalletProvider,
  WalletSeeds,
  initializeMidnightProviders,
} from '@midnight-ntwrk/testkit-js'

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts'
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js'
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id'

import {
  Contract,
  pureCircuits,
} from '../contract/src/managed/express-voting/contract/index.js'

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

function dniToBytes32(value) {
  const dni = String(value).replace(/\D/g, '')
  const encoded = new TextEncoder().encode(dni)

  if (encoded.length > 32) {
    throw new Error('Invalid DNI')
  }

  const result = new Uint8Array(32)
  result.set(encoded)
  return result
}

function txSummary(tx) {
  const txId = tx?.public?.txId
  const blockHeight = tx?.public?.blockHeight

  return {
    txId: txId == null ? null : String(txId),
    blockHeight:
      blockHeight == null ? null : Number(blockHeight),
  }
}

const logger = pino({ level: 'silent' })
const preview = new PreviewTestEnvironment(logger)

const env = {
  ...preview.getEnvironmentConfiguration(),
  proofServer:
    process.env.MIDNIGHT_PROOF_SERVER?.trim() ||
    'http://127.0.0.1:6300',
}

setNetworkId('preview')

const mnemonic =
  process.env.MIDNIGHT_PREVIEW_MNEMONIC?.trim() ||
  process.env.MIDNIGHT_MNEMONIC?.trim()

if (!mnemonic) {
  throw new Error('MIDNIGHT_PREVIEW_MNEMONIC not provided')
}

const contractAddress =
  process.env.PREVIEW_CONTRACT_ADDRESS?.trim()

if (!contractAddress) {
  throw new Error('PREVIEW_CONTRACT_ADDRESS not provided')
}

const adminSecretHex =
  process.env.MIDNIGHT_ADMIN_SECRET?.trim()

if (!/^[0-9a-fA-F]{64}$/.test(adminSecretHex || '')) {
  throw new Error('MIDNIGHT_ADMIN_SECRET must be 32 bytes in hex')
}

const adminSecretBytes = hexToBytes(adminSecretHex)
let activeVoter = null

const witnesses = {
  voterDni(context) {
    if (!activeVoter) {
      throw new Error('No active voter')
    }

    return [
      context.privateState,
      dniToBytes32(activeVoter.dni),
    ]
  },

  voterSecret(context) {
    if (!activeVoter) {
      throw new Error('No active voter')
    }

    return [
      context.privateState,
      hexToBytes(activeVoter.secret),
    ]
  },

  adminSecret(context) {
    return [
      context.privateState,
      adminSecretBytes,
    ]
  },

  findVoterPath(context, commitment) {
    const merklePath =
      context.ledger.voterRegistry.findPathForLeaf(commitment)

    if (!merklePath) {
      throw new Error(
        'Voter commitment not found in private registry',
      )
    }

    return [context.privateState, merklePath]
  },
}

const compiledContract = CompiledContract.make(
  'ExpressVoting',
  Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(
    path.resolve('contract/src/managed/express-voting'),
  ),
)

const seed = WalletSeeds.fromMnemonic(mnemonic).masterSeed

console.log('[wallet-worker] Starting Preview wallet...')

const wallet = await MidnightWalletProvider.build(
  logger,
  env,
  seed,
)

await wallet.start(false)
await wallet.wallet.waitForSyncedState()

console.log('[wallet-worker] Wallet synced.')

const providers = initializeMidnightProviders(
  wallet,
  env,
  {
    privateStateStoreName: 'express-voting-preview-worker',
    zkConfigPath: path.resolve(
      'contract/src/managed/express-voting',
    ),
  },
)

const deployed = await findDeployedContract(
  providers,
  {
    contractAddress,
    compiledContract,
    privateStateId: 'express-voting-preview-worker-voter',
    initialPrivateState: {},
  },
)

console.log(`[wallet-worker] Contract connected: ${contractAddress}`)
process.send?.({ type: 'ready', contractAddress })

let busy = false

async function runJob(job) {
  if (busy) {
    throw new Error('Wallet worker is already processing a transaction')
  }

  busy = true

  try {
    if (job.op === 'schedule') {
      const tx = await deployed.callTx.setVotingWindow(
        BigInt(job.payload.start),
        BigInt(job.payload.end),
      )
      return txSummary(tx)
    }

    if (job.op === 'close') {
      const tx = await deployed.callTx.closeElection()
      return txSummary(tx)
    }

    if (job.op === 'add-voter') {
      const commitment =
        pureCircuits.deriveVoterCommitment(
          dniToBytes32(job.payload.dni),
          hexToBytes(job.payload.secret),
        )

      const tx = await deployed.callTx.addVoter(commitment)
      return txSummary(tx)
    }

    if (job.op === 'vote') {
      activeVoter = {
        dni: job.payload.dni,
        secret: job.payload.secret,
      }

      try {
        const tx = await deployed.callTx.castVote(
          hexToBytes(job.payload.voteCommitment),
        )
        return txSummary(tx)
      } finally {
        activeVoter = null
      }
    }

    throw new Error(`Unknown wallet operation: ${job.op}`)
  } finally {
    busy = false
  }
}

process.on('message', async (message) => {
  if (!message || message.type !== 'run' || !message.job) {
    return
  }

  const { job } = message

  process.send?.({
    type: 'job-started',
    id: job.id,
  })

  try {
    const result = await runJob(job)

    process.send?.({
      type: 'job-result',
      id: job.id,
      result,
    })
  } catch (error) {
    process.send?.({
      type: 'job-error',
      id: job.id,
      error: String(error?.message ?? error),
    })
  }
})

async function shutdown() {
  try {
    await wallet.stop()
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
