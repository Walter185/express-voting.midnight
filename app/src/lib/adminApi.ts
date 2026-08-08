import { auth } from './firebase';
import {
  ElectionInfo,
  getMidnightApiUrl,
  waitForMidnightJob,
} from './midnightReal';

async function adminRequest<T>(
  path: string,
  body?: unknown
): Promise<T> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('No hay una sesión de administrador activa.');
  }

  const token = await user.getIdToken();

  const response = await fetch(
    `${getMidnightApiUrl()}${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    }
  );

  const text = await response.text();
  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data?.message || 'Operación administrativa rechazada.'
    );
  }

  if (response.status === 202 && data?.jobId) {
    return waitForMidnightJob<T>(data.jobId, token);
  }

  return data as T;
}

export async function adminSetSchedule(
  start: number,
  end: number
): Promise<ElectionInfo> {
  const result = await adminRequest<{
    success: boolean;
    election: ElectionInfo;
  }>(
    '/admin/schedule',
    { start, end }
  );

  return result.election;
}

export async function adminCloseElection():
Promise<ElectionInfo> {
  const result = await adminRequest<{
    success: boolean;
    election: ElectionInfo;
  }>(
    '/admin/close'
  );

  return result.election;
}

export async function adminAddVoter(
  dni: string
): Promise<{
  success: boolean;
  registeredVoters: number;
  status: string;
}> {
  return adminRequest(
    '/admin/add-voter',
    { dni }
  );
}
