'use client';

import {
  CLEAR_FIGURE_EXPLANATION,
  DISMISS_FIGURE_EXPLANATION,
  RECONSTRUCTION_LIMITATION,
  frameAspect,
  overlayFrame,
  schematicOverlayDataUrl,
  type BodyReconstruction,
  type FigureChrome,
  type FigureCorner,
  type WornGarment,
} from '@fitmirror/shared';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useFigureStore } from '@/lib/store/figure-store';
import { cn } from '@/lib/utils';

const CARD_WIDTH = 'w-[min(220px,max(160px,46vw))] max-w-[calc(100%-1.5rem)] sm:w-[220px]';

const CORNER_CLASS: Record<FigureCorner, string> = {
  'top-left': 'top-3 left-3',
  'top-right': 'top-3 right-3',
  'bottom-left': 'bottom-3 left-3',
  'bottom-right': 'bottom-3 right-3',
};

const CORNERS: readonly { corner: FigureCorner; label: string; short: string }[] = [
  { corner: 'top-left', label: 'Top left', short: 'TL' },
  { corner: 'top-right', label: 'Top right', short: 'TR' },
  { corner: 'bottom-left', label: 'Bottom left', short: 'BL' },
  { corner: 'bottom-right', label: 'Bottom right', short: 'BR' },
];

const controlClass =
  'border-border bg-background hover:bg-muted rounded-md border px-1.5 py-1 text-xs';

/** Keep at least 48px of the card inside the viewport. Anchor fractions stay within 0–1. */
function viewportFraction(originPx: number, viewportPx: number): number {
  if (!(viewportPx > 0) || !Number.isFinite(originPx)) return 0;
  const max = Math.min(1, Math.max(0, (viewportPx - 48) / viewportPx));
  return Math.min(max, Math.max(0, originPx / viewportPx));
}

function anchorStyle(anchor: { x: number; y: number }): CSSProperties {
  const top = `clamp(0px, ${anchor.y * 100}%, calc(100% - 48px))`;
  return {
    left: `clamp(0px, ${anchor.x * 100}%, calc(100% - 48px))`,
    top,
    maxHeight: `calc(100% - ${top} - 0.75rem)`,
  };
}

function floatingPlacement(chrome: FigureChrome): { className: string; style?: CSSProperties } {
  if (chrome.anchor) return { className: '', style: anchorStyle(chrome.anchor) };
  return { className: CORNER_CLASS[chrome.corner] };
}

