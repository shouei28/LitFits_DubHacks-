import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  BodyReconstructionSchema,
  CatalogProductSchema,
  CLEAR_FIGURE_EXPLANATION,
  DEFAULT_BODY_ASPECT,
  DEFAULT_CHROME,
  DISMISS_FIGURE_EXPLANATION,
  FIGURE_STORAGE_KEY,
  FigurePersistedSchema,
  LAYER_ORDER,
  frameAspect,
  placementFor,
  type BodyReconstruction,
  type CatalogProduct,
  type FigureChrome,
  type FigureCorner,
  type FigurePersisted,
  type SavedOutfit,
  type WornGarment,
} from '@fitmirror/shared';

export { CLEAR_FIGURE_EXPLANATION, DISMISS_FIGURE_EXPLANATION, FIGURE_STORAGE_KEY };

const HISTORY_LIMIT = 20;

export type FigureState = FigurePersisted & {
  history: WornGarment[][];
  future: WornGarment[][];
  setReconstruction: (reconstruction: BodyReconstruction) => void;
  /** Add or replace the garment in its category. A dress replaces top and bottom, and either replaces a dress. */
  wear: (product: CatalogProduct, size?: string | null) => void;
  removeWorn: (productId: string) => void;
  clearWorn: () => void;
  /** Returns the new outfit id, or null when the name is empty or nothing is worn. */
  saveOutfit: (name: string) => string | null;
  restoreOutfit: (id: string) => void;
  deleteSavedOutfit: (id: string) => void;
  dismiss: () => void;
  restoreDismissed: () => void;
  minimize: () => void;
  expand: () => void;
  setCorner: (corner: FigureCorner) => void;
  setAnchor: (anchor: { x: number; y: number } | null) => void;
  /** Deletes the reconstruction and worn garments. Saved outfits stay. */
  clearFigure: () => void;
  undo: () => void;
  redo: () => void;
};

function emptyPersisted(): FigurePersisted {
  return {
    reconstruction: null,
    worn: [],
    savedOutfits: [],
    chrome: { ...DEFAULT_CHROME },
  };
}

function aspectOf(reconstruction: BodyReconstruction | null): number {
  if (!reconstruction) return DEFAULT_BODY_ASPECT;
  return frameAspect(reconstruction.normalizedBounds);
}

function remapWorn(
  worn: readonly WornGarment[],
  reconstruction: BodyReconstruction | null,
): WornGarment[] {
  const aspect = aspectOf(reconstruction);
  return worn.map((item) => ({
    ...item,
    transform: placementFor(item.category, aspect, reconstruction?.proportions),
  }));
}

function wornFromProduct(
  product: CatalogProduct,
  size: string | null | undefined,
  reconstruction: BodyReconstruction | null,
): WornGarment {
  const available = product.availableSizes ?? [];
  const chosen =
    size == null
      ? null
      : (available.find((label) => label.toLowerCase() === size.toLowerCase()) ?? null);
  const overlayKind = product.transparentImageUrl
    ? 'transparent'
    : product.tryOnAsset === 'none'
      ? 'none'
      : 'schematic';
  return {
    productId: product.id,
    category: product.category,
    layerOrder: LAYER_ORDER[product.category],
    size: chosen,
    title: product.title,
    color: product.color ?? null,
    source: product.source,
    transform: placementFor(
      product.category,
      aspectOf(reconstruction),
      reconstruction?.proportions,
    ),
    overlayHref: overlayKind === 'transparent' ? (product.transparentImageUrl ?? null) : null,
    overlayKind,
  };
}

function applyWear(worn: readonly WornGarment[], next: WornGarment): WornGarment[] {
  const kept = worn.filter((item) => {
    if (item.productId === next.productId) return false;
    if (item.category === next.category) return false;
    if (next.category === 'dress' && (item.category === 'top' || item.category === 'bottom')) {
      return false;
    }
    if ((next.category === 'top' || next.category === 'bottom') && item.category === 'dress') {
      return false;
    }
    return true;
  });
  return [...kept, next].sort(
    (a, b) => a.layerOrder - b.layerOrder || a.title.localeCompare(b.title),
  );
}

