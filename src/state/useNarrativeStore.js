import { create } from "zustand";

export const useNarrativeStore = create((set) => ({
  step: 0, // Current narrative step
  isExplorationMode: false, // Whether we're in guided or free exploration mode
  waypoints: [
    {
      position: [3, 2, 5],
      lookAt: [0, 0, 0],
      text: "Welcome to the Narrative Forest. Click to begin your journey.",
    },
    // More waypoints will be added here
  ],

  setStep: (step) => set({ step }),
  nextStep: () =>
    set((state) => ({
      step: state.step + 1,
      isExplorationMode: state.step + 1 >= state.waypoints.length,
    })),
  setExplorationMode: (isExplorationMode) => set({ isExplorationMode }),
}));
