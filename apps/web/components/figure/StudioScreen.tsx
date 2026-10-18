'use client';

import { RECONSTRUCTION_LIMITATION, type Proportions } from '@fitmirror/shared';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { BodyCapture } from '@/components/capture/BodyCapture';
import { useFigureStore } from '@/lib/store/figure-store';

const PROPORTION_FIELDS: readonly { key: keyof Proportions; label: string }[] = [
  { key: 'torsoRatio', label: 'Torso' },
  { key: 'shoulderWidthRatio', label: 'Shoulder width' },
  { key: 'hipWidthRatio', label: 'Hip width' },
  { key: 'upperLegRatio', label: 'Legs (upper)' },
  { key: 'lowerLegRatio', label: 'Legs (lower)' },
  { key: 'armRatio', label: 'Arms' },
  { key: 'headRatio', label: 'Head' },
];

function formatRatio(value: number): string {
  return `${Number(value.toFixed(3))} of height`;
}

function limitationNotes(limitations: readonly string[]): string[] {
  return [RECONSTRUCTION_LIMITATION, ...limitations].filter(
    (note, index, all) => all.indexOf(note) === index,
  );
}

export function StudioScreen() {
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState('');
  const [saveRejected, setSaveRejected] = useState(false);

  useEffect(() => {
    setHydrated(useFigureStore.persist.hasHydrated());
    return useFigureStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  const reconstruction = useFigureStore((state) => state.reconstruction);
  const worn = useFigureStore((state) => state.worn);
  const savedOutfits = useFigureStore((state) => state.savedOutfits);
  const dismissed = useFigureStore((state) => state.chrome.dismissed);
  const removeWorn = useFigureStore((state) => state.removeWorn);
  const saveOutfit = useFigureStore((state) => state.saveOutfit);
  const restoreOutfit = useFigureStore((state) => state.restoreOutfit);
  const restoreDismissed = useFigureStore((state) => state.restoreDismissed);

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = saveOutfit(name);
    if (id === null) {
      setSaveRejected(true);
      return;
    }
    setSaveRejected(false);
    setName('');
  }

  const proportions = reconstruction?.proportions;
  const ratioRows = PROPORTION_FIELDS.flatMap((field) => {
    const value = proportions?.[field.key];
    return value === undefined ? [] : [{ label: field.label, value }];
  });

  return (
    <main className="mx-auto w-full min-w-0 max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">Studio</h1>
        <Link href="/shop" className="text-sm underline">
          Shop
        </Link>
      </header>

      <div className="mt-6 min-w-0 max-w-full">
        <BodyCapture />
      </div>

      {hydrated && dismissed ? (
        <button
          type="button"
          onClick={restoreDismissed}
          className="border-border bg-background mt-6 rounded-md border px-3 py-2 text-sm"
        >
          Restore figure
        </button>
      ) : null}

      {hydrated && reconstruction ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Proportions</h2>
          {ratioRows.length > 0 ? (
            <dl className="mt-3 space-y-2">
              {ratioRows.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                >
                  <dt>{row.label}</dt>
                  <dd className="text-muted-foreground">{formatRatio(row.value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-muted-foreground mt-2 text-sm">
              No proportion ratios were estimated for this photo.
            </p>
          )}
          <div className="mt-3 space-y-2">
            {limitationNotes(reconstruction.limitations).map((note) => (
              <p key={note} className="text-muted-foreground text-sm leading-snug">
                {note}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {hydrated ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">On this figure</h2>
          {worn.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">Nothing tried on yet</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {worn.map((item) => (
                <li key={item.productId} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="break-words">{item.title}</span>
                    {item.size ? (
                      <span className="text-muted-foreground"> · {item.size}</span>
                    ) : null}
                    {item.overlayKind === 'schematic' ? (
                      <span className="text-muted-foreground block text-xs">Schematic preview</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeWorn(item.productId)}
                    className="border-border bg-background shrink-0 rounded-md border px-2 py-1"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={onSave} className="mt-6">
            <h2 className="text-lg font-semibold">Save outfit</h2>
            <label htmlFor="outfit-name" className="mt-3 block text-sm">
              Outfit name
            </label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="outfit-name"
                data-testid="outfit-name"
                value={name}
                maxLength={80}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaveRejected(false);
                }}
                className="border-input bg-background w-full min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
              />
              <button
                type="submit"
                data-testid="outfit-save"
                className="bg-primary text-primary-foreground shrink-0 rounded-md px-3 py-2 text-sm"
              >
                Save outfit
              </button>
            </div>
            {saveRejected ? (
              <p role="alert" className="mt-2 text-sm">
                Add a garment and a name first.
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

      {hydrated ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Saved outfits</h2>
          {savedOutfits.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">No saved outfits yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {savedOutfits.map((outfit) => (
                <li key={outfit.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{outfit.name}</span>
                  <button
                    type="button"
                    data-testid={`outfit-restore-${outfit.id}`}
                    onClick={() => restoreOutfit(outfit.id)}
                    className="border-border bg-background shrink-0 rounded-md border px-2 py-1"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
