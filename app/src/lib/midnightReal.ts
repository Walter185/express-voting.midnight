const MIDNIGHT_API_URL =
  process.env.NEXT_PUBLIC_MIDNIGHT_API_URL ||
  ['http:', '', 'localhost:8789'].join('/');

export interface MidnightHealth {
  status: boolean;
  network: string;
  contractAddress: string;
  registeredVoters: number;
  totalVotes: number;
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

export async function verifyVoterEligibility(
  dni: string
): Promise<EligibilityResult> {
  const response = await fetch(`${MIDNIGHT_API_URL}/eligibility`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dni }),
  });

  const data = await response.json();

  if (response.status === 403) {
    return data;
  }

  if (!response.ok) {
    throw new Error(data?.message || 'Eligibility verification failed');
  }

  return data;
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || 'Midnight rejected the vote');
  }

  return data;
}
