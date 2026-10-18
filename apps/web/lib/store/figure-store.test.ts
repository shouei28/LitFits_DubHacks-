import { describe, expect, it } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import {
  CatalogProductSchema,
  FIGURE_STORAGE_KEY,
  type BodyReconstruction,
  type CatalogProduct,
} from '@fitmirror/shared';
import { createFigureStore } from './figure-store';

function memory(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (name) => map.get(name) ?? null,
    setItem: (name, value) => {
      map.set(name, value);
    },
    removeItem: (name) => {
      map.delete(name);
    },
  };
}

const tee: CatalogProduct = CatalogProductSchema.parse({
  id: '00000000-0000-4000-8000-000000000001',
  source: 'fixture',
  title: 'Placeholder crew tee',
  brand: 'Unbranded',
  retailer: 'Demo catalog',
  category: 'top',
  availableSizes: ['S', 'M'],
  color: 'white',
  tryOnAsset: 'schematic',
  placeholder: true,
  attribution: 'Demo catalog',
});

const jean: CatalogProduct = {
  ...tee,
  id: '00000000-0000-4000-8000-000000000003',
  title: 'Placeholder straight jean',
  category: 'bottom',
  color: 'indigo',
};

const dress: CatalogProduct = {
  ...tee,
  id: '00000000-0000-4000-8000-000000000008',
  title: 'Placeholder midi dress',
  category: 'dress',
  color: 'black',
};

const coat: CatalogProduct = {
  ...tee,
  id: '00000000-0000-4000-8000-000000000007',
  title: 'Placeholder chore jacket',
  category: 'outerwear',
  color: 'olive',
};

function reconstruction(width: number, height: number): BodyReconstruction {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    imageWidth: 200,
    imageHeight: 400,
    silhouette: {
      format: 'svg',
      data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 100"></svg>',
      width,
      height,
    },
    normalizedBounds: { x: 10, y: 10, width, height },
    quality: { status: 'ok', messages: [], source: 'fallback' },
    limitations: ['2D outline only'],
    createdAt: '2026-10-18T00:00:00.000Z',
    proportions: { shoulderWidthRatio: 0.3, hipWidthRatio: 0.24, torsoRatio: 0.32 },
  };
}

describe('figure store', () => {
  it('layers garments, replaces a slot, and lets a dress take top and bottom', () => {
    const store = createFigureStore(memory());
    store.getState().wear(tee, 'M');
    store.getState().wear(jean, 'nope');
    store.getState().wear(coat);
    const worn = store.getState().worn;
    expect(worn.map((item) => item.category)).toEqual(['bottom', 'top', 'outerwear']);
    expect(worn.map((item) => item.layerOrder)).toEqual([0, 1, 2]);
    expect(worn.find((item) => item.category === 'top')?.size).toBe('M');
    expect(worn.find((item) => item.category === 'bottom')?.size).toBeNull();

    store.getState().wear(dress);
    expect(store.getState().worn.map((item) => item.category)).toEqual(['dress', 'outerwear']);

    store.getState().wear(tee, 'S');
    expect(
      store
        .getState()
        .worn.map((item) => item.category)
        .sort(),
    ).toEqual(['outerwear', 'top']);
  });

  it('removes a garment and undoes the removal', () => {
    const store = createFigureStore(memory());
    store.getState().wear(tee);
    store.getState().wear(jean);
    store.getState().removeWorn(tee.id);
    expect(store.getState().worn).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().worn).toHaveLength(2);
    store.getState().redo();
    expect(store.getState().worn.map((item) => item.productId)).toEqual([jean.id]);
  });

  it('saves an outfit and restores it after the worn list changes', () => {
    const store = createFigureStore(memory());
    expect(store.getState().saveOutfit('  ')).toBeNull();
    store.getState().wear(tee, 'S');
    store.getState().wear(jean);
    const id = store.getState().saveOutfit('  Weekend  ');
    expect(id).toBeTruthy();
    store.getState().clearWorn();
    expect(store.getState().worn).toEqual([]);
    store.getState().restoreOutfit(id!);
    expect(
      store
        .getState()
        .worn.map((item) => item.productId)
        .sort(),
    ).toEqual([jean.id, tee.id].sort());
    expect(store.getState().savedOutfits[0]?.name).toBe('Weekend');
  });

  it('dismiss keeps the figure, clear deletes it and keeps saved outfits', () => {
    const store = createFigureStore(memory());
    store.getState().setReconstruction(reconstruction(40, 100));
    store.getState().wear(tee);
    const saved = store.getState().saveOutfit('Kept');
    store.getState().dismiss();
    expect(store.getState().chrome.dismissed).toBe(true);
    expect(store.getState().reconstruction).not.toBeNull();
    expect(store.getState().worn).toHaveLength(1);
    store.getState().restoreDismissed();
    expect(store.getState().chrome.dismissed).toBe(false);

    store.getState().clearFigure();
    expect(store.getState().reconstruction).toBeNull();
    expect(store.getState().worn).toEqual([]);
    expect(store.getState().savedOutfits.map((outfit) => outfit.id)).toEqual([saved]);
    expect(store.getState().chrome).toMatchObject({ dismissed: false, minimized: false });
  });

  it('ignores a bad reconstruction and remaps garments when a valid one arrives', () => {
    const store = createFigureStore(memory());
    store.getState().wear(tee);
    const before = store.getState().worn[0]?.transform.scaleX;
    store.getState().setReconstruction({ ...reconstruction(40, 100), id: 'bad' });
    expect(store.getState().reconstruction).toBeNull();
    store.getState().setReconstruction(reconstruction(70, 100));
    expect(store.getState().reconstruction?.normalizedBounds.width).toBe(70);
    // Generic shoulder ratio 0.28 becomes the reconstruction's 0.3, times the top factor 1.2.
    expect(before).toBeCloseTo(0.336);
    expect(store.getState().worn[0]?.transform.scaleX).toBeCloseTo(0.36);
    expect(store.getState().chrome.dismissed).toBe(false);
  });

  it('round-trips through storage and drops malformed payloads', async () => {
    const storage = memory();
    const first = createFigureStore(storage);
    first.getState().setReconstruction(reconstruction(40, 100));
    first.getState().wear(tee, 'M');
    first.getState().minimize();
    await Promise.resolve();

    const raw = storage.getItem(FIGURE_STORAGE_KEY);
    expect(typeof raw).toBe('string');

    const second = createFigureStore(storage);
    await second.persist.rehydrate();
    expect(second.getState().worn).toHaveLength(1);
    expect(second.getState().worn[0]?.size).toBe('M');
    expect(second.getState().chrome.minimized).toBe(true);
    expect(second.getState().reconstruction?.id).toBe(reconstruction(40, 100).id);

    storage.setItem(FIGURE_STORAGE_KEY, 'not-json');
    const broken = createFigureStore(storage);
    await broken.persist.rehydrate();
    expect(broken.getState().worn).toEqual([]);
    expect(broken.getState().reconstruction).toBeNull();

    storage.setItem(
      FIGURE_STORAGE_KEY,
      JSON.stringify({ state: { worn: 'nope', chrome: { corner: 'nope' } }, version: 1 }),
    );
    const invalid = createFigureStore(storage);
    await invalid.persist.rehydrate();
    expect(invalid.getState().worn).toEqual([]);
  });
});
