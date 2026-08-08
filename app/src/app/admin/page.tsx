'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';

import { auth } from '@/lib/firebase';

import {
  ElectionInfo,
  getElectionInfo,
} from '@/lib/midnightReal';

import {
  adminAddVoter,
  adminCloseElection,
  adminSetSchedule,
} from '@/lib/adminApi';

function toLocalInput(timestamp: number) {
  if (!timestamp) return '';

  const date = new Date(timestamp * 1000);
  const offset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 16);
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [election, setElection] =
    useState<ElectionInfo | null>(null);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [dni, setDni] = useState('');

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [message, setMessage] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const refresh = useCallback(async () => {
    const info = await getElectionInfo();
    setElection(info);

    if (info.votingConfigured) {
      setStart(toLocalInput(info.votingStart));
      setEnd(toLocalInput(info.votingEnd));
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (current) => {
      setUser(current);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    refresh().catch((err) => {
      setError(err?.message || 'No se pudo cargar la elección.');
    });

    const timer = window.setInterval(() => {
      refresh().catch(() => {});
    }, 5000);

    return () => window.clearInterval(timer);
  }, [user, refresh]);

  async function login(event: FormEvent) {
    event.preventDefault();

    setBusy(true);
    setBusyLabel('Validando acceso de administrador...');
    setError(null);

    try {
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      setPassword('');
    } catch {
      setError('Email o contraseña incorrectos.');
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function saveSchedule() {
    setError(null);
    setMessage(null);

    if (!start || !end) {
      setError('Completá inicio y finalización.');
      return;
    }

    const startSeconds =
      Math.floor(new Date(start).getTime() / 1000);

    const endSeconds =
      Math.floor(new Date(end).getTime() / 1000);

    if (startSeconds >= endSeconds) {
      setError(
        'La finalización debe ser posterior al inicio.'
      );
      return;
    }

    setBusy(true);
    setBusyLabel('Generando prueba ZK y enviando el horario a Midnight Preview...');

    try {
      const info = await adminSetSchedule(
        startSeconds,
        endSeconds
      );

      setElection(info);
      setMessage('Horario guardado en Midnight.');
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar.');
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function addVoter() {
    setError(null);
    setMessage(null);

    const normalized = dni.replace(/\D/g, '');

    if (!/^\d{7,9}$/.test(normalized)) {
      setError('Ingresá un DNI válido.');
      return;
    }

    setBusy(true);
    setBusyLabel('Generando commitment y habilitando al votante en Midnight Preview...');

    try {
      await adminAddVoter(normalized);
      setDni('');
      await refresh();
      setMessage('Votante habilitado correctamente.');
    } catch (err: any) {
      setError(
        err?.message || 'No se pudo habilitar el votante.'
      );
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function closeElection() {
    const confirmed = window.confirm(
      '¿Finalizar definitivamente la votación? Esta acción no se puede deshacer.'
    );

    if (!confirmed) return;

    setBusy(true);
    setBusyLabel('Enviando cierre definitivo a Midnight Preview...');
    setError(null);
    setMessage(null);

    try {
      const info = await adminCloseElection();
      setElection(info);
      setMessage('Votación finalizada en Midnight.');
    } catch (err: any) {
      setError(
        err?.message || 'No se pudo finalizar la votación.'
      );
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  if (!authReady) {
    return (
      <main style={{ padding: 32 }}>
        Cargando administración...
      </main>
    );
  }

  if (!user) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
        }}
      >
        <form
          onSubmit={login}
          className="glass-card-glow"
          style={{
            width: '100%',
            maxWidth: 420,
            padding: 32,
          }}
        >
          <div
            style={{
              color: '#a78bfa',
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 8,
            }}
          >
            EXPRESS VOTING
          </div>

          <h1 style={{ fontSize: 28 }}>
            Administración
          </h1>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: 13,
              marginTop: 6,
              marginBottom: 24,
            }}
          >
            Acceso exclusivo del administrador electoral.
          </p>

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            required
            style={inputStyle}
          />

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Contraseña"
            required
            style={{
              ...inputStyle,
              marginTop: 12,
            }}
          />

          {error && (
            <div style={errorStyle}>
              {error}
            </div>
          )}

          <button
            className="btn-primary"
            disabled={busy}
            style={{
              width: '100%',
              padding: 15,
              marginTop: 18,
              fontSize: 15,
            }}
          >
            {busy ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '28px 18px 60px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 900,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                color: '#a78bfa',
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              EXPRESS VOTING
            </div>
            <h1 style={{ fontSize: 28 }}>
              Panel administrador
            </h1>
          </div>

          <button
            onClick={() => signOut(auth)}
            style={secondaryButton}
          >
            Cerrar sesión
          </button>
        </div>

        {busy && busyLabel && (
          <div style={processingStyle}>
            <span className="processing-dot" />
            <div>
              <strong>Operación en curso</strong>
              <div style={{ marginTop: 3 }}>{busyLabel}</div>
              <div style={{ marginTop: 4, opacity: 0.75, fontSize: 11 }}>
                El panel sigue consultando el ledger mientras Wallet SDK procesa la transacción.
              </div>
            </div>
          </div>
        )}

        {message && (
          <div style={successStyle}>
            {message}
          </div>
        )}

        {error && (
          <div style={errorStyle}>
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <Stat
            label="Estado"
            value={election?.status ?? '...'}
          />
          <Stat
            label="Votantes habilitados"
            value={election?.registeredVoters ?? 0}
          />
          <Stat
            label="Votos emitidos"
            value={election?.totalVotes ?? 0}
          />
          <Stat
            label="Participación"
            value={`${(election?.participation ?? 0).toFixed(1)}%`}
          />
        </div>

        <section
          className="glass-card"
          style={{ padding: 24, marginBottom: 18 }}
        >
          <h2 style={{ marginBottom: 18 }}>
            Horario de votación
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            <label>
              <div style={labelStyle}>Inicio</div>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                style={inputStyle}
              />
            </label>

            <label>
              <div style={labelStyle}>Finalización</div>
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>

          <button
            onClick={saveSchedule}
            disabled={
              busy ||
              election?.electionClosed ||
              Boolean(
                election?.votingConfigured &&
                election.now >= election.votingStart
              )
            }
            className="btn-primary"
            style={{
              marginTop: 18,
              padding: '13px 20px',
            }}
          >
            {busy ? 'Procesando...' : 'Guardar horario en Midnight'}
          </button>

          {election?.votingConfigured &&
            election.now >= election.votingStart &&
            !election.electionClosed && (
              <div
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  marginTop: 10,
                }}
              >
                El horario queda bloqueado una vez iniciada la votación.
              </div>
            )}
        </section>

        <section
          className="glass-card"
          style={{ padding: 24, marginBottom: 18 }}
        >
          <h2>Padrón electoral</h2>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: 12,
              margin: '7px 0 16px',
            }}
          >
            El DNI permanece en el padrón privado. Midnight recibe solamente su commitment.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <input
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="DNI"
              inputMode="numeric"
              style={{
                ...inputStyle,
                flex: '1 1 220px',
              }}
            />

            <button
              onClick={addVoter}
              disabled={
                busy ||
                election?.status === 'ABIERTA' ||
                election?.status === 'FINALIZADA'
              }
              className="btn-primary"
              style={{
                padding: '13px 20px',
              }}
            >
              {busy ? 'Procesando...' : '+ Habilitar votante'}
            </button>
          </div>
        </section>

        <section
          style={{
            padding: 24,
            borderRadius: 20,
            border: '1px solid rgba(239,68,68,0.25)',
            background: 'rgba(239,68,68,0.05)',
          }}
        >
          <h2 style={{ color: '#fca5a5' }}>
            Finalizar elección
          </h2>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: 12,
              margin: '7px 0 16px',
            }}
          >
            El cierre es definitivo y queda registrado en Midnight.
          </p>

          <button
            onClick={closeElection}
            disabled={
              busy ||
              !election?.votingConfigured ||
              election?.status === 'FINALIZADA'
            }
            style={{
              border: 0,
              borderRadius: 14,
              padding: '13px 20px',
              background: '#dc2626',
              color: 'white',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {busy ? 'PROCESANDO...' : 'FINALIZAR VOTACIÓN AHORA'}
          </button>
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      className="glass-card"
      style={{ padding: 18 }}
    >
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 11,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          marginTop: 5,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '13px 14px',
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.15)',
  background: 'rgba(255,255,255,0.04)',
  color: '#f1f5f9',
  outline: 'none',
  fontSize: 14,
};

const labelStyle = {
  color: '#94a3b8',
  fontSize: 12,
  marginBottom: 7,
};

const secondaryButton = {
  border: '1px solid rgba(148,163,184,0.15)',
  borderRadius: 12,
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.04)',
  color: '#cbd5e1',
  cursor: 'pointer',
};

const processingStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: 14,
  marginBottom: 16,
  borderRadius: 14,
  background: 'rgba(139,92,246,0.08)',
  border: '1px solid rgba(139,92,246,0.25)',
  color: '#c4b5fd',
  fontSize: 13,
};

const successStyle = {
  padding: 14,
  marginBottom: 16,
  borderRadius: 14,
  background: 'rgba(16,185,129,0.08)',
  border: '1px solid rgba(16,185,129,0.2)',
  color: '#6ee7b7',
  fontSize: 13,
};

const errorStyle = {
  padding: 14,
  marginTop: 14,
  marginBottom: 10,
  borderRadius: 14,
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.2)',
  color: '#fca5a5',
  fontSize: 13,
};
