import pino from 'pino'

import {
  PreviewTestEnvironment,
  MidnightWalletProvider,
  WalletSeeds,
  DAppConnectorWalletAdapter,
} from '@midnight-ntwrk/testkit-js'

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id'

const mnemonic = process.env.MIDNIGHT_MNEMONIC

if (!mnemonic) {
  throw new Error('MIDNIGHT_MNEMONIC not provided')
}

const logger = pino({ level: 'silent' })

const preview = new PreviewTestEnvironment(logger)

const env = {
  ...preview.getEnvironmentConfiguration(),
  proofServer: 'http://127.0.0.1:6300',
}

setNetworkId('preview')

const seed =
  WalletSeeds.fromMnemonic(mnemonic.trim()).masterSeed

const wallet = await MidnightWalletProvider.build(
  logger,
  env,
  seed,
)

console.log('Connecting to Midnight Preview...')
await wallet.start(false)

console.log('Syncing wallet...')
await wallet.wallet.waitForSyncedState()

const adapter =
  new DAppConnectorWalletAdapter(wallet, env)

const shielded =
  await adapter.getShieldedAddresses()

const unshielded =
  await adapter.getUnshieldedAddress()

const dust =
  await adapter.getDustAddress()

const dustBalance =
  await adapter.getDustBalance()

const unshieldedBalances =
  await adapter.getUnshieldedBalances()

const formatDust = (raw) => {
  const whole = raw / 1000000000000000n
  const fraction =
    (raw % 1000000000000000n)
      .toString()
      .padStart(15, '0')

  return `${whole}.${fraction}`
}

console.log('')
console.log('=== MIDNIGHT PREVIEW WALLET ===')
console.log('')
console.log('Shielded:')
console.log(shielded.shieldedAddress)
console.log('')
console.log('Unshielded:')
console.log(unshielded.unshieldedAddress)
console.log('')
console.log('DUST:')
console.log(dust.dustAddress)
console.log('')
console.log(
  'DUST balance:',
  formatDust(dustBalance.balance),
)
console.log(
  'DUST cap:',
  formatDust(dustBalance.cap),
)
console.log('')
console.log(
  'Unshielded balances:',
  Object.fromEntries(
    Object.entries(unshieldedBalances)
      .map(([k, v]) => [k, v.toString()])
  ),
)

await wallet.stop()
