import fs from 'node:fs/promises'
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
  ledger as readLedger,
} from '../contract/src/managed/express-voting/contract/index.js'

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

function dniToBytes32(dni) {
  const encoded = new TextEncoder().encode(String(dni))

  if (encoded.length > 32) {
    throw new Error('DNI too long')
  }

  const result = new Uint8Array(32)
  result.set(encoded)

  return result
}

const voters = JSON.parse(
  await fs.readFile(
    new URL('../private/voters.json', import.meta.url),
    'utf8',
  ),
)

const commitmentData = JSON.parse(
  await fs.readFile(
    new URL('../private/voter-commitments.json', import.meta.url),
    'utf8',
  ),
)

const commitments = [
  ...JSON.stringify(commitmentData).matchAll(/\b[0-9a-fA-F]{64}\b/g),
].map((m) => m[0])

if (commitments.length < 3) {
  throw new Error('Expected at least 3 voter commitments')
}

const [voterA, voterB, voterC] =
  commitments.slice(0, 3).map(hexToBytes)

const selectedVoter = voters[0]

if (!selectedVoter?.dni || !selectedVoter?.secret) {
  throw new Error('Invalid private voter data')
}

const voterDni = dniToBytes32(selectedVoter.dni)
const voterSecret = hexToBytes(selectedVoter.secret)

const electionId = new Uint8Array(
  crypto
    .createHash('sha256')
    .update('express-voting-demo-2026')
    .digest(),
)

const logger = pino({ level: 'silent' })

const preview = new PreviewTestEnvironment(logger)

const env = {
  ...preview.getEnvironmentConfiguration(),
  proofServer: 'http://127.0.0.1:6300',
}

setNetworkId('preview')

const mnemonic = process.env.MIDNIGHT_MNEMONIC?.trim()

if (!mnemonic) {
  throw new Error('MIDNIGHT_MNEMONIC not provided')
}

const seed =
  WalletSeeds.fromMnemonic(mnemonic).masterSeed

const wallet = await MidnightWalletProvider.build(
  logger,
  env,
  seed,
)

console.log('Connecting wallet...')
await wallet.start(false)
await wallet.wallet.waitForSyncedState()
console.log('Wallet ready.')

const witnesses = {
  voterDni(context) {
    return [context.privateState, voterDni]
  },

  voterSecret(context) {
    return [context.privateState, voterSecret]
  },

  findVoterPath(context, commitment) {
    const merklePath =
      context.ledger.voterRegistry.findPathForLeaf(commitment)

    if (!merklePath) {
      throw new Error('Voter commitment not found in registry')
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

const providers = initializeMidnightProviders(
  wallet,
  env,
  {
    privateStateStoreName: 'express-voting-preview-existing-vote',
    zkConfigPath: path.resolve(
      'contract/src/managed/express-voting',
    ),
  },
)

async function getLedger(address) {
  const state =
    await providers.publicDataProvider.queryContractState(address)

  if (!state) {
    throw new Error('Contract state not found')
  }

  return readLedger(state.data)
}


const address =
  process.env.PREVIEW_CONTRACT_ADDRESS?.trim()

if (!address) {
  throw new Error('PREVIEW_CONTRACT_ADDRESS not provided')
}

try {
  console.log('')
  console.log('1. Connecting to existing Preview contract...')
  console.log('   Contract:', address)

  const deployed = await findDeployedContract(
    providers,
    {
      contractAddress: address,
      compiledContract,
      privateStateId: 'express-voting-preview-voter',
      initialPrivateState: {},
    },
  )

  console.log('   ✓ contract found')

  let state = await getLedger(address)

  console.log('')
  console.log(
    `2. Registered voters: ${state.registeredVoterCount}`,
  )
  console.log(
    `   Current totalVotes: ${state.totalVotes}`,
  )

  if (state.registeredVoterCount !== 3n) {
    throw new Error('Expected registeredVoterCount = 3')
  }

  console.log('   ✓ registry contains 3 voters')

  if (process.env.PREVIEW_DRY_RUN === '1') {
    console.log('')
    console.log('DRY RUN complete - no transaction submitted ✅')
  } else {
    console.log('')
    console.log('3. Casting ONE private vote...')

    const beforeVotes = state.totalVotes

    const voteCommitment =
      new Uint8Array(crypto.randomBytes(32))

    await deployed.callTx.castVote(voteCommitment)

    console.log('   ✓ vote accepted')

    state = await getLedger(address)

    console.log(
      `   totalVotes = ${state.totalVotes}`,
    )

    if (state.totalVotes !== beforeVotes + 1n) {
      throw new Error(
        'totalVotes did not increment by exactly 1',
      )
    }

    console.log('')
    console.log('Merkle eligibility + castVote ✅')
    console.log('On-chain vote counter        ✅')
  }
} finally {
  await wallet.stop()
}