function parentBox(card: HTMLElement): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const parent = card.offsetParent;
  if (parent instanceof HTMLElement) {
    const rect = parent.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function pngSource(data: string): string {
  const trimmed = data.trim();
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
}

function limitationNotes(limitations: readonly string[]): string[] {
  return [RECONSTRUCTION_LIMITATION, ...limitations].filter(
    (note, index, all) => all.indexOf(note) === index,
  );
}

function layersOf(worn: readonly WornGarment[]): WornGarment[] {
  return [...worn].sort((a, b) => a.layerOrder - b.layerOrder || a.title.localeCompare(b.title));
}

export function PersistentFigure() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(useFigureStore.persist.hasHydrated());
    return useFigureStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  const reconstruction = useFigureStore((state) => state.reconstruction);
  const worn = useFigureStore((state) => state.worn);
  const chrome = useFigureStore((state) => state.chrome);
  const dismiss = useFigureStore((state) => state.dismiss);
  const restoreDismissed = useFigureStore((state) => state.restoreDismissed);
  const minimize = useFigureStore((state) => state.minimize);
  const expand = useFigureStore((state) => state.expand);
  const setCorner = useFigureStore((state) => state.setCorner);
  const setAnchor = useFigureStore((state) => state.setAnchor);
  const clearFigure = useFigureStore((state) => state.clearFigure);
  const removeWorn = useFigureStore((state) => state.removeWorn);

  if (!hydrated) return null;
  if (!reconstruction && !chrome.dismissed) return null;

  const placement = floatingPlacement(chrome);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {chrome.dismissed ? (
        <button
          type="button"
          data-testid="figure-restore"
          title={DISMISS_FIGURE_EXPLANATION}
          onClick={restoreDismissed}
          style={placement.style}
          className={cn(
            'border-border bg-background pointer-events-auto absolute w-[min(220px,calc(100%-1.5rem))] overflow-y-auto rounded-lg border p-2 text-left shadow-lg',
            placement.className,
          )}
        >
          <span className="block text-sm font-medium">Restore figure</span>
          <span className="text-muted-foreground mt-1 block text-[11px] leading-snug">
            {DISMISS_FIGURE_EXPLANATION}
          </span>
        </button>
      ) : chrome.minimized ? (
        <button
          type="button"
          data-testid="figure-expand"
          onClick={expand}
          style={placement.style}
          className={cn(
            'border-border bg-background pointer-events-auto absolute rounded-full border px-3 py-2 text-sm shadow-lg',
            placement.className,
          )}
        >
          Show figure
        </button>
      ) : reconstruction ? (
        <FigureCard
          reconstruction={reconstruction}
          worn={worn}
          chrome={chrome}
          placement={placement}
          onDismiss={dismiss}
          onMinimize={minimize}
          onClear={clearFigure}
          onRemove={removeWorn}
          onCorner={setCorner}
          onAnchor={setAnchor}
        />
      ) : null}
    </div>
  );
}

