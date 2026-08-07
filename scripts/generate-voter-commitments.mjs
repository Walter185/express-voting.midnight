import { readFileSync, writeFileSync } from 'node:fs'
import { pureCircuits } from '../contract/src/managed/express-voting/contract/index.js'

function dniToBytes32(dni) {
  const normalized = String(dni).trim()

  if (!/^\d{7,8}$/.test(normalized)) {
    throw new Error('Each DNI must contain 7 or 8 digits')
  }

  const encoded = new TextEncoder().encode(normalized)
  const result = new Uint8Array(32)

  result.set(encoded)

  return result
}

function secretToBytes32(secret) {
  const normalized = String(secret)
    .trim()
    .replace(/^0x/, '')

  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('Each voter secret must be exactly 32 bytes')
  }

  return Uint8Array.from(
    normalized.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)),
  )
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const voters = JSON.parse(
  readFileSync('private/voters.json', 'utf8'),
)

const registry = voters.map((voter) => {
  const dni = dniToBytes32(voter.dni)
  const secret = secretToBytes32(voter.secret)

  const commitment =
    pureCircuits.deriveVoterCommitment(dni, secret)

  return {
    id: voter.id,
    commitment: bytesToHex(commitment),
  }
})

writeFileSync(
  'private/voter-commitments.json',
  JSON.stringify(registry, null, 2) + '\n',
)

console.log('✓ Voter commitments generated with Compact')
console.log()

for (const voter of registry) {
  console.log(`${voter.id}: ${voter.commitment}`)
}

console.log()
console.log('✓ DNI values were not printed')
console.log('✓ voter secrets were not printed')
console.log('✓ output saved to private/voter-commitments.json')
