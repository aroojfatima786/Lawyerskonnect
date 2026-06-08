import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCheckCircle, FiLoader, FiX } from 'react-icons/fi';
import { Button, Modal } from '../ui';
import {
  LIVENESS_STEPS,
  POSE_HOLD_MS,
  type LivenessPose,
  classifyPose,
  matchesLivenessStep,
  getPoseMetrics,
  createSessionFaceLandmarker,
  closeSessionFaceLandmarker,
  nextFrameTimestampUs,
  captureVideoFrame,
  canvasToJpegFile,
} from '../../utils/faceLiveness';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('loadeddata', done);
      video.removeEventListener('loadedmetadata', done);
      resolve();
    };
    video.addEventListener('loadeddata', done);
    video.addEventListener('loadedmetadata', done);
    setTimeout(done, 3000);
  });
}

export function LivenessSelfieModal({ isOpen, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const centerFrameRef = useRef<HTMLCanvasElement | null>(null);
  const stepIndexRef = useRef(0);
  const holdStartRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  const completedRef = useRef<Set<LivenessPose>>(new Set());
  const detectErrorLoggedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [detectedPose, setDetectedPose] = useState<LivenessPose | null>(null);
  const [faceVisible, setFaceVisible] = useState(false);
  const [completed, setCompleted] = useState<Set<LivenessPose>>(new Set());
  const [holdProgress, setHoldProgress] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [debugMetrics, setDebugMetrics] = useState<string | null>(null);

  stepIndexRef.current = stepIndex;
  completedRef.current = completed;

  const currentStep = LIVENESS_STEPS[stepIndex];
  const allDone = completed.size >= LIVENESS_STEPS.length;

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const autoFinish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);

    const canvas = centerFrameRef.current;
    const video = videoRef.current;
    const source = canvas || (video ? captureVideoFrame(video, true) : null);
    if (!source) {
      setError('Could not capture live frame. Try again.');
      finishingRef.current = false;
      setFinishing(false);
      return;
    }
    const file = await canvasToJpegFile(source, `selfie-${Date.now()}.jpg`);
    if (!file) {
      setError('Could not capture live frame. Try again.');
      finishingRef.current = false;
      setFinishing(false);
      return;
    }
    stopCamera();
    onCapture(file);
    onClose();
  }, [onCapture, onClose, stopCamera]);

  const advanceStepRef = useRef<() => void>(() => {});
  const autoFinishRef = useRef(autoFinish);
  autoFinishRef.current = autoFinish;

  advanceStepRef.current = () => {
    const idx = stepIndexRef.current;
    const step = LIVENESS_STEPS[idx];
    if (!step) return;

    if (step.id === 'center' && videoRef.current) {
      centerFrameRef.current = captureVideoFrame(videoRef.current, true);
    }

    const nextCompleted = new Set(completedRef.current);
    nextCompleted.add(step.id);
    completedRef.current = nextCompleted;
    setCompleted(nextCompleted);

    const nextIdx = idx + 1;
    setStepIndex(nextIdx);
    stepIndexRef.current = nextIdx;
    holdStartRef.current = null;
    setHoldProgress(0);

    if (nextCompleted.size >= LIVENESS_STEPS.length) {
      void autoFinishRef.current();
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setStepIndex(0);
      stepIndexRef.current = 0;
      setDetectedPose(null);
      setFaceVisible(false);
      setCompleted(new Set());
      completedRef.current = new Set();
      setError(null);
      setHoldProgress(0);
      setModelLoading(false);
      setModelReady(false);
      setFinishing(false);
      finishingRef.current = false;
      holdStartRef.current = null;
      centerFrameRef.current = null;
      detectErrorLoggedRef.current = false;
      setDebugMetrics(null);
      return;
    }

    let cancelled = false;
    let sessionLandmarker: Awaited<ReturnType<typeof createSessionFaceLandmarker>> = null;
    let lastTimestampUs = 0;

    (async () => {
      try {
        setModelLoading(true);
        const landmarker = await createSessionFaceLandmarker();
        if (cancelled) {
          closeSessionFaceLandmarker(landmarker);
          return;
        }
        if (!landmarker) {
          setError('Face detection could not load. Check internet, disable ad-blocker, refresh and try again.');
          setModelLoading(false);
          return;
        }
        sessionLandmarker = landmarker;
        setModelReady(true);
        setModelLoading(false);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          closeSessionFaceLandmarker(sessionLandmarker);
          sessionLandmarker = null;
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          setError('Camera element not ready. Close and reopen.');
          return;
        }
        video.srcObject = stream;
        await video.play();
        await waitForVideoReady(video);
        if (cancelled) {
          closeSessionFaceLandmarker(sessionLandmarker);
          sessionLandmarker = null;
          return;
        }
        setReady(true);
        lastTimestampUs = 0;

        let lastUiUpdate = 0;
        const loop = () => {
          if (cancelled || !sessionLandmarker || !videoRef.current || finishingRef.current) return;
          const v = videoRef.current;
          const activeLandmarker = sessionLandmarker;
          if (v.videoWidth > 0 && v.readyState >= 2) {
            lastTimestampUs = nextFrameTimestampUs(lastTimestampUs);
            try {
              const lm = activeLandmarker.detectForVideo(v, lastTimestampUs).faceLandmarks?.[0];
              const now = performance.now();

              if (!lm?.length) {
                holdStartRef.current = null;
                if (now - lastUiUpdate > 120) {
                  lastUiUpdate = now;
                  setFaceVisible(false);
                  setDetectedPose(null);
                  setHoldProgress(0);
                  setDebugMetrics(null);
                }
              } else {
                const pose = classifyPose(lm, false);
                const metrics = getPoseMetrics(lm, false);
                const step = LIVENESS_STEPS[stepIndexRef.current];
                const stepMatch = step ? matchesLivenessStep(lm, step.id, false) : false;
                let pct = 0;

                if (step && stepMatch) {
                  if (holdStartRef.current === null) holdStartRef.current = now;
                  const held = now - (holdStartRef.current ?? now);
                  pct = Math.min(100, (held / POSE_HOLD_MS) * 100);
                  if (held >= POSE_HOLD_MS) {
                    advanceStepRef.current();
                  }
                } else {
                  holdStartRef.current = null;
                }

                if (now - lastUiUpdate > 80) {
                  lastUiUpdate = now;
                  setFaceVisible(true);
                  setDetectedPose(pose);
                  setHoldProgress(pct);
                  if (metrics) {
                    setDebugMetrics(
                      `yaw ${metrics.yaw.toFixed(2)} · pitch ${metrics.pitch.toFixed(2)} (chin–nose)${stepMatch ? ' · match ✓' : ''}`,
                    );
                  }
                }
              }
            } catch (err) {
              if (!detectErrorLoggedRef.current) {
                detectErrorLoggedRef.current = true;
                console.error('[Liveness] detectForVideo error', err);
              }
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        setError('Camera access denied. Allow camera permission and try again.');
        setModelLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
      closeSessionFaceLandmarker(sessionLandmarker);
      sessionLandmarker = null;
    };
  }, [isOpen, stopCamera]);

  const progress = Math.round((completed.size / LIVENESS_STEPS.length) * 100);

  const statusText = (() => {
    if (finishing) return 'Liveness verified — capturing live frame…';
    if (modelLoading) return 'Loading face detection model…';
    if (!ready) return 'Starting camera…';
    if (!modelReady) return '';
    if (!faceVisible) return 'Move your face into the frame — good lighting helps';
    if (allDone) return 'All poses verified';
    if (!currentStep) return '';
    if (holdProgress > 0) return `Hold still — ${currentStep.label}`;
    if (detectedPose && detectedPose !== currentStep?.id) {
      return `Detected "${detectedPose}" — do: ${currentStep?.hint}`;
    }
    return currentStep.hint;
  })();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Live selfie — liveness check" size="md">
      <div className="flex flex-col p-4">
        {error ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
              <span>
                Step {Math.min(stepIndex + 1, LIVENESS_STEPS.length)} of {LIVENESS_STEPS.length}
              </span>
              <span className="font-semibold text-lk-accent">{progress}%</span>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-lk-accent transition-all" style={{ width: `${progress}%` }} />
            </div>

            <div className="relative mb-3 overflow-hidden rounded-xl bg-slate-900">
              <video
                ref={videoRef}
                className="mx-auto h-[280px] w-full scale-x-[-1] object-cover"
                playsInline
                muted
                autoPlay
              />
              {(modelLoading || !ready || finishing) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 text-sm text-white/90">
                  <FiLoader className="animate-spin text-xl" />
                  {finishing ? 'Capturing verified selfie…' : modelLoading ? 'Loading face detection…' : 'Starting camera…'}
                </div>
              )}
              {ready && modelReady && !finishing && currentStep && !allDone && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/75 px-3 py-2 text-center">
                  <p className="text-sm font-bold text-white">{currentStep.label}</p>
                  <p className="text-xs text-white/85">{statusText}</p>
                  <p className="mt-1 text-[10px] text-white/60">
                    {faceVisible
                      ? detectedPose
                        ? `Live: ${detectedPose}${holdProgress > 0 ? ' ✓' : ''}`
                        : 'Face seen — adjust pose'
                      : 'No face detected'}
                  </p>
                  {debugMetrics && (
                    <p className="mt-0.5 text-[9px] text-white/45">{debugMetrics}</p>
                  )}
                  {holdProgress > 0 && (
                    <div className="mx-auto mt-2 h-1.5 max-w-[200px] overflow-hidden rounded-full bg-white/25">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-[width] duration-75"
                        style={{ width: `${holdProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
              {allDone && !finishing && (
                <div className="absolute inset-0 flex items-center justify-center bg-emerald-900/40">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white">
                    <FiCheckCircle /> Liveness complete
                  </p>
                </div>
              )}
            </div>

            <p className="mb-3 text-center text-xs text-slate-500">
              Hold each pose ~1 second when the green bar fills. Detection is fully automatic.
            </p>

            <div className="flex flex-wrap justify-center gap-1 border-t border-slate-100 pt-3">
              {LIVENESS_STEPS.map((s) => (
                <span
                  key={s.id}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    completed.has(s.id) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 flex justify-center border-t border-slate-100 pt-3">
          <Button variant="outline" onClick={onClose} leftIcon={<FiX />} disabled={finishing}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
