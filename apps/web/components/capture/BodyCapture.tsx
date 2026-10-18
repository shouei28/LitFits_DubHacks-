'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FULL_BODY_GUIDANCE, RECONSTRUCTION_LIMITATION, type RgbaImage } from '@fitmirror/shared';
import { reconstructFromRgba } from '@/lib/reconstruction/reconstruct';
import { useFigureStore } from '@/lib/store/figure-store';

const MAX_EDGE = 1600;

/**
 * Local photo capture. Pixels stay in the browser: only the silhouette reconstruction
 * is written to the figure store, and a rejected photo leaves the current figure alone.
 */
export function BodyCapture() {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopTracks(streamRef, videoRef);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraLive || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [cameraLive]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    stopTracks(streamRef, videoRef);
    setCameraLive(false);
    setBusy(true);
    setLines(['Reading the photo…']);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const image = imageFromSource(bitmap);
        await storeReconstruction(image);
      } finally {
        bitmap.close();
      }
    } catch {
      setLines(['That file could not be read as an image.', FULL_BODY_GUIDANCE]);
    } finally {
      setBusy(false);
    }
  }

  async function onCamera() {
    if (streamRef.current) {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        setLines(['The camera is not ready yet. Wait a moment and try again.', FULL_BODY_GUIDANCE]);
        return;
      }
      setBusy(true);
      setLines(['Reading the photo…']);
      try {
        await storeReconstruction(imageFromSource(video));
      } catch {
        setLines(['The camera frame could not be read.', FULL_BODY_GUIDANCE]);
      } finally {
        stopTracks(streamRef, videoRef);
        setCameraLive(false);
        setBusy(false);
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setLines([
        'This browser does not expose a camera. Upload a full-body photo instead.',
        FULL_BODY_GUIDANCE,
      ]);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraLive(true);
      setLines(['Camera on. Fit your full body in the frame, then take the photo.']);
    } catch {
      stopTracks(streamRef, videoRef);
      setCameraLive(false);
      setLines(['Camera access was denied. Upload a full-body photo instead.', FULL_BODY_GUIDANCE]);
    }
  }

  async function storeReconstruction(image: RgbaImage) {
    const result = await reconstructFromRgba(image);
    if (!result.ok) {
      setLines(
        result.messages.includes(FULL_BODY_GUIDANCE)
          ? result.messages
          : [...result.messages, FULL_BODY_GUIDANCE],
      );
      return;
    }
    useFigureStore.getState().setReconstruction(result.reconstruction);
    setPreviewSvg(
      result.reconstruction.silhouette.format === 'svg'
        ? result.reconstruction.silhouette.data
        : null,
    );
    setLines([
      'Figure updated from this photo.',
      ...result.reconstruction.quality.messages,
      RECONSTRUCTION_LIMITATION,
    ]);
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Add your figure</h1>
        <p className="text-muted-foreground text-sm">{FULL_BODY_GUIDANCE}</p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="border-input flex-1 cursor-pointer rounded-md border px-3 py-2 text-sm">
          <span className="mb-1 block font-medium">Upload a photo</span>
          <input
            data-testid="capture-file"
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => {
              void onFile(event);
            }}
          />
        </label>
        <button
          type="button"
          data-testid="capture-camera"
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
          disabled={busy}
          onClick={() => {
            void onCamera();
          }}
        >
          {cameraLive ? 'Take photo' : 'Use camera'}
        </button>
      </div>

      {cameraLive ? (
        <video
          ref={videoRef}
          className="bg-muted aspect-[3/4] w-full rounded-md object-contain"
          playsInline
          muted
        />
      ) : null}

      {previewSvg ? (
        <div
          className="bg-muted text-foreground mx-auto h-72 w-40 [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: previewSvg }}
        />
      ) : null}

      <div
        data-testid="capture-status"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-2 text-sm"
      >
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function imageFromSource(
  source: CanvasImageSource & {
    width?: number;
    height?: number;
    videoWidth?: number;
    videoHeight?: number;
  },
): RgbaImage {
  const sourceWidth = source.videoWidth || source.width || 0;
  const sourceHeight = source.videoHeight || source.height || 0;
  const size = fittedSize(sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The photo could not be read.');
  context.drawImage(source, 0, 0, size.width, size.height);
  const imageData = context.getImageData(0, 0, size.width, size.height);
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}

function fittedSize(width: number, height: number): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= MAX_EDGE || edge === 0)
    return { width: Math.max(1, width), height: Math.max(1, height) };
  const scale = MAX_EDGE / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function stopTracks(
  streamRef: { current: MediaStream | null },
  videoRef: { current: HTMLVideoElement | null },
) {
  const stream = streamRef.current;
  streamRef.current = null;
  if (videoRef.current) videoRef.current.srcObject = null;
  stream?.getTracks().forEach((track) => track.stop());
}
