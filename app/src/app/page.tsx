'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DniArgentinaData } from '@/lib/argentinaDni';
import { parseArgentineDniPdf417 } from '@/lib/dniScanner';
import { startNativeCamera, CameraControl } from '@/lib/cameraScanner';
import {
  checkMidnightHealth,
  verifyVoterEligibility,
  submitRealVote,
  VoteSubmissionResult,
} from '@/lib/midnightReal';

type AppStep = 'idle' | 'scanning' | 'verifying' | 'voting' | 'submitting' | 'done';

export default function ExpressVotingPage() {
  const [step, setStep] = useState<AppStep>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<CameraControl | null>(null);

  const [dniData, setDniData] = useState<DniArgentinaData | null>(null);
  const [personName, setPersonName] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<1 | 2>(1);

  const [result, setResult] = useState<VoteSubmissionResult | null>(null);
  const [ledger, setLedger] = useState({
    registeredVoters: 0,
    totalVotes: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const [serverOnline, setServerOnline] = useState(false);

  useEffect(() => {
    checkMidnightHealth()
      .then((r) => {
        setServerOnline(r.status);
        setLedger({
          registeredVoters: r.registeredVoters,
          totalVotes: r.totalVotes,
        });
      })
      .catch(() => setServerOnline(false));

    return () => stopCamera();
  }, []);

  const stopCamera = useCallback(() => {
    cameraRef.current?.stop();
    cameraRef.current = null;
  }, []);

  // The main scan button action
  const handleScan = async () => {
    setError(null);
    setStep('scanning');

    // Small delay to let the video element render
    await new Promise((r) => setTimeout(r, 150));

    if (!videoRef.current) {
      setError('No se pudo inicializar la cámara.');
      setStep('idle');
      return;
    }

    try {
      const ctrl = await startNativeCamera(videoRef.current, (code) => {
        onCodeDetected(code);
      });
      cameraRef.current = ctrl;
    } catch (err: any) {
      setError(err?.message || 'No se pudo acceder a la cámara.');
      setStep('idle');
    }
  };

  const maskDni = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return `••••${digits.slice(-4)}`;
  };

  // When a barcode is detected automatically
  const onCodeDetected = async (raw: string) => {
    stopCamera();
    setError(null);

    const parsed = parseArgentineDniPdf417(raw);

    if (!parsed) {
      setError('Código no reconocido. Volvé a enfocar el código de barras del dorso de tu DNI.');
      setStep('idle');
      return;
    }

    setDniData(parsed.data);
    setPersonName(parsed.fullName);
    setStep('verifying');

    try {
      const eligibility = await verifyVoterEligibility(
        String(parsed.data.dniNumber)
      );

      if (!eligibility.eligible) {
        setError(
          eligibility.message ||
          'Este DNI no pertenece al padrón privado de esta elección.'
        );
        setStep('idle');
        return;
      }

      setStep('voting');
    } catch (err: any) {
      setError(
        err?.message ||
        'No se pudo verificar la elegibilidad en Midnight.'
      );
      setStep('idle');
    }
  };

  // Cast the vote
  const handleVote = async () => {
    if (!dniData) return;

    setError(null);
    setStep('submitting');

    try {
      const res = await submitRealVote(
        String(dniData.dniNumber),
        selectedCandidate
      );

      setResult(res);
      setLedger((current) => ({
        ...current,
        totalVotes: res.totalVotes,
      }));
      setStep('done');
    } catch (err: any) {
      setError(
        err?.message ||
        'El contrato Midnight rechazó el voto.'
      );
      setStep('voting');
    }
  };

  const handleReset = () => {
    stopCamera();
    setStep('idle');
    setDniData(null);
    setResult(null);
    setError(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', fontSize: 11, fontWeight: 600, color: '#a78bfa', letterSpacing: 0.5, marginBottom: 12 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Midnight Network • ZK Privacy
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, background: 'linear-gradient(135deg, #f1f5f9, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.1 }}>
            Express Voting
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
            Escaneá tu DNI argentino para votar de forma anónima y verificable.
          </p>
        </div>

        {/* Main Card */}
        <div className="glass-card-glow" style={{ padding: 32, position: 'relative', overflow: 'hidden' }}>

          {/* IDLE: Show scan button */}
          {step === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
              <div style={{ width: 88, height: 88, borderRadius: 28, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(139, 92, 246, 0.3)' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>Escanear DNI</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Se abrirá la cámara y se detectará el código automáticamente.
                </p>
              </div>
              <button className="btn-primary" onClick={handleScan} style={{ width: '100%', padding: '16px 24px', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Escanear DNI
              </button>
            </div>
          )}

          {/* SCANNING: Camera viewfinder */}
          {step === 'scanning' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="viewfinder">
                <video ref={videoRef} autoPlay playsInline muted />
                <div className="viewfinder-overlay">
                  <div className="viewfinder-corners" />
                  <div className="animate-scan-sweep" />
                  <div style={{ position: 'absolute', bottom: 20, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', padding: '8px 16px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'pulse-ring 1.5s ease infinite' }}><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>
                    Enfocá el código de barras del dorso
                  </div>
                </div>
              </div>
              <button onClick={() => { stopCamera(); setStep('idle'); }} style={{ width: '100%', padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          )}

          {/* VERIFYING: Loading spinner */}
          {step === 'verifying' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'pulse-ring 1.2s ease infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>Verificando padrón privado...</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Verificando elegibilidad mediante el contrato Midnight.
                </p>
              </div>
            </div>
          )}

          {/* VOTING: Candidate selection */}
          {(step === 'voting' || step === 'submitting') && dniData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Verified badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{personName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }} className="font-mono">
                    DNI {maskDni(String(dniData.dniNumber))} • Padrón privado ✓
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Elegí tu candidato:
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div
                  className={`candidate-card ${selectedCandidate === 1 ? 'selected-a' : ''}`}
                  onClick={() => step === 'voting' && setSelectedCandidate(1)}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', letterSpacing: 0.5, marginBottom: 8 }}>LISTA VERDE</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Candidato A</div>
                  {selectedCandidate === 1 && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 8 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  )}
                </div>
                <div
                  className={`candidate-card ${selectedCandidate === 2 ? 'selected-b' : ''}`}
                  onClick={() => step === 'voting' && setSelectedCandidate(2)}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', letterSpacing: 0.5, marginBottom: 8 }}>LISTA AZUL</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Candidato B</div>
                  {selectedCandidate === 2 && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 8 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  )}
                </div>
              </div>

              <button className="btn-primary" onClick={handleVote} disabled={step === 'submitting'} style={{ width: '100%', padding: '16px', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {step === 'submitting' ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'pulse-ring 1s ease infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    Emitiendo prueba ZK...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Emitir Voto Privado
                  </>
                )}
              </button>
            </div>
          )}

          {/* DONE: Success */}
          {step === 'done' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '8px 0' }}>
              <div style={{ width: 72, height: 72, borderRadius: 999, background: 'rgba(16, 185, 129, 0.1)', border: '2px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: 22, fontWeight: 800 }}>¡Voto Registrado!</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  Tu voto fue emitido de forma anónima en Midnight Network.
                </p>
              </div>

              <div style={{ width: '100%', padding: 16, borderRadius: 16, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Opción elegida</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: selectedCandidate === 1 ? '#10b981' : '#3b82f6' }}>{result.candidateName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, marginBottom: 4 }}>Vote commitment</div>
                <div className="font-mono" style={{ fontSize: 10, color: '#a78bfa', wordBreak: 'break-all', lineHeight: 1.6 }}>{result.voteCommitment}</div>
              </div>

              <button className="btn-primary" onClick={handleReset} style={{ width: '100%', padding: '14px', fontSize: 14 }}>
                Escanear otro DNI
              </button>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div style={{ padding: '14px 18px', borderRadius: 16, background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: '#fca5a5' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>{error}</div>
          </div>
        )}

        {/* Ledger bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            <span style={{ fontWeight: 600 }}>Ledger Midnight</span>
          </div>
          <div className="font-mono" style={{ display: 'flex', gap: 16, fontWeight: 700, fontSize: 13 }}>
            <span style={{ color: '#a78bfa' }}>
              Votos emitidos: {ledger.totalVotes}
            </span>
          </div>
        </div>

        {/* Server status */}
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 999, background: serverOnline ? '#10b981' : '#f59e0b' }} />
          <span>Midnight {serverOnline ? 'conectado' : 'offline'}</span>
        </div>
      </div>
    </div>
  );
}
