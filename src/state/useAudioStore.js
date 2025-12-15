import { create } from "zustand";

export const useAudioStore = create((set) => ({
  isMuted: false,
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setMuted: (muted) => set({ isMuted: muted }),
}));

