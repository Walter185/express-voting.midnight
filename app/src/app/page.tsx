'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Vote,
  CheckCircle2,
  Scan,
  Database,
  Server,
  RefreshCw,
  EyeOff,
  Sparkles,
  UserCheck,
  Camera,
  ArrowRight,
  AlertTriangle,
  Award,
  VideoOff,
  Upload,
} from 'lucide-react';
import {
  DniArgentinaData,
  verifyDniWithGovernmentApi,
  computeDniNullifier,
  GovernmentValidationResult,
} from '@/lib/argentinaDni';
import { parseArgentineDniPdf417 } from '@/lib/dniScanner';
import { startNativeCamera, CameraControl } from '@/lib/cameraScanner';
import {
  checkProofServerHealth,
  submitVoteToMidnight,
  getPublicLedgerVotes,
  VoteSubmissionResult,
} from '@/lib/midnight';

export default function MidnightUltraSimpleVotingPage() {
  // Estado del flujo: 'idle' | 'camera' | 'verifying' | 'voting' | 'voted'
  const [step, setStep] = useState<'idle' | 'camera' | 'verifying' | 'voting' | 'voted'>('idle');

  // Referencia de la cámara nativa
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraControlRef = useRef<CameraControl | null>(null);

  // Datos extraídos del DNI
  const [extractedDni, setExtractedDni] = useState<DniArgentinaData | null>(null);
  const [extractedName, setExtractedName] = useState<string>('');

  // Selección de Candidato (1 = Candidato A, 2 = Candidato B)
  const [selectedCandidate, setSelectedCandidate] = useState<1 | 2>(1);

  // Estados de la app
  const [isVerifyingRenaper, setIsVerifyingRenaper] = useState(false);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [serverStatus, setServerStatus] = useState<{ status: boolean; message: string } | null>(null);

  // Resultados ZK
  const [dniNullifier, setDniNullifier] = useState<string | null>(null);
  const [voteResult, setVoteResult] = useState<VoteSubmissionResult | null>(null);
  const [ledgerVotes, setLedgerVotes] = useState(getPublicLedgerVotes());
  const [error, setError] = useState<string | null>(null);

  // Salud del Proof Server
  useEffect(() => {
    async function initHealthCheck() {
      const res = await checkProofServerHealth();
      setServerStatus(res);
    }
    initHealthCheck();

    return () => {
      stopCamera();
    };
  }, []);

  // Botón Principal: Abrir cámara e iniciar escaneo automático
  const handleOpenScanner = async () => {
    setError(null);
    setStep('camera');

    setTimeout(async () => {
      if (videoRef.current) {
        try {
          const ctrl = await startNativeCamera(videoRef.current, (scannedCode) => {
            // Detección automática instantánea sin presionar nada más
            handleAutoDetectDni(scannedCode);
          });
          cameraControlRef.current = ctrl;
        } catch (err: any) {
          setError('No se pudo acceder a la cámara. Asegúrate de permitir los permisos en el navegador.');
          setStep('idle');
        }
      }
    }, 100);
  };

  // Detener transmisión de la cámara
  const stopCamera = () => {
    if (cameraControlRef.current) {
      cameraControlRef.current.stop();
      cameraControlRef.current = null;
    }
  };

  // Detección y verificación automática de DNI escaneado
  const handleAutoDetectDni = async (rawCode: string) => {
    stopCamera();
    setError(null);

    const parsed = parseArgentineDniPdf417(rawCode);
    if (!parsed) {
      setError('Código no reconocido. Enfoca el código de barras PDF417 del dorso del DNI.');
      setStep('idle');
      return;
    }

    setExtractedDni(parsed.data);
    setExtractedName(parsed.fullName);
    setIsVerifyingRenaper(true);
    setStep('verifying');

    try {
      // Verificación en RENAPER / Padrón Electoral
      const res = await verifyDniWithGovernmentApi(parsed.data);

      if (!res.valid) {
        setError(res.message);
        setStep('idle');
        setIsVerifyingRenaper(false);
        return;
      }

      // Generar Nullifier Criptográfico ZK
      const { nullifierHex } = await computeDniNullifier(parsed.data);
      setDniNullifier(nullifierHex);

      // Pasar automáticamente a la pantalla de Votación
      setIsVerifyingRenaper(false);
      setStep('voting');
    } catch (err: any) {
      setError(err?.message || 'Error durante la verificación en RENAPER.');
      setStep('idle');
      setIsVerifyingRenaper(false);
    }
  };

  // Carga alternativa de archivo si se arrastra un DNI
  const handleFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) {
          handleAutoDetectDni(text);
        }
      };
      reader.readAsText(file);
    }
  };

  // Emitir Voto Privado ZK en Midnight Network
  const handleCastVote = async () => {
    if (!extractedDni || !dniNullifier) return;

    setError(null);
    setIsSubmittingVote(true);

    try {
      const birthYear = new Date(extractedDni.birthDate).getFullYear();

      const result = await submitVoteToMidnight(
        dniNullifier,
        selectedCandidate,
        birthYear
      );

      setVoteResult(result);
      setLedgerVotes(result.updatedLedger);
      setStep('voted');
    } catch (err: any) {
      setError(err?.message || 'Error al emitir el voto ZK');
    } finally {
      setIsSubmittingVote(false);
    }
  };

  // Reiniciar flujo para nuevo votante
  const handleResetAll = () => {
    stopCamera();
    setStep('idle');
    setExtractedDni(null);
    setDniNullifier(null);
    setVoteResult(null);
    setError(null);
  };

  return (
    <main className="min-h-screen midnight-bg flex flex-col items-center justify-center p-4">
      {/* Contenedor Principal Elegante */}
      <div className="w-full max-w-xl mx-auto space-y-6">
        {/* Encabezado Minimalista */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Midnight Network • Privacidad ZK</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Votación Privada Express
          </h1>
          <p className="text-sm text-slate-400">
            Escanea tu DNI Argentino para verificar en RENAPER y emitir tu voto anónimo.
          </p>
        </div>

        {/* Card Principal Glassmorphic */}
        <div className="glass-panel-glow rounded-3xl p-8 border border-purple-500/20 shadow-2xl relative overflow-hidden">
          {/* PASO 1: Inicio / Botón Escanear */}
          {step === 'idle' && (
            <div className="text-center space-y-6 py-4">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-purple-600/30">
                <Scan className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-bold text-white">Verificación de DNI</h2>
                <p className="text-xs text-slate-400">
                  Presiona el botón para abrir la cámara y detectar automáticamente tu DNI.
                </p>
              </div>

              {/* Botón Principal Destacado */}
              <button
                type="button"
                onClick={handleOpenScanner}
                className="w-full py-4 px-8 rounded-2xl font-bold text-lg text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-xl shadow-purple-600/30 transition-all duration-300 transform hover:scale-[1.02] flex items-center justify-center gap-3"
              >
                <Camera className="w-6 h-6" />
                <span>Escanear DNI</span>
              </button>

              <div className="pt-2">
                <label className="text-xs text-slate-500 hover:text-slate-400 cursor-pointer underline flex items-center justify-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  <span>O sube una imagen de tu DNI</span>
                  <input type="file" accept="image/*,.txt" onChange={handleFileDrop} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {/* PASO 2: Cámara Abierta con Detección Automática */}
          {step === 'camera' && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-purple-500 aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-2 border-dashed border-purple-400/80 m-6 rounded-xl pointer-events-none flex items-center justify-center">
                  <div className="bg-black/70 backdrop-blur-md text-purple-300 px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2 shadow-lg">
                    <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                    <span>Enfoca el código del dorso del DNI...</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setStep('idle');
                }}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors border border-slate-700"
              >
                Cancelar Cámara
              </button>
            </div>
          )}

          {/* PASO 3: Verificando RENAPER Automáticamente */}
          {step === 'verifying' && (
            <div className="text-center space-y-4 py-8">
              <RefreshCw className="w-12 h-12 mx-auto text-purple-400 animate-spin" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">Verificando en RENAPER...</h3>
                <p className="text-xs text-purple-300">
                  Comprobando validez en Padrón Electoral y mayoría de edad (&gt;= 18 años).
                </p>
              </div>
            </div>
          )}

          {/* PASO 4: Votación de Candidatos */}
          {(step === 'voting' || step === 'voted') && extractedDni && (
            <div className="space-y-6">
              {/* Badge DNI Validado */}
              <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                  <div>
                    <span className="font-bold text-white">{extractedName}</span>
                    <span className="text-emerald-400 block text-[11px]">DNI Validado en RENAPER ✓</span>
                  </div>
                </div>
                <button
                  onClick={handleResetAll}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cambiar
                </button>
              </div>

              {/* Opciones de Candidatos */}
              {step === 'voting' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-300">Selecciona tu Voto Secreto:</h3>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Candidato A */}
                    <button
                      type="button"
                      onClick={() => setSelectedCandidate(1)}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        selectedCandidate === 1
                          ? 'bg-emerald-950/50 border-emerald-500 shadow-lg shadow-emerald-500/10'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        Lista Verde
                      </span>
                      <h4 className="text-base font-bold text-white mt-2">Candidato A</h4>
                    </button>

                    {/* Candidato B */}
                    <button
                      type="button"
                      onClick={() => setSelectedCandidate(2)}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        selectedCandidate === 2
                          ? 'bg-blue-950/50 border-blue-500 shadow-lg shadow-blue-500/10'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                        Lista Azul
                      </span>
                      <h4 className="text-base font-bold text-white mt-2">Candidato B</h4>
                    </button>
                  </div>

                  {/* Botón de Votación Final */}
                  <button
                    type="button"
                    onClick={handleCastVote}
                    disabled={isSubmittingVote}
                    className="w-full py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2"
                  >
                    {isSubmittingVote ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Emitiendo Prueba ZK en Midnight...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        <span>Emitir Voto Privado ZK</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Confirmación del Voto Registrado */}
              {step === 'voted' && voteResult && (
                <div className="space-y-4 text-center py-2">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Award className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-extrabold text-white">¡Voto Registrado con Éxito!</h3>

                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left text-xs space-y-2">
                    <div>
                      <span className="text-slate-400">Opción Elegida:</span>
                      <div className="font-bold text-emerald-400">{voteResult.candidateName}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Prueba ZK:</span>
                      <div className="font-mono-code text-[11px] text-purple-300 break-all">{voteResult.proofHash}</div>
                    </div>
                  </div>

                  <button
                    onClick={handleResetAll}
                    className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors"
                  >
                    Escanear Otro DNI
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mensajes de Error */}
          {error && (
            <div className="mt-4 p-4 rounded-2xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* Escrutinio Público del Ledger */}
        <div className="glass-panel rounded-2xl p-4 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400" />
            <span className="font-semibold">Ledger Público Midnight:</span>
          </div>
          <div className="flex gap-4 font-mono-code font-bold">
            <span className="text-emerald-400">A: {ledgerVotes.votesCandidateA}</span>
            <span className="text-blue-400">B: {ledgerVotes.votesCandidateB}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
