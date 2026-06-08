/** MediaPipe Face Landmarker helpers for live liveness pose detection. */

export type LivenessPose = 'center' | 'left' | 'right' | 'down';

/** How long the user must hold the correct pose before advancing (ms). */
export const POSE_HOLD_MS = 850;

export const LIVENESS_STEPS: { id: LivenessPose; label: string; hint: string }[] = [
  { id: 'center', label: 'Look straight', hint: 'Look at the camera lens (not the screen) and hold still' },
  { id: 'left', label: 'Turn head left', hint: 'Slowly turn your head to your left' },
  { id: 'right', label: 'Turn head right', hint: 'Slowly turn your head to your right' },
  { id: 'down', label: 'Look down', hint: 'Tilt your head down slightly' },
];

type Landmark = { x: number; y: number; z?: number };

export type PoseMetrics = {
  /** Nose horizontal offset vs eyes (turn left/right). */
  yaw: number;
  /** Chin–nose distance vs face height (stable; not inflated when face is close). */
  pitch: number;
  faceWidth: number;
  faceHeight: number;
};

/** Mirror landmark X so poses match what the user sees in a selfie preview. */
function mirrorLandmarks(landmarks: Landmark[]): Landmark[] {
  return landmarks.map((l) => ({ ...l, x: 1 - l.x }));
}

export function getPoseMetrics(landmarks: Landmark[], mirrored = true): PoseMetrics | null {
  if (landmarks.length < 152) return null;
  const pts = mirrored ? mirrorLandmarks(landmarks) : landmarks;
  const nose = pts[1];
  const forehead = pts[10];
  const leftEye = pts[33];
  const rightEye = pts[263];
  const chin = pts[152];
  if (!nose || !forehead || !leftEye || !rightEye || !chin) return null;

  const faceWidth = Math.abs(rightEye.x - leftEye.x);
  const faceHeight = Math.max(chin.y - forehead.y, 0.12);
  if (faceWidth < 0.03) return null;

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  // Chin–nose vertical span vs full face height (~0.35–0.55 when looking at camera)
  const pitch = (chin.y - nose.y) / faceHeight;

  return {
    yaw: (nose.x - eyeMidX) / faceWidth,
    pitch,
    faceWidth,
    faceHeight,
  };
}

/**
 * Classify head pose from webcam landmarks.
 * Use mirrored=false — MediaPipe reads the raw camera buffer (CSS mirror is display-only).
 */
export function classifyPose(landmarks: Landmark[], mirrored = false): LivenessPose | null {
  const m = getPoseMetrics(landmarks, mirrored);
  if (!m) return null;

  const { yaw, pitch, faceWidth } = m;
  if (faceWidth < 0.03) return null;

  if (yaw > 0.05) return 'left';
  if (yaw < -0.05) return 'right';
  // Head tilted down: chin moves closer to nose (lower pitch ratio)
  if (pitch < 0.3 && Math.abs(yaw) < 0.18) return 'down';
  if (Math.abs(yaw) <= 0.12) return 'center';
  return null;
}

/** Per-step match with slightly relaxed thresholds (used to auto-advance). */
export function matchesLivenessStep(
  landmarks: Landmark[],
  stepId: LivenessPose,
  mirrored = false,
): boolean {
  const m = getPoseMetrics(landmarks, mirrored);
  if (!m) return false;

  const { yaw, pitch, faceWidth } = m;
  if (faceWidth < 0.035) return false;

  switch (stepId) {
    case 'center':
      return Math.abs(yaw) <= 0.15 && pitch >= 0.28;
    case 'left':
      return yaw > 0.035;
    case 'right':
      return yaw < -0.035;
    case 'down':
      return pitch < 0.32 && Math.abs(yaw) < 0.2;
    default:
      return false;
  }
}

type FaceLandmarkerInstance = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => {
    faceLandmarks?: Landmark[][];
  };
  close: () => void;
};

/** ~30fps interval — MediaPipe VIDEO mode expects monotonic timestamps in microseconds. */
const FRAME_INTERVAL_US = 33_333;

/** Next strictly-increasing frame timestamp (microseconds) for a new landmarker session. */
export function nextFrameTimestampUs(lastUs: number): number {
  return lastUs + FRAME_INTERVAL_US;
}

async function resolveVisionWasm() {
  const vision = await import('@mediapipe/tasks-vision');
  const { FilesetResolver } = vision;
  try {
    return await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  } catch {
    return await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
    );
  }
}

async function createLandmarker(delegate: 'GPU' | 'CPU'): Promise<FaceLandmarkerInstance | null> {
  const vision = await import('@mediapipe/tasks-vision');
  const { FaceLandmarker } = vision;
  const wasm = await resolveVisionWasm();
  const landmarker = await FaceLandmarker.createFromOptions(wasm, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate,
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.3,
    minFacePresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });
  return landmarker as unknown as FaceLandmarkerInstance;
}

/** Fresh VIDEO landmarker per modal open — avoids stale internal timestamp state. */
export async function createSessionFaceLandmarker(): Promise<FaceLandmarkerInstance | null> {
  try {
    return await createLandmarker('GPU');
  } catch (gpuErr) {
    console.warn('[Liveness] GPU landmarker failed, trying CPU', gpuErr);
    try {
      return await createLandmarker('CPU');
    } catch (cpuErr) {
      console.warn('[Liveness] Face landmarker unavailable', cpuErr);
      return null;
    }
  }
}

export function closeSessionFaceLandmarker(landmarker: FaceLandmarkerInstance | null): void {
  if (!landmarker) return;
  try {
    landmarker.close();
  } catch {
    // ignore close errors
  }
}

export function captureVideoFrame(video: HTMLVideoElement, mirror = true): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

export function canvasToJpegFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], name, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  });
}
