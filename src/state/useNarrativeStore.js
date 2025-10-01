import { create } from "zustand";

// Minimal stub to satisfy existing components that import this store.
// Keeps exploration mode off by default.
export const useNarrativeStore = create((set) => ({
  step: 0,
  isExplorationMode: false,
  waypoints: [
    { position: [-5, 3, 8], lookAt: [0, 0.5, 0] },
    { position: [-3, 2.5, 5], lookAt: [-1, 0.5, 0] },
  ],
  setStep: (n) => set({ step: n }),
  setExplorationMode: (v) => set({ isExplorationMode: !!v }),
}));
