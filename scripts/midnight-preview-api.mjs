import http from 'node:http'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  initializeApp,
  applicationDefault,
} from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { WebSocket } from 'ws'

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider'
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id'

import {
  ledger as readLedger,
  pureCircuits,
} from '../contract/src/managed/express-voting/contract/index.js'

const PORT = Number(process.env.PORT || 8789)
const TX_TIMEOUT_MS = Number(
  process.env.MIDNIGHT_TX_TIMEOUT_MS || 120000,
)

const PREVIEW_INDEXER_HTTP =
  process.env.MIDNIGHT_PREVIEW_INDEXER?.trim() ||
  'https://indexer.preview.midnight.network/api/v4/graphql'

const PREVIEW_INDEXER_WS =
  process.env.MIDNIGHT_PREVIEW_INDEXER_WS?.trim() ||
  'wss://indexer.preview.midnight.network/api/v4/graphql/ws'

const contractAddress =
  process.env.PREVIEW_CONTRACT_ADDRESS?.trim()

if (!contractAddress) {
  throw new Error('PREVIEW_CONTRACT_ADDRESS not provided')
}

const adminEmail =
  process.env.FIREBASE_ADMIN_EMAIL?.trim().toLowerCase()

if (!adminEmail) {
  throw new Error('FIREBASE_ADMIN_EMAIL not provided')
}

setNetworkId('preview')
globalThis.WebSocket = WebSocket

const publicDataProvider = indexerPublicDataProvider(
  PREVIEW_INDEXER_HTTP,
  PREVIEW_INDEXER_WS,
)

const firebaseApp = initializeApp({
  credential: applicationDefault(),
})

const firebaseAuth = getAuth(firebaseApp)

const votersPath =
  new URL('../private/voters.json', import.meta.url)

let voters = await loadVoters()
let shuttingDown = false

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

