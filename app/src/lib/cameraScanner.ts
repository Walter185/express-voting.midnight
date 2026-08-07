/**
 * Módulo en JavaScript Vanilla nativo para captura de cámara HTML5 y análisis de fotogramas en Canvas.
 */

export interface CameraControl {
  stop: () => void;
  captureCanvasFrame: () => Promise<string | null>;
}

/**
 * Inicia la cámara nativa del navegador y habilita la captura de fotogramas en HTML5 Canvas.
 */
export async function startNativeCamera(
  videoElement: HTMLVideoElement,
  onBarcodeDetected?: (code: string) => void
): Promise<CameraControl> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Tu navegador no soporta el acceso a la cámara mediante MediaDevices API.');
  }

  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  videoElement.srcObject = stream;
  videoElement.setAttribute('playsinline', 'true');
  videoElement.setAttribute('autoplay', 'true');
  videoElement.muted = true;

  try {
    await videoElement.play();
  } catch (e) {
    console.log('Reproducción de video iniciada.');
  }

  let animationFrameId: number | null = null;
  let isScanning = true;

  // Instancia Canvas interna en JS Vanilla para procesamiento de fotogramas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Función nativa para analizar el fotograma actual del video
  const analyzeCurrentFrame = async (): Promise<string | null> => {
    if (!videoElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA || !ctx) {
      return null;
    }

    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // Intentar BarcodeDetector nativo del navegador si está soportado
    if ('BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: ['pdf417', 'qr_code', 'code_128', 'aztec', 'data_matrix'],
        });

        const barcodes = await detector.detect(canvas);
        if (barcodes && barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          if (code) return code;
        }
      } catch (err) {
        // Fallback silencioso
      }
    }

    return null;
  };

  // Bucle de escaneo automático continuo en segundo plano
  const scanLoop = async () => {
    if (!isScanning) return;

    try {
      const code = await analyzeCurrentFrame();
      if (code && onBarcodeDetected) {
        onBarcodeDetected(code);
      }
    } catch (err) {
      // Ignorar errores temporales de fotograma
    }

    if (isScanning) {
      animationFrameId = requestAnimationFrame(scanLoop);
    }
  };

  animationFrameId = requestAnimationFrame(scanLoop);

  return {
    captureCanvasFrame: async () => {
      return await analyzeCurrentFrame();
    },
    stop: () => {
      isScanning = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      videoElement.srcObject = null;
    },
  };
}
