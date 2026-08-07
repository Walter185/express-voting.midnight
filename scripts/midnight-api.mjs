import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import pino from 'pino'

import {
  LocalTestConfiguration,
  MidnightWalletProvider,
  TEST_MNEMONIC,
  WalletSeeds,
  initializeMidnightProviders,
} from '@midnight-ntwrk/testkit-js'

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts'
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js'
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id'

import {
  Contract,
  ledger as readLedger,
} from '../contract/src/managed/express-voting/contract/index.js'

const PORT = 8789

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

function normalizeDni(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })

  res.end(JSON.stringify(data))
}

async function readBody(req) {
  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  if (!chunks.length) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
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
].map((match) => match[0])

if (commitments.length < 3) {
  throw new Error('Expected at least 3 voter commitments')
}

const [voterA, voterB, voterC] =
  commitments.slice(0, 3).map(hexToBytes)

const electionId = new Uint8Array(
  crypto
    .createHash('sha256')
    .update('express-voting-demo-2026')
    .digest(),
)

const env = new LocalTestConfiguration({
  indexer: 8088,
  node: 9944,
  proofServer: 6300,
})

setNetworkId(env.networkId)

/*
 * Importante:
 * activeVoter nunca se publica.
 * Los witnesses leen DNI + secret únicamente durante la ejecución
 * privada del circuito.
 */
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

const logger = pino({
  level: 'warn',
})

const seed =
  WalletSeeds.fromMnemonic(TEST_MNEMONIC).masterSeed

console.log('Starting Midnight wallet...')

const wallet = await MidnightWalletProvider.build(
  logger,
  env,
  seed,
)

await wallet.start(true)

console.log('Wallet synced.')

const providers = initializeMidnightProviders(
  wallet,
  env,
  {
    privateStateStoreName: 'express-voting-ui',
    zkConfigPath: path.resolve(
      'contract/src/managed/express-voting',
    ),
  },
)

console.log('Deploying Express Voting contract...')

const deployed = await deployContract(
  providers,
  {
    compiledContract,
    args: [
      electionId,
      voterA,
      voterB,
      voterC,
    ],
  },
)

const contractAddress =
  deployed.deployTxData.public.contractAddress

console.log(`Contract deployed: ${contractAddress}`)

async function getLedger() {
  const state =
    await providers.publicDataProvider.queryContractState(
      contractAddress,
    )

  if (!state) {
    throw new Error('Contract state not found')
  }

  return readLedger(state.data)
}

function findVoter(dni) {
  const target = normalizeDni(dni)

  return voters.find(
    (voter) => normalizeDni(voter.dni) === target,
  )
}

/*
 * Los circuitos usan un witness dinámico.
 * Serializamos llamadas para evitar que dos requests de demo
 * modifiquen activeVoter simultáneamente.
 */
let queue = Promise.resolve()

function serialized(fn) {
  const result = queue.then(fn, fn)

  queue = result.catch(() => {})

  return result
}

async function verifyEligibility(dni) {
  return serialized(async () => {
    const voter = findVoter(dni)

    if (!voter) {
      return {
        eligible: false,
        reason: 'not_registered',
      }
    }

    activeVoter = voter

    try {
      /*
       * ESTA ES LA VERIFICACIÓN MIDNIGHT REAL:
       * DNI + voterSecret -> commitment -> Merkle path.
       */
      await deployed.callTx.verifyVoter()

      return {
        eligible: true,
      }
    } catch (error) {
      return {
        eligible: false,
        reason: 'contract_rejected',
        message:
          'El contrato Midnight rechazó la credencial o este votante ya emitió su voto.',
      }
    } finally {
      activeVoter = null
    }
  })
}

async function castPrivateVote(dni, candidate) {
  return serialized(async () => {
    const voter = findVoter(dni)

    if (!voter) {
      throw new Error('Voter is not registered')
    }

    if (![0, 1, 2].includes(candidate)) {
      throw new Error('Invalid voting option')
    }

    activeVoter = voter

    try {
      /*
       * No publicamos el candidato.
       *
       * En cadena queda solamente:
       *   H(electionId || candidate || randomSalt)
       */
      const salt = crypto.randomBytes(32)

      const voteCommitment = new Uint8Array(
        crypto
          .createHash('sha256')
          .update('express-voting:ballot')
          .update(electionId)
          .update(String(candidate))
          .update(salt)
          .digest(),
      )

      await deployed.callTx.castVote(voteCommitment)

      const state = await getLedger()

      const candidateName =
        candidate === 1
          ? 'Candidato A (Lista Verde)'
          : candidate === 2
            ? 'Candidato B (Lista Azul)'
            : 'Voto en blanco'

      return {
        success: true,
        candidateName,
        contractAddress,
        voteCommitment:
          Buffer.from(voteCommitment).toString('hex'),
        totalVotes: Number(state.totalVotes),
      }
    } finally {
      activeVoter = null
    }
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {})
    return
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      const state = await getLedger()

      json(res, 200, {
        status: true,
        network: 'undeployed',
        contractAddress,
        registeredVoters:
          Number(state.registeredVoterCount),
        totalVotes:
          Number(state.totalVotes),
      })

      return
    }

    if (
      req.method === 'POST' &&
      req.url === '/eligibility'
    ) {
      const body = await readBody(req)

      const result =
        await verifyEligibility(body.dni)

      json(
        res,
        result.eligible ? 200 : 403,
        result,
      )

      return
    }

    if (
      req.method === 'POST' &&
      req.url === '/vote'
    ) {
      const body = await readBody(req)

      try {
        const result = await castPrivateVote(
          body.dni,
          Number(body.candidate),
        )

        json(res, 200, result)
      } catch (error) {
        json(res, 409, {
          success: false,
          message:
            'Voto rechazado por el contrato Midnight. El votante puede haber votado previamente o no ser elegible.',
        })
      }

      return
    }

    json(res, 404, {
      error: 'Not found',
    })
  } catch (error) {
    console.error(error)

    json(res, 500, {
      error: 'Midnight service error',
    })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('')
  console.log('======================================')
  console.log('EXPRESS VOTING MIDNIGHT API READY ✅')
  console.log('======================================')
  console.log(`http://localhost:${PORT}`)
  console.log(`Contract: ${contractAddress}`)
})

async function shutdown() {
  console.log('\nStopping Midnight service...')

  server.close()

  await wallet.stop()

  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
