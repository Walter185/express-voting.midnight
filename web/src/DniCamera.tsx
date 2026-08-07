import { useEffect, useRef, useState } from 'react'
import {
  scanArgentineDniFrame,
  type DniScanResult,
} from './dniScanner'

type Props = {
  onDetected: (result: DniScanResult) => void
  onClose: () => void
}

export default function DniCamera({
  onDetected,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const detectedRef = useRef(onDetected)

  const [error, setError] = useState('')
  const [status, setStatus] = useState('Point the camera at the DNI barcode')

  useEffect(() => {
    detectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: number | undefined
    let scanning = false
    let finished = false

    const stop = () => {
      if (timer) {
        window.clearInterval(timer)
      }

      stream?.getTracks().forEach((track) => track.stop())
    }

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API unavailable')
        }

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: {
              ideal: 'environment',
            },
            width: {
              ideal: 1920,
            },
            height: {
              ideal: 1080,
            },
          },
        })

        const video = videoRef.current

        if (!video) return

        video.srcObject = stream
        await video.play()

        setStatus('Looking for PDF417 or QR code...')

        timer = window.setInterval(async () => {
          if (scanning || finished) return
          if (!video.videoWidth || !video.videoHeight) return

          const canvas = canvasRef.current
          if (!canvas) return

          scanning = true

          try {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight

            const context = canvas.getContext('2d', {
              willReadFrequently: true,
            })

            if (!context) return

            context.drawImage(
              video,
              0,
              0,
              canvas.width,
              canvas.height,
            )

            const imageData = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            )

            const result = await scanArgentineDniFrame(imageData)

            finished = true
            setStatus('DNI detected')
            stop()

            detectedRef.current(result)
          } catch (scanError) {
            if (
              scanError instanceof Error &&
              scanError.message === 'DNI_NOT_FOUND'
            ) {
              setStatus(
                'Barcode detected — trying to identify DNI...',
              )
            }
          } finally {
            scanning = false
          }
        }, 650)
      } catch (cameraError) {
        console.error(cameraError)

        setError(
          'Could not access the camera. Check browser camera permissions.',
        )
      }
    }

    void start()

    return stop
  }, [])

  return (
    <div className="camera-overlay">
      <div className="camera-modal">
        <div className="camera-header">
          <div>
            <span>IDENTITY SCAN</span>
            <strong>Scan DNI</strong>
          </div>

          <button
            type="button"
            className="camera-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="camera-view">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
          />

          <div className="camera-guide">
            <div className="guide-corner guide-tl" />
            <div className="guide-corner guide-tr" />
            <div className="guide-corner guide-bl" />
            <div className="guide-corner guide-br" />

            <span>Place the DNI barcode inside the frame</span>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="camera-canvas"
        />

        {error ? (
          <div className="camera-error">{error}</div>
        ) : (
          <div className="camera-status">
            <span className="camera-pulse" />
            {status}
          </div>
        )}
      </div>
    </div>
  )
}
