import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCamera, FiX } from 'react-icons/fi';
import { Button, Modal } from '../ui';

type SelfieCaptureModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

export function SelfieCaptureModal({ isOpen, onClose, onCapture }: SelfieCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setError('Camera access denied or unavailable. Upload a selfie photo instead.');
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Live selfie capture" size="md">
      <div className="space-y-4 p-2">
        {error ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-slate-900">
            <video ref={videoRef} className="mx-auto max-h-[360px] w-full object-cover" playsInline muted />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                Starting camera…
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} leftIcon={<FiX />}>
            Cancel
          </Button>
          <Button onClick={capture} disabled={!ready} leftIcon={<FiCamera />}>
            Capture selfie
          </Button>
        </div>
      </div>
    </Modal>
  );
}
