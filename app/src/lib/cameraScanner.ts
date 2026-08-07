import {
  prepareZXingModule,
  readBarcodes,
} from 'zxing-wasm/reader';

export interface CameraControl {
  stop: () => void;
  captureCanvasFrame: () => Promise<string | null>;
}

prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => {
      if (path.endsWith('.wasm')) {
        return '/zxing_reader.wasm';
      }
      return prefix + path;
    },
  },
});

export async function startNativeCamera(
  videoElement: HTMLVideoElement,
  onBarcodeDetected?: (code: string) => void
): Promise<CameraControl> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Tu navegador no soporta el acceso a la cámara.'
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

  videoElement.srcObject = stream;
  videoElement.setAttribute('playsinline', 'true');
  videoElement.muted = true;

  await videoElement.play();

  const videoTrack = stream.getVideoTracks()[0];

  try {
    await videoTrack.applyConstraints({
      advanced: [
        {
          focusMode: 'continuous',
        } as any,
      ],
    });
  } catch {
    // Algunos celulares no exponen control de foco.
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {
    willReadFrequently: true,
  });

  let stopped = false;
  let scanning = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const analyzeCurrentFrame = async (): Promise<string | null> => {
    if (
      stopped ||
      scanning ||
      !ctx ||
      videoElement.readyState < 2 ||
      !videoElement.videoWidth ||
      !videoElement.videoHeight
    ) {
      return null;
    }

    scanning = true;

    try {
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      ctx.drawImage(
        videoElement,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const results = await readBarcodes(imageData, {
        formats: ['PDF417'],
        tryHarder: true,
        maxNumberOfSymbols: 1,
      });

      if (results.length > 0 && results[0].text) {
        return results[0].text;
      }

      return null;
    } catch (error) {
      console.error('ZXing scan error:', error);
      return null;
    } finally {
      scanning = false;
    }
  };

  const scanLoop = async () => {
    if (stopped) return;

    const code = await analyzeCurrentFrame();

    if (code && onBarcodeDetected) {
      onBarcodeDetected(code);
      return;
    }

    timer = setTimeout(scanLoop, 300);
  };

  timer = setTimeout(scanLoop, 500);

  return {
    captureCanvasFrame: analyzeCurrentFrame,

    stop: () => {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
      }

      stream.getTracks().forEach((track) => track.stop());
      videoElement.srcObject = null;
    },
  };
}
