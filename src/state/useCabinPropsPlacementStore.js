import { create } from "zustand";

const DEFAULT_STEP = 0.05;
const DEFAULT_ROTATION_STEP_DEG = 5;
const DEFAULT_SCALE_STEP = 0.01;
const SCALE_MIN = 0.01;
const SCALE_MAX = 3;

const round3 = (value) => Number(value.toFixed(3));

// Placed cabin props (27 rocks + 11 trees). rock-18..27 are placeable extras.
const CABIN_PROPS_DEFAULTS = [
  { id: "rock-01", type: "rock", position: [-0.9, -4.85, -2.2], rotationX: -1.479, rotationY: 1.218, rotationZ: 1.305, scale: 0.34, edited: false },
  { id: "rock-02", type: "rock", position: [-0.7, -4.92, -2.51], rotationX: -4.35, rotationY: -1.37, rotationZ: -3.219, scale: 0.268, edited: false },
  { id: "rock-03", type: "rock", position: [-0.7, -4.92, -2.8], rotationX: 0.174, rotationY: -2.044, rotationZ: 0, scale: 0.336, edited: false },
  { id: "rock-04", type: "rock", position: [-1, -4.75, -3.8], rotationX: 1.05, rotationY: -0.893, rotationZ: -2.015, scale: 0.274, edited: false },
  { id: "rock-05", type: "rock", position: [-1.7, -4.8, -4], rotationX: 2.096, rotationY: 1.218, rotationZ: -2.096, scale: 0.322, edited: false },
  { id: "rock-06", type: "rock", position: [-1.4, -4.81, -3.8], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.29, edited: false },
  { id: "rock-07", type: "rock", position: [-0.6, -4.95, -3.2], rotationX: -4.454, rotationY: 0.37, rotationZ: -1.834, scale: 0.298, edited: false },
  { id: "rock-08", type: "rock", position: [-0.7, -4.85, -3.5], rotationX: -2.62, rotationY: 0.74, rotationZ: 0, scale: 0.2, edited: false },
  { id: "rock-09", type: "rock", position: [-2.1, -4.75, -2.1], rotationX: -2.882, rotationY: 0.848, rotationZ: 0, scale: 0.198, edited: false },
  { id: "rock-10", type: "rock", position: [-2.4, -4.75, -2], rotationX: -6.55, rotationY: -0.616, rotationZ: -2.096, scale: 0.226, edited: false },
  { id: "rock-11", type: "rock", position: [-2.8, -4.85, -2], rotationX: -1.834, rotationY: 2.358, rotationZ: 0, scale: 0.314, edited: false },
  { id: "rock-12", type: "rock", position: [-2.9, -4.85, -2.4], rotationX: 0, rotationY: 2.99, rotationZ: -0.786, scale: 0.252, edited: false },
  { id: "rock-13", type: "rock", position: [-3, -4.85, -2.7], rotationX: 0, rotationY: 0.74, rotationZ: 0, scale: 0.29, edited: false },
  { id: "rock-14", type: "rock", position: [-2.9, -4.85, -3.2], rotationX: 0, rotationY: 2.158, rotationZ: 0, scale: 0.228, edited: false },
  { id: "rock-15", type: "rock", position: [-2.3, -4.75, -3.9], rotationX: 0, rotationY: 0.694, rotationZ: 0, scale: 0.29, edited: false },
  { id: "rock-16", type: "rock", position: [-2.7, -4.75, -3.6], rotationX: 0, rotationY: -0.262, rotationZ: -1.834, scale: 0.238, edited: false },
  { id: "rock-17", type: "rock", position: [-1.4, -4.8, -2.2], rotationX: 0, rotationY: -2.25, rotationZ: 0, scale: 0.186, edited: false },
  { id: "rock-18", type: "rock", position: [-1.25, -3.85, -2.65], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.22, edited: false },
  { id: "rock-19", type: "rock", position: [-1.35, -3.85, -2.7], rotationX: 0, rotationY: 0.5, rotationZ: 0, scale: 0.24, edited: false },
  { id: "rock-20", type: "rock", position: [-1.4, -4.7, -1.45], rotationX: -1.131, rotationY: 1, rotationZ: 0, scale: 0.26, edited: false },
  { id: "rock-21", type: "rock", position: [-3.13, -4.9, -1.38], rotationX: 0, rotationY: 0.804, rotationZ: 0, scale: 0.53, edited: false },
  { id: "rock-22", type: "rock", position: [-2.27, -4.7, -1.32], rotationX: 0.348, rotationY: -0.523, rotationZ: 0.261, scale: 0.29, edited: false },
  { id: "rock-23", type: "rock", position: [-0.77, -4.75, -1.78], rotationX: 0, rotationY: 2.5, rotationZ: 0, scale: 0.23, edited: false },
  { id: "rock-24", type: "rock", position: [-0.33, -4.9, -2.42], rotationX: -0.087, rotationY: 1.956, rotationZ: 0, scale: 0.3, edited: false },
  { id: "rock-25", type: "rock", position: [-2.81, -4.85, -2.91], rotationX: 0, rotationY: 3.5, rotationZ: 0, scale: 0.21, edited: false },
  { id: "rock-26", type: "rock", position: [-1.31, -3.85, -2.69], rotationX: 0, rotationY: 4, rotationZ: 0, scale: 0.27, edited: false },
  { id: "rock-27", type: "rock", position: [-1.29, -3.85, -2.74], rotationX: 0, rotationY: 4.5, rotationZ: 0, scale: 0.22, edited: false },
  { id: "tree-01", type: "tree", position: [-3.1, -4.75, -2.7], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.05, edited: false },
  { id: "tree-02", type: "tree", position: [-3.4, -4.95, -3.1], rotationX: 0, rotationY: 0.29, rotationZ: 0, scale: 0.036, edited: false },
  { id: "tree-03", type: "tree", position: [-2.8, -4.75, -4], rotationX: 0, rotationY: 0.58, rotationZ: 0, scale: 0.047, edited: false },
  { id: "tree-04", type: "tree", position: [-0.3, -4.9, -2.75], rotationX: 0, rotationY: -0.215, rotationZ: 0, scale: 0.023, edited: false },
  { id: "tree-05", type: "tree", position: [-1.2, -4.85, -1.9], rotationX: 0, rotationY: -1.31, rotationZ: 0, scale: 0.044, edited: false },
  { id: "tree-06", type: "tree", position: [-2.6, -4.75, -1.6], rotationX: 0, rotationY: 0.29, rotationZ: 0, scale: 0.045, edited: false },
  { id: "tree-07", type: "tree", position: [-2.05, -4.75, -1.9], rotationX: 0, rotationY: 0.58, rotationZ: 0, scale: 0.045, edited: false },
  { id: "tree-08", type: "tree", position: [-1.8, -4.65, -1.25], rotationX: 0, rotationY: 0.87, rotationZ: 0, scale: 0.046, edited: false },
  { id: "tree-09", type: "tree", position: [-0.65, -4.7, -1.55], rotationX: -0.035, rotationY: -2.079, rotationZ: 0, scale: 0.022, edited: false },
  { id: "tree-10", type: "tree", position: [0.15, -4.8, -2.7], rotationX: 0, rotationY: 0.29, rotationZ: 0, scale: 0.058, edited: false },
  { id: "tree-11", type: "tree", position: [-0.6, -4.75, -4.3], rotationX: 0, rotationY: 0.58, rotationZ: 0, scale: 0.034, edited: false },
];

