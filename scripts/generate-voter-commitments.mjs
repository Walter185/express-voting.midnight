import fs from 'node:fs/promises'

import {
  pureCircuits,
} from '../contract/src/managed/express-voting/contract/index.js'

function normalizeDni(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

function dniToBytes32(value) {
  const encoded = new TextEncoder().encode(normalizeDni(value))

  if (encoded.length > 32) {
    throw new Error('Invalid DNI')
  }

  const result = new Uint8Array(32)
  result.set(encoded)
  return result
}

const votersUrl = new URL('../private/voters.json', import.meta.url)
const outputUrl = new URL('../private/voter-commitments.json', import.meta.url)
const voters = JSON.parse(await fs.readFile(votersUrl, 'utf8'))

if (!Array.isArray(voters) || voters.length < 3) {
  throw new Error('Expected at least 3 private demo voters')
}

const commitments = voters.map((voter, index) => {
  const dni = normalizeDni(voter.dni)
  const secret = String(voter.secret ?? '')

  if (!/^\d{7,9}$/.test(dni)) {
    throw new Error('Invalid DNI in private/voters.json')
  }

  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error('Invalid voter secret in private/voters.json')
  }

  const commitment = pureCircuits.deriveVoterCommitment(
    dniToBytes32(dni),
    hexToBytes(secret),
  )

  return {
    id: String(voter.id ?? index + 1),
    commitment: Buffer.from(commitment).toString('hex'),
  }
})

await fs.writeFile(
  outputUrl,
  JSON.stringify({ commitments }, null, 2) + '\n',
  { encoding: 'utf8', mode: 0o600 },
)

console.log(`Generated ${commitments.length} private voter commitments.`)
