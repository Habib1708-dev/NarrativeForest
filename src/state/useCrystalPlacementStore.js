import { create } from "zustand";

const CABIN_Y_PLUS_ONE = -3.85;
const CABIN_CENTER = [-2.3, CABIN_Y_PLUS_ONE, -2.7];

const TALL_ROD_COUNT = 12;
const DEFAULT_STEP = 0.05;
const DEFAULT_ROTATION_STEP_DEG = 5;
const DEFAULT_SCALE_STEP = 0.01;
const SCALE_MIN = 0.01;
const SCALE_MAX = 3;

const round3 = (value) => Number(value.toFixed(3));

function makeTallRod(index) {
  return {
    id: `tallRod-${String(index + 1).padStart(2, "0")}`,
    type: "tallRod",
    position: [round3(CABIN_CENTER[0]), round3(CABIN_CENTER[1]), round3(CABIN_CENTER[2])],
    rotationX: 0,
    rotationY: round3((index % 8) * 0.4),
    rotationZ: 0,
    scale: round3(0.1),
    scaleX: round3(0.1),
    scaleY: round3(0.1),
    edited: false,
  };
}

function createDefaultObjects() {
  return Array.from({ length: TALL_ROD_COUNT }, (_, i) => makeTallRod(i));
}

export const useCrystalPlacementStore = create((set, get) => ({
  initialized: false,
  /** Set of selected object ids; transforms apply to all selected */
  selectedIds: new Set(),
  step: DEFAULT_STEP,
  rotationStepDeg: DEFAULT_ROTATION_STEP_DEG,
  scaleStep: DEFAULT_SCALE_STEP,
  objects: [],

  initialize: () =>
    set((state) => {
      if (state.initialized) return state;
      const defaults = createDefaultObjects();
      return {
        initialized: true,
        objects: defaults,
        selectedIds: new Set(),
      };
    }),

  toggleSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),

  selectAll: () =>
    set((state) => ({
      selectedIds: new Set(state.objects.map((o) => o.id)),
    })),

  clearSelection: () => set({ selectedIds: new Set() }),

  setStep: (value) => set({ step: value }),
  setRotationStepDeg: (value) => set({ rotationStepDeg: value }),
  setScaleStep: (value) => set({ scaleStep: value }),

  nudgeSelected: (axis, amount) => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;
    const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    set((state) => ({
      objects: state.objects.map((entry) => {
        if (!selectedIds.has(entry.id)) return entry;
        const nextPosition = [...entry.position];
        nextPosition[axisIndex] = round3(nextPosition[axisIndex] + amount);
        return { ...entry, position: nextPosition, edited: true };
      }),
    }));
  },

  nudgeSelectedScale: (amount) => {
    const { selectedIds, scaleStep } = get();
    if (selectedIds.size === 0) return;
    const delta = amount * scaleStep;
    set((state) => ({
      objects: state.objects.map((entry) => {
        if (!selectedIds.has(entry.id)) return entry;
        const nextScale = round3(Math.max(SCALE_MIN, Math.min(SCALE_MAX, entry.scale + delta)));
        return { ...entry, scale: nextScale, edited: true };
      }),
    }));
  },

  nudgeSelectedScaleX: (amount) => {
    const { selectedIds, scaleStep } = get();
    if (selectedIds.size === 0) return;
    const delta = amount * scaleStep;
    set((state) => ({
      objects: state.objects.map((entry) => {
        if (!selectedIds.has(entry.id)) return entry;
        const current = entry.scaleX ?? entry.scale;
        const next = round3(Math.max(SCALE_MIN, Math.min(SCALE_MAX, current + delta)));
        return { ...entry, scaleX: next, edited: true };
      }),
    }));
  },

  nudgeSelectedScaleY: (amount) => {
    const { selectedIds, scaleStep } = get();
    if (selectedIds.size === 0) return;
    const delta = amount * scaleStep;
    set((state) => ({
      objects: state.objects.map((entry) => {
        if (!selectedIds.has(entry.id)) return entry;
        const current = entry.scaleY ?? entry.scale;
        const next = round3(Math.max(SCALE_MIN, Math.min(SCALE_MAX, current + delta)));
        return { ...entry, scaleY: next, edited: true };
      }),
    }));
  },

  nudgeSelectedRotation: (axis, amountRad) => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;
    const key = axis === "x" ? "rotationX" : axis === "y" ? "rotationY" : "rotationZ";
    set((state) => ({
      objects: state.objects.map((entry) => {
        if (!selectedIds.has(entry.id)) return entry;
        const current = entry[key] ?? 0;
        const next = round3(current + amountRad);
        return { ...entry, [key]: next, edited: true };
      }),
    }));
  },
}));
