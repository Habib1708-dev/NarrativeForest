import { create } from "zustand";

export const useSeasonStore = create((set) => ({
  season: "summer", // summer, autumn, winter, spring
  timeOfDay: "day", // day, night

  setSeason: (season) => set({ season }),
  setTimeOfDay: (timeOfDay) => set({ timeOfDay }),

  // Environment parameters per season
  parameters: {
    summer: {
      fogColor: "#c8e6f5",
      fogDensity: 0.015,
      grassColor: "#2d5a27",
      treeColor: "#1a4f15",
      skyColor: "#87ceeb",
    },
    autumn: {
      fogColor: "#d3d3d3",
      fogDensity: 0.03,
      grassColor: "#8b7355",
      treeColor: "#8b4513",
      skyColor: "#b8c6db",
    },
    winter: {
      fogColor: "#e8eef1",
      fogDensity: 0.04,
      grassColor: "#f0f8ff",
      treeColor: "#463e3f",
      skyColor: "#dce1e4",
    },
    spring: {
      fogColor: "#e6f3ff",
      fogDensity: 0.02,
      grassColor: "#90ee90",
      treeColor: "#98fb98",
      skyColor: "#87ceeb",
    },
  },
}));
