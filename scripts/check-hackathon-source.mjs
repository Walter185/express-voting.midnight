import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const required = [
  'LICENSE',
  'README.md',
  'contract/src/express-voting.compact',
  'contract/src/managed/express-voting/contract/index.js',
  'scripts/midnight-preview-api.mjs',
  'scripts/midnight-preview-worker.mjs',
  'app/src/app/page.tsx',
  'app/src/app/admin/page.tsx',
]

const circuits = [
  'addVoter',
  'castVote',
  'closeElection',
  'setVotingWindow',
  'verifyVoter',
]

const failures = []

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`Missing: ${rel}`)
  }
}

for (const circuit of circuits) {
  const assets = [
    `contract/src/managed/express-voting/keys/${circuit}.prover`,
    `contract/src/managed/express-voting/keys/${circuit}.verifier`,
    `contract/src/managed/express-voting/zkir/${circuit}.zkir`,
  ]

  for (const rel of assets) {
    if (!fs.existsSync(path.join(root, rel))) {
      failures.push(`Missing compiled asset: ${rel}`)
    }
  }
}

const forbidden = [
  '.env.preview',
  '.env.local-demo',
  'private/firebase-admin.json',
]

for (const rel of forbidden) {
  if (fs.existsSync(path.join(root, rel))) {
    failures.push(`Secret/private credential must not ship in source: ${rel}`)
  }
}

const compact = fs.readFileSync(
  path.join(root, 'contract/src/express-voting.compact'),
  'utf8',
)

for (const circuit of circuits) {
  if (!compact.includes(`export circuit ${circuit}`)) {
    failures.push(`Compact circuit missing: ${circuit}`)
  }
}

if (failures.length) {
  console.error('SOURCE CHECK FAILED')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('SOURCE CHECK OK')
console.log('5 Compact circuits + generated assets present.')
console.log('No known wallet/Firebase environment credential files included.')
