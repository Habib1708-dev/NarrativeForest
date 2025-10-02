// src/state/useCameraStore.js
import { create } from "zustand";
import * as THREE from "three";
import { getPoseAt, segmentAt } from "../utils/cameraInterp";

// Waypoint schema (JSDoc for type hints)
/**
 * @typedef {Object} Waypoint
 * @property {[number, number, number]} position
 * @property {{ lookAt: [number, number, number] } | { yaw: number, pitch: number }} orientation
 * @property {number} [fov]
 * @property {{ name?: 'linear'|'easeIn'|'easeOut'|'easeInOut'|'sineInOut', tension?: number }} [ease]
 * @property {string} [name]
 */

/** @type {Waypoint[]} */
const seedWaypoints = [
  // User-provided initial trio
  {
    name: "start-1",
    position: [1.652, -3.863, -7.868],
    orientation: { yaw: 2.56388867117967, pitch: -0.03490658503988659 },
    ease: { name: "sineInOut" },
  },
  {
    name: "start-2",
    position: [0.762, -3.825, -6.603],
    orientation: { yaw: 2.56388867117967, pitch: -0.03490658503988659 },
    ease: { name: "sineInOut" },
  },
  {
    name: "start-3",
    position: [-0.926, -3.791, -3.993],
    orientation: { yaw: 2.574360646691636, pitch: -0.2321287905152458 },
    ease: { name: "easeInOut" },
  },
  // New stops 4..8
  {
    name: "stop-4",
    position: [-2.831, -3.807, -3.871],
    orientation: {
      yaw: (Math.PI * -133.8) / 180,
      pitch: (Math.PI * -20.7) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-5",
    position: [-1.974, -4.492, -3.486],
    orientation: {
      yaw: (Math.PI * -148.1) / 180,
      pitch: (Math.PI * -17.1) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-6",
    position: [-2.2, -4.563, -3.141],
    orientation: {
      yaw: (Math.PI * -116.1) / 180,
      pitch: (Math.PI * 20.9) / 180,
    },
    ease: { name: "easeInOut" },
  },
  {
    name: "stop-7",
    position: [-1.976, -4.238, -2.981],
    orientation: {
      yaw: (Math.PI * -105.9) / 180,
      pitch: (Math.PI * -26.2) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-8",
    position: [-1.545, -4.355, -3.103],
    orientation: {
      yaw: (Math.PI * 135.8) / 180,
      pitch: (Math.PI * -1.8) / 180,
    },
    ease: { name: "sineInOut" },
  },
  // New stops 9..13
  {
    name: "stop-9",
    position: [-2.628, -4.255, -1.903],
    orientation: {
      yaw: (Math.PI * -43.4) / 180,
      pitch: (Math.PI * -0.2) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-10",
    position: [-2.547, -4.174, -1.105],
    orientation: {
      yaw: (Math.PI * -20.0) / 180,
      pitch: (Math.PI * -3.1) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-11",
    position: [-0.482, -3.772, -1.679],
    orientation: {
      yaw: (Math.PI * 61.4) / 180,
      pitch: (Math.PI * -21.5) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-12",
    position: [-1.122, -3.951, -3.717],
    orientation: {
      yaw: (Math.PI * 155.6) / 180,
      pitch: (Math.PI * -14.5) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-13",
    position: [-3.184, -4.185, -2.224],
    orientation: { yaw: (Math.PI * -92.8) / 180, pitch: (Math.PI * 4.3) / 180 },
    ease: { name: "sineInOut" },
  },
  // Additional user-provided stops
  {
    name: "stop-14",
    position: [-0.63, -3.763, -4.098],
    orientation: {
      yaw: (Math.PI * 138.1) / 180,
      pitch: (Math.PI * -18.7) / 180,
    },
    ease: { name: "sineInOut" },
  },
  // Stop 15 (down-look) and ring journey around a fixed target
  // Fixed target center (XZ from stop-15, Y near ground)
  {
    name: "stop-15-down",
    position: [-1.737, -2.49, -2.663],
    orientation: { lookAt: [-1.737, -3.9, -2.663], roll: Math.PI },
    ease: { name: "sineInOut" },
  },
  // Transition to more horizontal view while still looking at the same center
  {
    name: "ring-entry",
    position: [0.008, -4.065, -2.946],
    orientation: { lookAt: [-1.737, -3.9, -2.663] },
    ease: { name: "sineInOut" },
  },
  // Ring journey "almost following" the provided points; all look at the fixed center
  {
    name: "ring-1",
    position: [-0.698, -4.149, -1.209],
    orientation: { lookAt: [-1.737, -3.9, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-2",
    position: [-2.568, -4.3, -1.079],
    orientation: { lookAt: [-1.737, -3.9, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-3",
    position: [-3.459, -4.2, -3.124],
    orientation: { lookAt: [-1.737, -3.9, -2.663] },
    ease: { name: "sineInOut" },
  },
  // Added midpoint to follow the arc between ring-3 and ring-4 while keeping the same focus
  {
    name: "ring-3a",
    position: [-2.346, -4.057, -4.336],
    orientation: { lookAt: [-1.737, -3.9, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-4",
    position: [-0.73, -3.914, -4.129],
    orientation: { lookAt: [-1.737, -3.9, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-close",
    position: [-1.737, -4.0, -2.663],
    // Horizontal lens: yaw-only, no pitch/roll
    orientation: { yaw: (Math.PI * 145.5) / 180, pitch: 0 },
    ease: { name: "sineInOut" },
  },
  // New sequence: start looking upward, then gradually lower again with midpoints to smooth transitions
  {
    name: "seq-1",
    position: [-1.42, -3.363, -2.194],
    // Adjusted to start slightly upward for skyward feel
    orientation: { yaw: (Math.PI * 137.3) / 180, pitch: (Math.PI * 8.0) / 180 },
    ease: { name: "sineInOut" },
  },
  {
    name: "seq-2",
    position: [-2.429, -4.394, -1.081],
    orientation: {
      yaw: (Math.PI * 135.0) / 180,
      pitch: (Math.PI * 31.2) / 180,
    },
    ease: { name: "sineInOut" },
  },
  // Midpoint between seq-2 and seq-3 to ease pitch from 31.2° downwards
  {
    name: "seq-2-3-mid",
    position: [-5.2935, -3.9515, -1.083],
    orientation: {
      yaw: (Math.PI * 93.75) / 180,
      pitch: (Math.PI * 15.1) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "seq-3",
    position: [-8.158, -3.509, -1.085],
    orientation: { yaw: (Math.PI * 52.5) / 180, pitch: (Math.PI * -1.0) / 180 },
    ease: { name: "sineInOut" },
  },
  // Midpoint toward the final to smooth yaw/pitch
  {
    name: "seq-3-4-mid",
    position: [-8.735, -3.2895, -2.3175],
    orientation: {
      yaw: (Math.PI * 23.05) / 180,
      pitch: (Math.PI * 11.25) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "seq-4",
    position: [-9.312, -3.07, -3.55],
    orientation: { yaw: (Math.PI * -6.4) / 180, pitch: (Math.PI * 23.5) / 180 },
    ease: { name: "sineInOut" },
  },
  // Final: small upward move and slight upward tilt, continuing the motion in a gentle arc
  {
    name: "last-stop",
    position: [-8.85, -2.82, -4.38],
    orientation: { yaw: (Math.PI * -20.0) / 180, pitch: (Math.PI * 5.0) / 180 },
    ease: { name: "sineInOut" },
  },
];

export const useCameraStore = create((set, get) => ({
  waypoints: seedWaypoints,
  // normalized [0..1]
  t: 0,
  // dev flags
  enabled: false,
  paused: false,
  locked: false, // if true, controller won't overwrite current camera
  // gizmo toggles per waypoint name
  gizmos: Object.fromEntries(seedWaypoints.map((w) => [w.name ?? "wp", false])),

  setT: (t) => set({ t: Math.max(0, Math.min(1, t)) }),
  setEnabled: (v) => set({ enabled: !!v }),
  setPaused: (v) => set({ paused: !!v }),
  setLocked: (v) => set({ locked: !!v }),
  setGizmo: (name, v) => set((s) => ({ gizmos: { ...s.gizmos, [name]: !!v } })),
  toggleGizmo: (name) =>
    set((s) => ({ gizmos: { ...s.gizmos, [name]: !s.gizmos[name] } })),
  jumpToWaypoint: (index) => {
    const count = get().waypoints.length;
    if (count <= 1) return;
    const nSeg = count - 1;
    const clamped = Math.max(0, Math.min(count - 1, index));
    const t = clamped / nSeg;
    set({ t });
  },

  // Derived selectors (pure): compute pose and segment index
  getPose: (t) => {
    const waypoints = get().waypoints;
    const { position, quaternion, fov, segmentIndex } = getPoseAt(
      waypoints,
      t ?? get().t
    );
    return { position, quaternion, fov, segmentIndex };
  },
  getSegmentIndex: (t) => {
    const wps = get().waypoints;
    const { i } = segmentAt(t ?? get().t, wps.length);
    return i;
  },
}));
