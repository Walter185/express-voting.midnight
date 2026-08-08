const MIDNIGHT_API_URL =
  process.env.NEXT_PUBLIC_MIDNIGHT_API_URL ||
  ['http:', '', 'localhost:8789'].join('/');

export interface MidnightHealth {
  status: boolean;
  network: string;
  contractAddress: string;
  registeredVoters: number;
  totalVotes: number;
  walletReady?: boolean;
  walletBusy?: boolean;
}

export type ElectionStatus =
  | 'SIN_CONFIGURAR'
  | 'PROGRAMADA'
  | 'ABIERTA'
  | 'FINALIZADA';

export interface ElectionInfo {
  status: ElectionStatus;
  network: string;
  contractAddress: string;
  registeredVoters: number;
  totalVotes: number;
  participation: number;
  votingConfigured: boolean;
  electionClosed: boolean;
  votingStart: number;
  votingEnd: number;
  now: number;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  message?: string;
}

export interface VoteSubmissionResult {
  success: boolean;
  candidateName: string;
  contractAddress: string;
  voteCommitment: string;
  totalVotes: number;
  transaction?: {
    txId?: string | null;
    blockHeight?: number | null;
  } | null;
}

export type MidnightJobStatus =
  | 'queued'
  | 'running'
  | 'confirming'
  | 'succeeded'
  | 'failed';

export interface MidnightJob<T = unknown> {
  jobId: string;
  type: string;
  status: MidnightJobStatus;
  createdAt: number;
  updatedAt: number;
  result: T | null;
  error: string | null;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readJson(response: Response) {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function checkMidnightHealth(): Promise<MidnightHealth> {
  const response = await fetch(`${MIDNIGHT_API_URL}/health`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Midnight service unavailable');
  }

  return response.json();
}

export async function getElectionInfo(): Promise<ElectionInfo> {
  const response = await fetch(`${MIDNIGHT_API_URL}/election`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('No se pudo obtener el estado de la elección');
  }

  return response.json();
}

export async function getMidnightJob<T>(
  jobId: string,
  bearerToken?: string
): Promise<MidnightJob<T>> {
  const headers: Record<string, string> = {};

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const response = await fetch(
    `${MIDNIGHT_API_URL}/jobs/${encodeURIComponent(jobId)}`,
    {
      cache: 'no-store',
      headers,
    }
  );

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      data?.message || 'No se pudo consultar la operación Midnight.'
    );
  }

  return data as MidnightJob<T>;
}

export async function waitForMidnightJob<T>(
  jobId: string,
  bearerToken?: string,
  timeoutMs = 180_000
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const job = await getMidnightJob<T>(jobId, bearerToken);

    if (job.status === 'succeeded' && job.result) {
      return job.result;
    }

    if (job.status === 'failed') {
      throw new Error(
        job.error || 'La operación fue rechazada por Midnight.'
      );
    }

    await sleep(1_200);
  }

  throw new Error(
    'Midnight continúa procesando la operación. Revisá el estado de la elección antes de reintentar.'
  );
}

export async function verifyVoterEligibility(
  dni: string
): Promise<EligibilityResult> {
  const response = await fetch(`${MIDNIGHT_API_URL}/eligibility`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dni }),
  });

  const data = await readJson(response);

  if (response.status === 403) {
    return data as EligibilityResult;
  }

  if (!response.ok) {
    throw new Error(
      data?.message || 'Eligibility verification failed'
    );
  }

  return data as EligibilityResult;
}

export async function submitRealVote(
  dni: string,
  candidate: 1 | 2
): Promise<VoteSubmissionResult> {
  const response = await fetch(`${MIDNIGHT_API_URL}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dni, candidate }),
  });

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      data?.message || 'Midnight rejected the vote'
    );
  }

  if (response.status === 202 && data?.jobId) {
    return waitForMidnightJob<VoteSubmissionResult>(
      data.jobId
    );
  }

  return data as VoteSubmissionResult;
}

export function getMidnightApiUrl(): string {
  return MIDNIGHT_API_URL;
}