function withWornHistory(
  state: FigureState,
  worn: WornGarment[],
): Pick<FigureState, 'worn' | 'history' | 'future'> {
  return {
    worn,
    history: [...state.history, state.worn].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function creator(): StateCreator<FigureState, [], [['zustand/persist', FigurePersisted]]> {
  return (set, get) => ({
    ...emptyPersisted(),
    history: [],
    future: [],
    setReconstruction: (reconstruction) => {
      const parsed = BodyReconstructionSchema.safeParse(reconstruction);
      if (!parsed.success) return;
      set((state) => ({
        reconstruction: parsed.data,
        worn: remapWorn(state.worn, parsed.data),
        chrome: { ...state.chrome, dismissed: false, minimized: false },
      }));
    },
    wear: (product, size) => {
      const parsed = CatalogProductSchema.safeParse(product);
      if (!parsed.success) return;
      const next = wornFromProduct(parsed.data, size, get().reconstruction);
      set((state) => withWornHistory(state, applyWear(state.worn, next)));
    },
    removeWorn: (productId) => {
      set((state) => {
        if (!state.worn.some((item) => item.productId === productId)) return {};
        return withWornHistory(
          state,
          state.worn.filter((item) => item.productId !== productId),
        );
      });
    },
    clearWorn: () => {
      set((state) => {
        if (state.worn.length === 0) return {};
        return withWornHistory(state, []);
      });
    },
    saveOutfit: (name) => {
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > 80) return null;
      const { worn, savedOutfits } = get();
      if (worn.length === 0) return null;
      const outfit: SavedOutfit = {
        id: crypto.randomUUID(),
        name: trimmed,
        garments: worn.map((item) => ({ ...item, transform: { ...item.transform } })),
        createdAt: new Date().toISOString(),
      };
      const parsed = FigurePersistedSchema.shape.savedOutfits.element.safeParse(outfit);
      if (!parsed.success) return null;
      set({ savedOutfits: [...savedOutfits, parsed.data] });
      return parsed.data.id;
    },
    restoreOutfit: (id) => {
      const outfit = get().savedOutfits.find((item) => item.id === id);
      if (!outfit) return;
      const worn = remapWorn(outfit.garments, get().reconstruction);
      set((state) => ({
        ...withWornHistory(state, worn),
        chrome: { ...state.chrome, dismissed: false, minimized: false },
      }));
    },
    deleteSavedOutfit: (id) => {
      set((state) => ({
        savedOutfits: state.savedOutfits.filter((outfit) => outfit.id !== id),
      }));
    },
    dismiss: () => {
      set((state) => ({
        chrome: { ...state.chrome, dismissed: true, minimized: false },
      }));
    },
    restoreDismissed: () => {
      set((state) => ({
        chrome: { ...state.chrome, dismissed: false },
      }));
    },
    minimize: () => {
      set((state) => ({
        chrome: { ...state.chrome, minimized: true, dismissed: false },
      }));
    },
    expand: () => {
      set((state) => ({ chrome: { ...state.chrome, minimized: false } }));
    },
    setCorner: (corner) => {
      set((state) => ({
        chrome: { ...state.chrome, corner, anchor: null },
      }));
    },
    setAnchor: (anchor) => {
      if (anchor) {
        const parsed = FigurePersistedSchema.shape.chrome.shape.anchor.safeParse(anchor);
        if (!parsed.success) return;
      }
      set((state) => ({
        chrome: { ...state.chrome, anchor },
      }));
    },
    clearFigure: () => {
      set((state) => ({
        ...(state.reconstruction || state.worn.length > 0 ? withWornHistory(state, []) : {}),
        reconstruction: null,
        worn: [],
        chrome: { ...DEFAULT_CHROME },
      }));
    },
    undo: () => {
      set((state) => {
        const previous = state.history.at(-1);
        if (!previous) return {};
        return {
          history: state.history.slice(0, -1),
          future: [state.worn, ...state.future].slice(0, HISTORY_LIMIT),
          worn: previous,
        };
      });
    },
    redo: () => {
      set((state) => {
        const next = state.future[0];
        if (!next) return {};
        return {
          future: state.future.slice(1),
          history: [...state.history, state.worn].slice(-HISTORY_LIMIT),
          worn: next,
        };
      });
    },
  });
}

function sanitizeFigureStorage(inner: StateStorage): StateStorage {
  return {
    getItem: (name) => {
      try {
        const raw = inner.getItem(name);
        if (raw instanceof Promise) {
          return raw
            .then((value) => (typeof value === 'string' ? sanitizeEnvelope(value) : null))
            .catch(() => null);
        }
        return typeof raw === 'string' ? sanitizeEnvelope(raw) : null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => inner.setItem(name, value),
    removeItem: (name) => inner.removeItem(name),
  };
}

function sanitizeEnvelope(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { state?: unknown; version?: unknown };
    if (parsed.version !== 1) return null;
    const state = FigurePersistedSchema.safeParse(parsed.state);
    if (!state.success) return null;
    return JSON.stringify({ state: state.data, version: 1 });
  } catch {
    return null;
  }
}

export function createFigureStore(storage: StateStorage) {
  return create<FigureState>()(
    persist(creator(), {
      name: FIGURE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => sanitizeFigureStorage(storage)),
      skipHydration: true,
      partialize: (state) => ({
        reconstruction: state.reconstruction,
        worn: state.worn,
        savedOutfits: state.savedOutfits,
        chrome: state.chrome,
      }),
      merge: (persistedState, currentState) => {
        const parsed = FigurePersistedSchema.safeParse(persistedState);
        if (!parsed.success) return currentState;
        return {
          ...currentState,
          reconstruction: parsed.data.reconstruction,
          worn: parsed.data.worn,
          savedOutfits: parsed.data.savedOutfits,
          chrome: parsed.data.chrome,
        };
      },
    }),
  );
}

function browserStorage(): StateStorage {
  if (typeof window === 'undefined') {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
  }
  return window.localStorage;
}

export const useFigureStore = createFigureStore(browserStorage());

if (typeof window !== 'undefined') {
  void useFigureStore.persist.rehydrate();
}

export function chromeUsesAnchor(chrome: FigureChrome): boolean {
  return chrome.anchor !== null && !chrome.dismissed && !chrome.minimized;
}
