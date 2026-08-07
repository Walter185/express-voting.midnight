import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'
import {
  scanArgentineDni,
  type DniScanResult,
} from './dniScanner'
import DniCamera from './DniCamera'

type Step = 'scan' | 'verifying' | 'eligible' | 'submitted'
type VoteOption = 'LIST_A' | 'LIST_B' | 'BLANK' | null

function App() {
  const [step, setStep] = useState<Step>('scan')
  const [selectedVote, setSelectedVote] = useState<VoteOption>(null)
  const [documentName, setDocumentName] = useState('')
  const [detectedDni, setDetectedDni] = useState('')
  const [barcodeFormat, setBarcodeFormat] = useState('')
  const [scanError, setScanError] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startScan = () => {
    setScanError('')
    setCameraOpen(true)
  }

  const handleCameraDetected = (result: DniScanResult) => {
    setCameraOpen(false)
    setDocumentName('camera')
    setDetectedDni(result.documentNumber)
    setBarcodeFormat(result.format)
    setScanError('')
    setStep('verifying')

    window.setTimeout(() => {
      setStep('eligible')
    }, 1000)
  }

  const handleDocument = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]

    if (!file) return

    setDocumentName(file.name)
    setDetectedDni('')
    setBarcodeFormat('')
    setScanError('')
    setStep('verifying')

    try {
      const result = await scanArgentineDni(file)

      setDetectedDni(result.documentNumber)
      setBarcodeFormat(result.format)

      // Temporary delay only for the demo UI.
      // Next step: replace this with the Midnight eligibility check.
      await new Promise((resolve) => window.setTimeout(resolve, 1000))

      setStep('eligible')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo leer el DNI.'

      setScanError(message)
      setStep('scan')

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const confirmVote = () => {
    if (!selectedVote) return

    // DEMO ONLY:
    // Later this will call the Compact/Midnight voting circuit.
    setStep('submitted')
  }

  const resetDemo = () => {
    setSelectedVote(null)
    setDocumentName('')
    setDetectedDni('')
    setBarcodeFormat('')
    setScanError('')
    setStep('scan')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <main className="page">
      <div className="orb orb-left" />
      <div className="orb orb-right" />

      {cameraOpen && (
        <DniCamera
          onDetected={handleCameraDetected}
          onClose={() => setCameraOpen(false)}
        />
      )}

      <section className="app-shell">
        <header className="header">
          <div className="brand">
            <div className="brand-icon">EV</div>

            <div>
              <p className="brand-overline">MIDNIGHT NETWORK</p>
              <h1>Express Voting</h1>
            </div>
          </div>

          <div className="privacy-status">
            <span />
            Private
          </div>
        </header>

        {step === 'scan' && (
          <section className="content">
            <div className="step-label">IDENTITY VERIFICATION</div>

            <h2>Scan your DNI</h2>

            <p className="subtitle">
              Scan your identity document to verify your eligibility to
              participate in this election.
            </p>

            <div className="scanner" onClick={startScan}>
              <div className="scanner-corner corner-tl" />
              <div className="scanner-corner corner-tr" />
              <div className="scanner-corner corner-bl" />
              <div className="scanner-corner corner-br" />

              <div className="dni-card">
                <div className="dni-photo">
                  <div className="person-head" />
                  <div className="person-body" />
                </div>

                <div className="dni-lines">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <strong>Scan identity document</strong>
              <span className="scan-help">
                Use your camera or choose an image
              </span>
            </div>

            <input
              ref={fileInputRef}
              className="hidden-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleDocument}
            />

            <button className="primary-button" onClick={startScan}>
              <span className="camera-icon">▣</span>
              Scan DNI
            </button>

            {scanError && (
              <div className="scan-error">
                <strong>Could not read DNI</strong>
                <span>{scanError}</span>
              </div>
            )}

            <div className="privacy-note">
              <div className="shield">✓</div>

              <div>
                <strong>Your identity stays private</strong>
                <p>
                  Personal document information will be used only to generate
                  the proof required for voting and will not be published
                  on-chain.
                </p>
              </div>
            </div>
          </section>
        )}

        {step === 'verifying' && (
          <section className="content status-screen">
            <div className="verification-animation">
              <div className="spinner" />
              <div className="verify-icon">ID</div>
            </div>

            <div className="step-label">VERIFYING IDENTITY</div>

            <h2>Checking voting eligibility</h2>

            <p className="subtitle">
              Express Voting is verifying that this voting credential is valid
              and has not been used before.
            </p>

            <div className="checking-list">
              <div>
                <span className="check-loader" />
                Identity credential
              </div>

              <div>
                <span className="check-loader delayed" />
                Voting eligibility
              </div>

              <div>
                <span className="check-loader delayed-two" />
                Previous vote check
              </div>
            </div>

            {documentName && (
              <p className="local-file">
                {detectedDni ? (
                  <>
                    DNI detected: ••••{detectedDni.slice(-4)}
                    {barcodeFormat && ` · ${barcodeFormat}`}
                  </>
                ) : (
                  <>Reading document locally...</>
                )}
              </p>
            )}
          </section>
        )}

        {step === 'eligible' && (
          <section className="content">
            <div className="success-header">
              <div className="success-icon">✓</div>

              <div>
                <div className="step-label success-label">
                  ELIGIBLE TO VOTE
                </div>
                <h2>Cast your vote</h2>
              </div>
            </div>

            <p className="subtitle vote-subtitle">
              Your voting right has been verified. Select one option below.
            </p>

            <div className="eligibility">
              <div>
                <span>✓</span>
                Identity verified
              </div>

              <div>
                <span>✓</span>
                Eligible voter
              </div>

              <div>
                <span>✓</span>
                Voting right unused
              </div>

              {detectedDni && (
                <div>
                  <span>✓</span>
                  DNI ••••{detectedDni.slice(-4)}
                </div>
              )}
            </div>

            <div className="vote-options">
              <button
                className={`vote-card ${
                  selectedVote === 'LIST_A' ? 'selected' : ''
                }`}
                onClick={() => setSelectedVote('LIST_A')}
              >
                <span className="radio" />
                <div className="list-mark list-a">A</div>

                <div>
                  <strong>LISTA A</strong>
                  <span>Candidate list A</span>
                </div>
              </button>

              <button
                className={`vote-card ${
                  selectedVote === 'LIST_B' ? 'selected' : ''
                }`}
                onClick={() => setSelectedVote('LIST_B')}
              >
                <span className="radio" />
                <div className="list-mark list-b">B</div>

                <div>
                  <strong>LISTA B</strong>
                  <span>Candidate list B</span>
                </div>
              </button>

              <button
                className={`vote-card ${
                  selectedVote === 'BLANK' ? 'selected' : ''
                }`}
                onClick={() => setSelectedVote('BLANK')}
              >
                <span className="radio" />
                <div className="list-mark blank">—</div>

                <div>
                  <strong>VOTO EN BLANCO</strong>
                  <span>Submit a blank ballot</span>
                </div>
              </button>
            </div>

            <button
              className="primary-button confirm-button"
              disabled={!selectedVote}
              onClick={confirmVote}
            >
              Confirm vote
              <span>→</span>
            </button>

            <p className="ballot-warning">
              Your individual ballot will remain private.
            </p>
          </section>
        )}

        {step === 'submitted' && (
          <section className="content status-screen submitted-screen">
            <div className="submitted-icon">✓</div>

            <div className="step-label success-label">VOTE RECORDED</div>

            <h2>Your vote has been submitted</h2>

            <p className="subtitle">
              Your voting right has been consumed successfully. Your identity
              and individual ballot remain private.
            </p>

            <div className="receipt">
              <div>
                <span>Status</span>
                <strong>Confirmed</strong>
              </div>

              <div>
                <span>Privacy</span>
                <strong>Protected</strong>
              </div>

              <div>
                <span>Voting right</span>
                <strong>Used</strong>
              </div>
            </div>

            <button className="secondary-button" onClick={resetDemo}>
              Restart demo
            </button>
          </section>
        )}

        <footer>
          <span className="network-dot" />
          Secured by Midnight
        </footer>
      </section>
    </main>
  )
}

export default App
