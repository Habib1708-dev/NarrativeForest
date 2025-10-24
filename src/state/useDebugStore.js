// src/state/useDebugStore.js
import { create } from "zustand";

/**
 * Debug mode store
 * Controls whether the application is in debug mode (with performance monitor, Leva controls, free camera)
 * or user mode (narrative camera, clean UI)
 */
export const useDebugStore = create((set) => ({
  // Debug mode is disabled by default (user mode)
  isDebugMode: false,

  // Toggle debug mode on/off
  toggleDebugMode: () =>
    set((state) => {
      const newMode = !state.isDebugMode;
      console.log(
        `🔧 Debug mode ${newMode ? "ENABLED" : "DISABLED"}`,
        newMode
          ? "\n  - Performance monitor visible\n  - Leva controls visible\n  - Free camera movement enabled"
          : "\n  - Narrative camera active\n  - Clean UI mode"
      );
      return { isDebugMode: newMode };
    }),

  // Explicit setters if needed
  setDebugMode: (enabled) => set({ isDebugMode: enabled }),
}));
