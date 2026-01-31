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
    set((state) => ({ isDebugMode: !state.isDebugMode })),

  // Explicit setters if needed
  setDebugMode: (enabled) => set({ isDebugMode: enabled }),
}));