function FigureCard({
  reconstruction,
  worn,
  chrome,
  placement,
  onDismiss,
  onMinimize,
  onClear,
  onRemove,
  onCorner,
  onAnchor,
}: {
  reconstruction: BodyReconstruction;
  worn: WornGarment[];
  chrome: FigureChrome;
  placement: { className: string; style?: CSSProperties };
  onDismiss: () => void;
  onMinimize: () => void;
  onClear: () => void;
  onRemove: (productId: string) => void;
  onCorner: (corner: FigureCorner) => void;
  onAnchor: (anchor: { x: number; y: number }) => void;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const layers = layersOf(worn);
  const notes = limitationNotes(reconstruction.limitations);
  const warnings =
    reconstruction.quality.status === 'warning' ? reconstruction.quality.messages : [];

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const card = cardRef.current;
    if (!drag || !card || drag.pointerId !== event.pointerId) return;
    const box = parentBox(card);
    onAnchor({
      x: viewportFraction(event.clientX - drag.offsetX - box.left, box.width),
      y: viewportFraction(event.clientY - drag.offsetY - box.top, box.height),
    });
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  return (
    <aside
      ref={cardRef}
      aria-label="Your figure"
      style={placement.style}
      className={cn(
        'border-border bg-background pointer-events-auto absolute flex max-h-[min(480px,62dvh)] flex-col gap-2 overflow-y-auto rounded-lg border p-2 text-sm shadow-lg',
        CARD_WIDTH,
        placement.className,
      )}
    >
      <div className="bg-background sticky top-0 z-20 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            data-testid="figure-drag"
            aria-label="Drag figure"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={cn(
              controlClass,
              'touch-none cursor-grab select-none active:cursor-grabbing',
            )}
          >
            Drag
          </button>
          <button
            type="button"
            data-testid="figure-minimize"
            onClick={onMinimize}
            className={controlClass}
          >
            Minimize
          </button>
          <button
            type="button"
            data-testid="figure-dismiss"
            onClick={onDismiss}
            className={controlClass}
          >
            Dismiss
          </button>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer">Move</summary>
          <div role="group" aria-label="Figure corner" className="mt-1 grid grid-cols-2 gap-1">
            {CORNERS.map(({ corner, label, short }) => {
              const selected = chrome.anchor === null && chrome.corner === corner;
              return (
                <button
                  key={corner}
                  type="button"
                  data-testid={`figure-corner-${corner}`}
                  aria-label={label}
                  aria-pressed={selected}
                  title={label}
                  onClick={() => onCorner(corner)}
                  className={cn(
                    controlClass,
                    selected && 'bg-primary text-primary-foreground border-primary',
                  )}
                >
                  {short}
                </button>
              );
            })}
          </div>
        </details>
      </div>

      <Silhouette reconstruction={reconstruction} worn={layers} />

      {layers.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nothing tried on yet</p>
      ) : (
        <ul className="space-y-1.5">
          {layers.map((item) => (
            <li key={item.productId} className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block break-words">{item.title}</span>
                {item.overlayKind === 'schematic' ? (
                  <span className="text-muted-foreground block text-[11px]">Schematic preview</span>
                ) : null}
              </span>
              <button
                type="button"
                data-testid={`worn-remove-${item.productId}`}
                onClick={() => onRemove(item.productId)}
                className={cn(controlClass, 'shrink-0')}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {warnings.length > 0 ? (
        <ul className="space-y-1 text-xs">
          {warnings.map((message, index) => (
            <li key={`${index}-${message}`}>{message}</li>
          ))}
        </ul>
      ) : null}

      <details className="text-[11px] leading-snug">
        <summary className="text-muted-foreground cursor-pointer">About this figure</summary>
        {notes.map((note) => (
          <p key={note} className="text-muted-foreground mt-1">
            {note}
          </p>
        ))}
        <p className="text-muted-foreground mt-1">{CLEAR_FIGURE_EXPLANATION}</p>
      </details>

      <button
        type="button"
        data-testid="figure-clear"
        onClick={onClear}
        className={cn(controlClass, 'self-start')}
      >
        Clear figure
      </button>
    </aside>
  );
}

function Silhouette({
  reconstruction,
  worn,
}: {
  reconstruction: BodyReconstruction;
  worn: readonly WornGarment[];
}) {
  const { width, height } = reconstruction.normalizedBounds;
  const { silhouette } = reconstruction;
  const svgMarkup = silhouette.format === 'svg' && silhouette.data.trimStart().startsWith('<');
  const aspect = frameAspect(reconstruction.normalizedBounds);

  return (
    <div
      data-testid="figure-silhouette"
      className="bg-muted relative mx-auto max-w-full"
      style={{
        aspectRatio: `${width} / ${height}`,
        width: `min(100%, calc(min(168px, 28dvh) * ${width} / ${height}))`,
      }}
    >
      {svgMarkup ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: silhouette.data }}
        />
      ) : (
        <img
          alt="Body silhouette"
          draggable={false}
          src={silhouette.format === 'png' ? pngSource(silhouette.data) : silhouette.data}
          className="absolute inset-0 h-full w-full"
        />
      )}
      {worn.map((item, index) => {
        const frame = overlayFrame(item.transform, aspect);
        return (
          <div
            key={item.productId}
            data-testid={`worn-layer-${item.productId}`}
            className="absolute"
            style={{
              left: `${frame.leftPct}%`,
              top: `${frame.topPct}%`,
              width: `${frame.widthPct}%`,
              height: `${frame.heightPct}%`,
              transform: `rotate(${item.transform.rotation}deg)`,
              zIndex: index + 1,
            }}
          >
            {item.overlayKind === 'schematic' ? (
              <>
                <img
                  alt=""
                  draggable={false}
                  src={schematicOverlayDataUrl(item.category, item.color)}
                  className="h-full w-full"
                />
                <span className="bg-background/90 text-foreground absolute inset-x-0 bottom-0 px-0.5 text-center text-[10px] leading-tight">
                  Schematic preview
                </span>
              </>
            ) : null}
            {item.overlayKind === 'transparent' && item.overlayHref ? (
              <img alt="" draggable={false} src={item.overlayHref} className="h-full w-full" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