function json(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
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

async function loadVoters() {
  const raw = await fs.readFile(votersPath, 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error('private/voters.json must contain an array')
  }

  return parsed
}

function findVoter(dni) {
  const target = normalizeDni(dni)

  return voters.find(
    (voter) => normalizeDni(voter.dni) === target,
  )
}

async function persistVoter(voter) {
  const normalized = normalizeDni(voter.dni)

  if (findVoter(normalized)) {
    return
  }

  const nextVoters = [
    ...voters,
    {
      dni: normalized,
      secret: voter.secret,
    },
  ]

  const tempPath = new URL(
    '../private/voters.json.tmp',
    import.meta.url,
  )

  await fs.writeFile(
    tempPath,
    JSON.stringify(nextVoters, null, 2) + '\n',
    { encoding: 'utf8', mode: 0o600 },
  )

  await fs.rename(tempPath, votersPath)
  voters = nextVoters
}

async function requireAdmin(req) {
  const authorization =
    String(req.headers.authorization ?? '')

  if (!authorization.startsWith('Bearer ')) {
    const error = new Error('Authentication required')
    error.statusCode = 401
    throw error
  }

  const token = authorization.slice(7).trim()
  const decoded = await firebaseAuth.verifyIdToken(token)
  const email = String(decoded.email ?? '').toLowerCase()

  if (email !== adminEmail) {
    const error = new Error('Administrator not authorized')
    error.statusCode = 403
    throw error
  }

  return decoded
}

async function getLedger() {
  const state =
    await publicDataProvider.queryContractState(contractAddress)

  if (!state) {
    throw new Error('Contract state not found')
  }

  return readLedger(state.data)
}

function electionInfoFromLedger(state) {
  const configured = Boolean(state.votingConfigured)
  const closed = Boolean(state.electionClosed)
  const start = Number(state.votingStart ?? 0n)
  const end = Number(state.votingEnd ?? 0n)
  const now = Math.floor(Date.now() / 1000)

  let status = 'SIN_CONFIGURAR'

  if (closed) {
    status = 'FINALIZADA'
  } else if (!configured) {
    status = 'SIN_CONFIGURAR'
  } else if (now < start) {
    status = 'PROGRAMADA'
  } else if (now >= end) {
    status = 'FINALIZADA'
  } else {
    status = 'ABIERTA'
  }

  const registeredVoters =
    Number(state.registeredVoterCount)

  const totalVotes = Number(state.totalVotes)

  return {
    status,
    network: 'preview',
    contractAddress,
    registeredVoters,
    totalVotes,
    participation:
      registeredVoters > 0
        ? (totalVotes / registeredVoters) * 100
        : 0,
    votingConfigured: configured,
    electionClosed: closed,
    votingStart: start,
    votingEnd: end,
    now,
  }
}

async function getElectionInfo() {
  return electionInfoFromLedger(await getLedger())
}

function verifyEligibility(dni) {
  const voter = findVoter(dni)

  if (!voter) {
    return {
      eligible: false,
      reason: 'not_registered',
      message:
        'Este DNI no pertenece al padrón privado de esta elección.',
    }
  }

  return { eligible: true }
}

// -----------------------------------------------------------------------------
// Wallet worker
//
// All Midnight transaction/proving work runs in a separate Node process. This
// keeps /health and /election responsive even if Wallet SDK work becomes CPU
// intensive while it waits for transaction finalization on Preview.
// -----------------------------------------------------------------------------

const jobs = new Map()
const jobQueue = []
const pendingVoterVotes = new Set()
const pendingVoterAdds = new Set()

let walletWorker = null
let workerReady = false
let workerBusy = false
let activeWorkerJobId = null
let restartTimer = null

function publicJob(job) {
  return {
    jobId: job.id,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result ?? null,
    error: job.error ?? null,
  }
}

function createJob(type, payload, meta = {}) {
  const now = Date.now()
  const id = crypto.randomBytes(20).toString('hex')

  const job = {
    id,
    type,
    payload,
    meta,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    result: null,
    error: null,
  }

  jobs.set(id, job)
  jobQueue.push(id)
  pumpWorker()

  return job
}

function markJobFailed(job, message) {
  if (!job || job.status === 'succeeded') {
    return
  }

  job.status = 'failed'
  job.error = message
  job.updatedAt = Date.now()

  if (job.type === 'vote' && job.meta.dni) {
    pendingVoterVotes.delete(job.meta.dni)
  }

  if (job.type === 'add-voter' && job.meta.dni) {
    pendingVoterAdds.delete(job.meta.dni)
  }
}

async function finishJobFromState(job, election, txResult = null) {
  if (!job || job.status === 'succeeded') {
    return
  }

  if (job.type === 'schedule') {
    job.result = {
      success: true,
      election,
      transaction: txResult,
    }
  } else if (job.type === 'close') {
    job.result = {
      success: true,
      election,
      transaction: txResult,
    }
  } else if (job.type === 'add-voter') {
    await persistVoter(job.meta.newVoter)
    pendingVoterAdds.delete(job.meta.dni)

    job.result = {
      success: true,
      registeredVoters: election.registeredVoters,
      status: election.status,
      transaction: txResult,
    }
  } else if (job.type === 'vote') {
    pendingVoterVotes.delete(job.meta.dni)

    job.result = {
      success: true,
      candidateName: job.meta.candidateName,
      contractAddress,
      voteCommitment: job.meta.voteCommitment,
      totalVotes: election.totalVotes,
      transaction: txResult,
    }
  }

  job.status = 'succeeded'
  job.error = null
  job.updatedAt = Date.now()
}

function scheduleWorkerRestart(delay = 1200) {
  if (shuttingDown || restartTimer) {
    return
  }

  restartTimer = setTimeout(() => {
    restartTimer = null
    startWorker()
  }, delay)
}

function startWorker() {
  if (shuttingDown || walletWorker) {
    return
  }

  workerReady = false
  workerBusy = false
  activeWorkerJobId = null

  const workerPath = fileURLToPath(
    new URL('./midnight-preview-worker.mjs', import.meta.url),
  )

  walletWorker = fork(workerPath, [], {
    env: process.env,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  })

  walletWorker.on('message', async (message) => {
    try {
      if (message?.type === 'ready') {
        workerReady = true
        console.log('Wallet worker ready on Preview.')
        pumpWorker()
        return
      }

      if (message?.type === 'job-started') {
        const job = jobs.get(message.id)
        if (job && job.status === 'queued') {
          job.status = 'running'
          job.startedAt = Date.now()
          job.updatedAt = Date.now()
        }
        return
      }

      if (message?.type === 'job-result') {
        const job = jobs.get(message.id)

        workerBusy = false
        activeWorkerJobId = null

        if (
          job &&
          job.status !== 'succeeded' &&
          job.status !== 'failed'
        ) {
          job.meta.txResult = message.result
          job.status = 'confirming'
          job.updatedAt = Date.now()
        }

        return
      }

      if (message?.type === 'job-error') {
        const job = jobs.get(message.id)

        workerBusy = false
        activeWorkerJobId = null

        markJobFailed(
          job,
          message.error || 'Midnight rejected the transaction',
        )

        pumpWorker()
      }
    } catch (error) {
      console.error('Wallet worker message handler:', error)
    }
  })

  walletWorker.on('error', (error) => {
    console.error('Wallet worker process error:', error)
  })

  walletWorker.on('exit', (code, signal) => {
    console.log(
      `Wallet worker stopped (code=${code}, signal=${signal ?? 'none'}).`,
    )

    const interruptedJob =
      activeWorkerJobId
        ? jobs.get(activeWorkerJobId)
        : null

    if (
      interruptedJob &&
      interruptedJob.status !== 'succeeded' &&
      interruptedJob.status !== 'failed'
    ) {
      interruptedJob.status = 'confirming'
      interruptedJob.updatedAt = Date.now()
    }

    walletWorker = null
    workerReady = false
    workerBusy = false
    activeWorkerJobId = null

    scheduleWorkerRestart()
  })
}

function pumpWorker() {
  const waitingForConfirmation = [...jobs.values()].some(
    (job) => job.status === 'confirming',
  )

  if (
    !workerReady ||
    workerBusy ||
    waitingForConfirmation ||
    !walletWorker?.connected
  ) {
    return
  }

  while (jobQueue.length) {
    const id = jobQueue.shift()
    const job = jobs.get(id)

    if (!job || job.status !== 'queued') {
      continue
    }

    workerBusy = true
    activeWorkerJobId = id
    job.status = 'running'
    job.startedAt = Date.now()
    job.updatedAt = Date.now()

    walletWorker.send({
      type: 'run',
      job: {
        id: job.id,
        op: job.type,
        payload: job.payload,
      },
    })

    return
  }
}

async function monitorPendingJobs() {
  const candidates = [...jobs.values()].filter(
    (job) =>
      job.status === 'running' ||
      job.status === 'confirming',
  )

  if (!candidates.length) {
    return
  }

  let state

  try {
    state = await getLedger()
  } catch {
    return
  }

  const election = electionInfoFromLedger(state)

  for (const job of candidates) {
    let confirmed = false

    if (job.type === 'schedule') {
      confirmed =
        election.votingConfigured &&
        election.votingStart === job.meta.start &&
        election.votingEnd === job.meta.end
    } else if (job.type === 'close') {
      confirmed = election.electionClosed
    } else if (job.type === 'add-voter') {
      confirmed = state.registeredVoterCommitments.member(
        hexToBytes(job.meta.voterCommitment),
      )
    } else if (job.type === 'vote') {
      confirmed = state.voteCommitments.member(
        hexToBytes(job.meta.voteCommitment),
      )
    }

    if (confirmed) {
      const workerStillWaiting =
        activeWorkerJobId === job.id && workerBusy

      try {
        await finishJobFromState(
          job,
          election,
          job.meta.txResult ?? null,
        )

        if (workerStillWaiting && walletWorker) {
          console.log(
            `Ledger confirmed ${job.type} job ${job.id}; recycling the still-waiting wallet worker.`,
          )
          walletWorker.kill('SIGKILL')
        } else {
          pumpWorker()
        }
      } catch (error) {
        markJobFailed(
          job,
          String(error?.message ?? error),
        )
        pumpWorker()
      }
      continue
    }

    const startedAt = job.startedAt ?? job.createdAt

    if (
      Date.now() - startedAt > TX_TIMEOUT_MS &&
      job.status !== 'succeeded'
    ) {
      markJobFailed(
        job,
        'La transacción Midnight excedió el tiempo de espera. La API sigue disponible; el wallet worker se reiniciará.',
      )

      if (activeWorkerJobId === job.id && walletWorker) {
        console.warn(
          `Wallet transaction ${job.id} timed out; restarting worker.`,
        )
        walletWorker.kill('SIGKILL')
      } else {
        pumpWorker()
      }
    }
  }
}

const monitorTimer = setInterval(() => {
  monitorPendingJobs().catch((error) => {
    console.error('Job monitor:', error)
  })
}, 2000)

startWorker()

function candidateName(candidate) {
  return candidate === 1
    ? 'Candidato A (Lista Verde)'
    : 'Candidato B (Lista Azul)'
}

function createVoteCommitment(candidate) {
  const electionId = new Uint8Array(
    crypto
      .createHash('sha256')
      .update('express-voting-demo-2026')
      .digest(),
  )

  const salt = crypto.randomBytes(32)

  return crypto
    .createHash('sha256')
    .update('express-voting:ballot')
    .update(electionId)
    .update(String(candidate))
    .update(salt)
    .digest('hex')
}

const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://express-voting.web.app',
])

