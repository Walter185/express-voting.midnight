import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

import {
  LocalTestConfiguration,
  MidnightWalletProvider,
  TEST_MNEMONIC,
  WalletSeeds,
  initializeMidnightProviders,
  createDefaultTestLogger,
} from '@midnight-ntwrk/testkit-js'

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts'
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js'
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id'

import {
  Contract,
} from '../contract/src/managed/express-voting/contract/index.js'

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

const raw = await fs.readFile(
  new URL('../private/voter-commitments.json', import.meta.url),
  'utf8',
)

const commitments = [
  ...new Set(
    [...raw.matchAll(/\b[0-9a-fA-F]{64}\b/g)].map((m) =>
      m[0].toLowerCase(),
    ),
  ),
]

if (commitments.length < 3) {
  throw new Error(
    `Expected at least 3 voter commitments, found ${commitments.length}`,
  )
}

const [voterA, voterB, voterC] =
  commitments.slice(0, 3).map(hexToBytes)

const electionId = new Uint8Array(
  crypto
    .createHash('sha256')
    .update('express-voting-demo-2026')
    .digest(),
)

const logger = createDefaultTestLogger()

const env = new LocalTestConfiguration({
  indexer: 8088,
  node: 9944,
  proofServer: 6300,
})

setNetworkId(env.networkId)
console.log(`Network ID: ${env.networkId}`)

const seed = WalletSeeds.fromMnemonic(TEST_MNEMONIC).masterSeed

console.log('Connecting wallet to local Midnight...')

const wallet = await MidnightWalletProvider.build(
  logger,
  env,
  seed,
)

await wallet.start(true)

console.log('Wallet ready.')

const witnesses = {
  voterDni(context) {
    return [context.privateState, new Uint8Array(32)]
  },

  voterSecret(context) {
    return [context.privateState, new Uint8Array(32)]
  },

  findVoterPath() {
    throw new Error('findVoterPath is not used during deployment')
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
    privateStateStoreName: 'express-voting-local-smoke',
    zkConfigPath: path.resolve(
      'contract/src/managed/express-voting',
    ),
  },
)

try {
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

  console.log('')
  console.log('====================================')
  console.log('EXPRESS VOTING DEPLOYED ✅')
  console.log('====================================')
  console.log(
    'Contract address:',
    deployed.deployTxData.public.contractAddress ??
      deployed.deployTxData.public.deployedContractAddress ??
      deployed.deployedContractAddress ??
      '(address available in deploy result)',
  )
} finally {
  await wallet.stop()
}