function createDefaultObjects() {
  return CABIN_PROPS_DEFAULTS.map((entry) => ({ ...entry }));
}

// Exported for use in Cabin component (baked placement)
export const CABIN_PROPS_PLACED_ROCKS = CABIN_PROPS_DEFAULTS.filter((e) => e.type === "rock");
export const CABIN_PROPS_PLACED_TREES = CABIN_PROPS_DEFAULTS.filter((e) => e.type === "tree");

export const useCabinPropsPlacementStore = create((set, get) => ({
  initialized: false,
  activeObjectId: null,
  step: DEFAULT_STEP,
  objects: [],

  initialize: () =>
    set((state) => {
      if (state.initialized) return state;
      const defaults = createDefaultObjects();
      return {
        initialized: true,
        objects: defaults,
        activeObjectId: defaults[0]?.id ?? null,
      };
    }),

  setActiveObject: (id) => set({ activeObjectId: id }),

  setStep: (value) => set({ step: value }),

  rotationStepDeg: DEFAULT_ROTATION_STEP_DEG,
  scaleStep: DEFAULT_SCALE_STEP,
  setRotationStepDeg: (value) => set({ rotationStepDeg: value }),
  setScaleStep: (value) => set({ scaleStep: value }),

  nudgeActiveObject: (axis, amount) => {
    const { activeObjectId } = get();
    if (!activeObjectId) return;
    const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    set((state) => ({
      objects: state.objects.map((entry) => {
        if (entry.id !== activeObjectId) return entry;
        const nextPosition = [...entry.position];
        nextPosition[axisIndex] = round3(nextPosition[axisIndex] + amount);
        return {
          ...entry,
          position: nextPosition,
          edited: true,
        };
      }),
    }));
  },

  nudgeActiveScale: (amount) => {
    const { activeObjectId, scaleStep } = get();
    if (!activeObjectId) return;
    const delta = amount * scaleStep;
    set((state) => ({
      objects: state.objects.map((entry) => {
        if (entry.id !== activeObjectId) return entry;
        const nextScale = round3(Math.max(SCALE_MIN, Math.min(SCALE_MAX, entry.scale + delta)));
        return { ...entry, scale: nextScale, edited: true };
      }),
    }));
  },

  nudgeActiveRotation: (axis, amountRad) => {
    const { activeObjectId } = get();
    if (!activeObjectId) return;
    const key = axis === "x" ? "rotationX" : axis === "y" ? "rotationY" : "rotationZ";
    set((state) => ({
      objects: state.objects.map((entry) => {
        if (entry.id !== activeObjectId) return entry;
        const current = entry[key] ?? 0;
        const next = round3(current + amountRad);
        return { ...entry, [key]: next, edited: true };
      }),
    }));
  },
}));