const server = http.createServer(async (req, res) => {
  const origin = String(req.headers.origin ?? '')

  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization',
  )
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,OPTIONS',
  )
  res.setHeader('Vary', 'Origin')

  if (req.method === 'OPTIONS') {
    json(res, 204, {})
    return
  }

  try {
    const requestUrl = new URL(
      req.url || '/',
      `http://${req.headers.host || 'localhost'}`,
    )

    if (req.method === 'GET' && requestUrl.pathname === '/health') {
      const state = await getLedger()

      json(res, 200, {
        status: true,
        network: 'preview',
        contractAddress,
        registeredVoters:
          Number(state.registeredVoterCount),
        totalVotes: Number(state.totalVotes),
        walletReady: workerReady,
        walletBusy: workerBusy,
      })
      return
    }

    if (req.method === 'GET' && requestUrl.pathname === '/election') {
      json(res, 200, await getElectionInfo())
      return
    }

    if (
      req.method === 'GET' &&
      requestUrl.pathname.startsWith('/jobs/')
    ) {
      const id = requestUrl.pathname.slice('/jobs/'.length)
      const job = jobs.get(id)

      if (!job) {
        json(res, 404, {
          success: false,
          message: 'Operación no encontrada.',
        })
        return
      }

      json(res, 200, publicJob(job))
      return
    }

    if (
      req.method === 'POST' &&
      requestUrl.pathname === '/eligibility'
    ) {
      const body = await readBody(req)
      const result = verifyEligibility(body.dni)

      json(res, result.eligible ? 200 : 403, result)
      return
    }

    if (
      req.method === 'POST' &&
      requestUrl.pathname === '/vote'
    ) {
      const body = await readBody(req)
      const dni = normalizeDni(body.dni)
      const candidate = Number(body.candidate)
      const voter = findVoter(dni)

      if (!voter) {
        json(res, 403, {
          success: false,
          message:
            'Este DNI no pertenece al padrón privado de esta elección.',
        })
        return
      }

      if (![1, 2].includes(candidate)) {
        json(res, 400, {
          success: false,
          message: 'Opción de voto inválida.',
        })
        return
      }

      if (pendingVoterVotes.has(dni)) {
        json(res, 409, {
          success: false,
          message: 'Este voto ya está siendo procesado en Midnight.',
        })
        return
      }

      const election = await getElectionInfo()

      if (election.status !== 'ABIERTA') {
        json(res, 409, {
          success: false,
          message: 'La votación no está abierta.',
        })
        return
      }

      const voteCommitment = createVoteCommitment(candidate)
      pendingVoterVotes.add(dni)

      const job = createJob(
        'vote',
        {
          dni,
          secret: voter.secret,
          voteCommitment,
        },
        {
          dni,
          candidateName: candidateName(candidate),
          voteCommitment,
        },
      )

      json(res, 202, {
        success: true,
        accepted: true,
        jobId: job.id,
      })
      return
    }

    if (
      req.method === 'POST' &&
      requestUrl.pathname === '/admin/add-voter'
    ) {
      await requireAdmin(req)

      const body = await readBody(req)
      const dni = normalizeDni(body.dni)

      if (!/^\d{7,9}$/.test(dni)) {
        json(res, 400, {
          success: false,
          message: 'Ingresá un DNI válido.',
        })
        return
      }

      if (findVoter(dni) || pendingVoterAdds.has(dni)) {
        json(res, 409, {
          success: false,
          message: 'El votante ya está habilitado o en proceso de alta.',
        })
        return
      }

      const election = await getElectionInfo()

      if (
        election.electionClosed ||
        election.status === 'ABIERTA' ||
        (
          election.votingConfigured &&
          election.now >= election.votingStart
        )
      ) {
        json(res, 409, {
          success: false,
          message:
            'El padrón queda bloqueado una vez iniciada la votación.',
        })
        return
      }

      const newVoter = {
        dni,
        secret: crypto.randomBytes(32).toString('hex'),
      }

      const voterCommitment = Buffer.from(
        pureCircuits.deriveVoterCommitment(
          dniToBytes32(dni),
          hexToBytes(newVoter.secret),
        ),
      ).toString('hex')

      pendingVoterAdds.add(dni)

      const job = createJob(
        'add-voter',
        newVoter,
        {
          dni,
          newVoter,
          voterCommitment,
        },
      )

      json(res, 202, {
        success: true,
        accepted: true,
        jobId: job.id,
      })
      return
    }

    if (
      req.method === 'POST' &&
      requestUrl.pathname === '/admin/schedule'
    ) {
      await requireAdmin(req)

      const body = await readBody(req)
      const start = Number(body.start)
      const end = Number(body.end)

      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start <= 0 ||
        end <= 0 ||
        start >= end
      ) {
        json(res, 400, {
          success: false,
          message: 'Horario de votación inválido.',
        })
        return
      }

      const election = await getElectionInfo()

      if (election.electionClosed) {
        json(res, 409, {
          success: false,
          message: 'La elección está cerrada definitivamente.',
        })
        return
      }

      if (
        election.votingConfigured &&
        election.now >= election.votingStart
      ) {
        json(res, 409, {
          success: false,
          message:
            'El horario queda bloqueado una vez iniciada la votación.',
        })
        return
      }

      const job = createJob(
        'schedule',
        { start, end },
        { start, end },
      )

      json(res, 202, {
        success: true,
        accepted: true,
        jobId: job.id,
      })
      return
    }

    if (
      req.method === 'POST' &&
      requestUrl.pathname === '/admin/close'
    ) {
      await requireAdmin(req)

      const election = await getElectionInfo()

      if (election.electionClosed) {
        json(res, 409, {
          success: false,
          message: 'La elección ya está cerrada.',
        })
        return
      }

      if (!election.votingConfigured) {
        json(res, 409, {
          success: false,
          message: 'Configurá el horario antes de finalizar la elección.',
        })
        return
      }

      const job = createJob('close', {}, {})

      json(res, 202, {
        success: true,
        accepted: true,
        jobId: job.id,
      })
      return
    }

    json(res, 404, { error: 'Not found' })
  } catch (error) {
    console.error(error)

    json(res, error?.statusCode ?? 500, {
      success: false,
      message:
        error?.statusCode === 401 ||
        error?.statusCode === 403
          ? error.message
          : String(
              error?.message ||
              'Midnight service error',
            ),
    })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('')
  console.log('======================================')
  console.log('EXPRESS VOTING PREVIEW API READY ✅')
  console.log('======================================')
  console.log(`http://localhost:${PORT}`)
  console.log(`Contract: ${contractAddress}`)
  console.log('Wallet: background worker (Wallet SDK / Preview)')
})

async function shutdown() {
  shuttingDown = true
  clearInterval(monitorTimer)

  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }

  await new Promise((resolve) => {
    server.close(() => resolve())
  })

  if (walletWorker) {
    walletWorker.kill('SIGTERM')
  }

  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
