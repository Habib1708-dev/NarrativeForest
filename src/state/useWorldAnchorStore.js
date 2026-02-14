import { create } from "zustand";
import * as THREE from "three";

/**
 * WorldAnchor Store
 *
 * Manages the coordinate space authority for the terrain and procedural props system.
 *
 * Two modes:
 * - AUTHORED: Terrain and props sample in absolute world space (default)
 * - FREEFLIGHT: Terrain and props sample relative to the anchor origin
 *
 * When freeflight activates, the anchor origin is set to the camera position at that moment.
 * This creates a natural spatial discontinuity that makes the authored area unreachable
 * unless the user intentionally flies back the full distance.
 */
export const useWorldAnchorStore = create((set, get) => ({
  // Core state
  mode: "AUTHORED", // "AUTHORED" | "FREEFLIGHT"
  origin: new THREE.Vector3(0, 0, 0),

  // Distance tracking (for effects like fog, audio, etc.)
  distanceFromOrigin: 0,

  /**
   * Activate freeflight mode at the given camera position.
   * The camera position becomes the new origin for terrain/prop sampling.
   */
  setFreeflightMode: (cameraPosition) => {
    const origin = cameraPosition.clone();
    set({
      mode: "FREEFLIGHT",
      origin,
      distanceFromOrigin: 0
    });
  },

  /**
   * Return to authored mode with origin at world origin.
   */
  setAuthoredMode: () => {
    set({
      mode: "AUTHORED",
      origin: new THREE.Vector3(0, 0, 0),
      distanceFromOrigin: 0
    });
  },

  /**
   * Update the distance from the anchor origin (call each frame in freeflight).
   * This distance can drive effects like fog density, audio fading, etc.
   */
  updateDistance: (cameraPosition) => {
    const { origin } = get();
    const dist = cameraPosition.distanceTo(origin);
    set({ distanceFromOrigin: dist });
  },

  /**
   * Get the travel offset (camera position - anchor origin).
   * Used by terrain shaders to offset sampling coordinates.
   */
  getTravelOffset: (cameraPosition) => {
    const { mode, origin } = get();
    if (mode === "AUTHORED") {
      return { x: 0, z: 0 };
    }
    return {
      x: -origin.x,
      z: -origin.z
    };
  },

  /**
   * Check if currently in freeflight mode.
   */
  isFreeflight: () => get().mode === "FREEFLIGHT",
}));
