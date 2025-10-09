// src/state/useCameraStore.js
import { create } from "zustand";
import { getPoseAt, segmentAt } from "../utils/cameraInterp";

/**
 * @typedef {Object} Waypoint
 * @property {[number, number, number]} position
 * @property {{ lookAt: [number, number, number] } | { yaw: number, pitch: number }} orientation
 * @property {number} [fov]
 * @property {{ name?: 'linear'|'easeIn'|'easeOut'|'easeInOut'|'sineInOut', tension?: number }} [ease]
 * @property {string} [name]
 */

// ---------------------- Waypoints (unchanged) ----------------------
/** @type {Waypoint[]} */
const seedWaypoints = [
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
  {
    name: "stop-4",
    position: [-2.831, -3.807, -3.871],
    orientation: {
      yaw: (Math.PI * -133.8) / 180,
      pitch: (Math.PI * -20.7) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-4-5-mid",
    position: [-2.4025, -3.8495, -3.6785],
    orientation: {
      yaw: (Math.PI * -140.95) / 180,
      pitch: (Math.PI * -18.9) / 180,
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
    isAnchor: true,
  },
  {
    name: "stop-6",
    position: [-2.2, -4.563, -3.141],
    orientation: {
      yaw: (Math.PI * -116.1) / 180,
      pitch: (Math.PI * 20.9) / 180,
    },
    ease: { name: "easeInOut" },
    isAnchor: true,
  },
  {
    name: "stop-7",
    position: [-1.976, -4.238, -2.981],
    orientation: {
      yaw: (Math.PI * -105.9) / 180,
      pitch: (Math.PI * -26.2) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-8",
    position: [-1.545, -4.355, -3.103],
    orientation: {
      yaw: (Math.PI * 135.8) / 180,
      pitch: (Math.PI * -1.8) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-8-9-left",
    position: [-1.847, -4.305, -2.286],
    orientation: { yaw: (Math.PI * 46.2) / 180, pitch: (Math.PI * -1.0) / 180 },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-9",
    position: [-2.628, -4.255, -1.903],
    orientation: {
      yaw: (Math.PI * -43.4) / 180,
      pitch: (Math.PI * -0.2) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-10",
    position: [-2.547, -4.174, -1.105],
    orientation: {
      yaw: (Math.PI * -20.0) / 180,
      pitch: (Math.PI * -3.1) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-11",
    position: [-0.482, -3.772, -1.679],
    orientation: {
      yaw: (Math.PI * 61.4) / 180,
      pitch: (Math.PI * -21.5) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-12",
    position: [-1.122, -3.951, -3.717],
    orientation: {
      yaw: (Math.PI * 155.6) / 180,
      pitch: (Math.PI * -14.5) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-13",
    position: [-3.188, -4.043, -2.062],
    orientation: { yaw: (Math.PI * -80.3) / 180, pitch: (Math.PI * 2.6) / 180 },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-13a",
    position: [-3.186, -3.459, -2.292],
    orientation: {
      yaw: (Math.PI * -99.7) / 180,
      pitch: (Math.PI * -8.2) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-13b",
    position: [1.787, -2.87, -4.135],
    orientation: {
      yaw: (Math.PI * 138.1) / 180,
      pitch: (Math.PI * -17.0) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-13b-left-1",
    position: [1.611, -3.068, -1.444],
    orientation: { lookAt: [-1.737, -4.114, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-13b-left-2",
    position: [0.186, -3.23, 0.087],
    orientation: { lookAt: [-1.737, -4.114, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-13c",
    position: [-1.306, -3.357, 0.501],
    orientation: { lookAt: [-1.737, -4.114, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-14",
    position: [-0.63, -3.763, -4.098],
    orientation: {
      yaw: (Math.PI * 138.1) / 180,
      pitch: (Math.PI * -18.7) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-15-down",
    position: [-1.77, -2.427, -2.556],
    orientation: {
      yaw: (Math.PI * 179.5) / 180,
      pitch: (Math.PI * -89.8) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "stop-15-spin-90",
    position: [-1.77, -2.427, -2.556],
    orientation: {
      yaw: (Math.PI * 89.5) / 180,
      pitch: (Math.PI * -89.8) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-15-spin-180",
    position: [-1.77, -2.427, -2.556],
    orientation: {
      yaw: (Math.PI * 359.5) / 180,
      pitch: (Math.PI * -89.8) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-15-spin-270",
    position: [-1.77, -2.427, -2.556],
    orientation: {
      yaw: (Math.PI * 269.5) / 180,
      pitch: (Math.PI * -89.8) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "stop-15-spin-360",
    position: [-1.77, -2.427, -2.556],
    orientation: {
      yaw: (Math.PI * 179.5) / 180,
      pitch: (Math.PI * -89.8) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-entry",
    position: [0.008, -4.065, -2.946],
    orientation: { lookAt: [-1.737, -4.265, -2.663] },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "ring-1",
    position: [-0.698, -4.149, -1.209],
    orientation: { lookAt: [-1.737, -4.349, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-2",
    position: [-2.568, -4.3, -1.079],
    orientation: { lookAt: [-1.737, -4.5, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-3",
    position: [-3.459, -4.2, -3.124],
    orientation: { lookAt: [-1.737, -4.4, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-3a",
    position: [-2.346, -4.057, -4.336],
    orientation: { lookAt: [-1.737, -4.257, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-4",
    position: [-0.73, -3.914, -4.129],
    orientation: { lookAt: [-1.737, -4.114, -2.663] },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-4b",
    position: [-0.748, -3.147, -4.027],
    orientation: {
      yaw: (Math.PI * 138.8) / 180,
      pitch: (Math.PI * -34.8) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "ring-close",
    position: [-1.737, -4.0, -2.663],
    orientation: { yaw: (Math.PI * 145.5) / 180, pitch: (Math.PI * -2) / 180 },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
  {
    name: "seq-1",
    position: [-1.42, -3.363, -2.194],
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
  {
    name: "seq-4-last-mid",
    position: [-9.6, -2.95, -3.95],
    orientation: {
      yaw: (Math.PI * -13.2) / 180,
      pitch: (Math.PI * 14.25) / 180,
    },
    ease: { name: "sineInOut" },
  },
  {
    name: "last-stop",
    position: [-9.45, -2.62, -4.45],
    orientation: {
      yaw: (Math.PI * -20.0) / 180,
      pitch: (Math.PI * 15.0) / 180,
    },
    ease: { name: "sineInOut" },
    isAnchor: true,
  },
];

// ---------------------- helpers ----------------------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

export const useCameraStore = create((set, get) => ({
  waypoints: seedWaypoints,

  // normalized [0..1]
  t: 0,

  // flags
  enabled: false,
  paused: false,
  locked: false,

  // segment-aware sensitivity (unit baseline). Keep magnitudeMap micro; use GlobalSS as macro multiplier.
  globalSS: 1.68,
  localSSPercent: {},

  // Magnitude → Glide mapping (new)
  magnitudeMap: {
    baseStep: 100, // typical wheel notch size
    scaleFactor: 0.0015, // |deltaY|=100 → 0.0015 t immediate step (micro)
    power: 1.0, // 1 = linear; >1 flattens small flicks; <1 boosts them
    minImpulse: 0.0,
    maxStep: 0.02, // cap immediate step
  },

  // overlays / gizmos (kept)
  gizmos: Object.fromEntries(seedWaypoints.map((w) => [w.name ?? "wp", false])),

  // ---------- setters (with backward compatibility) ----------
  setT: (t) => set({ t: clamp01(t) }),
  setEnabled: (v) => set({ enabled: !!v }),
  setPaused: (v) => set({ paused: !!v }),
  setLocked: (v) => set({ locked: !!v }),

  // restored for your UI
  setGlobalSS: (v) => set({ globalSS: Math.max(0, Math.min(5, v)) }),
  setLocalSSPercent: (index, v) =>
    set((s) => ({ localSSPercent: { ...s.localSSPercent, [index]: v } })),

  setMagnitudeMap: (patch) =>
    set((s) => ({ magnitudeMap: { ...s.magnitudeMap, ...patch } })),

  setGizmo: (name, v) => set((s) => ({ gizmos: { ...s.gizmos, [name]: !!v } })),
  toggleGizmo: (name) =>
    set((s) => ({ gizmos: { ...s.gizmos, [name]: !s.gizmos[name] } })),

  jumpToWaypoint: (index) => {
    const waypoints = get().waypoints;
    const count = waypoints.length;
    if (count <= 1) return;
    const nSeg = count - 1;
    const clamped = Math.max(0, Math.min(count - 1, index));
    const t = clamped / nSeg;
    set({ t });
  },

  // ---------- wheel input → direct step ----------
  applyWheel: (deltaY) => {
    const state = get();
    if (!state.enabled || state.paused || deltaY === 0) return;

    const dir = deltaY < 0 ? +1 : -1;
    const mag = Math.abs(deltaY);

    const { baseStep, scaleFactor, power, minImpulse, maxStep } =
      state.magnitudeMap;

    const steps = mag / Math.max(1, baseStep);
    let stepSize =
      Math.pow(steps, Math.max(0.001, power)) * Math.max(0, scaleFactor);

    const segIndex = state.getSegmentIndex();
    const sens = state.getEffectiveSensitivity(segIndex);
    stepSize *= sens > 1e-4 ? sens : 1.0;

    if (stepSize < (minImpulse ?? 0)) return;
    stepSize = Math.min(stepSize, maxStep ?? 0.02);

    set((s) => {
      let totalStep = stepSize;
      const slip = s.microSlip ?? {};
      if (slip.enabled) {
        const wps = s.waypoints;
        const nSeg = Math.max(0, wps.length - 1);
        let i = nSeg > 0 ? Math.floor(s.t * nSeg) : 0;
        i = clamp(i, 0, Math.max(0, nSeg - 1));
        const tCurr = nSeg > 0 ? i / nSeg : 0;
        const tNext = nSeg > 0 ? (i + 1) / nSeg : 1;
        const remaining =
          dir > 0 ? Math.max(0, tNext - s.t) : Math.max(0, s.t - tCurr);
        const y = Math.min(
          Math.abs(stepSize) * (slip.frac ?? 0.25),
          slip.maxSlip ?? 0.005,
          (slip.boundFrac ?? 0.7) * remaining
        );
        totalStep = stepSize + y;
      }

      const wps2 = s.waypoints;
      const nSeg2 = Math.max(0, wps2.length - 1);
      let t;
      if (nSeg2 > 0) {
        const EPS = 1e-6;
        let ii = Math.floor(s.t * nSeg2);
        ii = clamp(ii, 0, Math.max(0, nSeg2 - 1));
        let tMin = ii / nSeg2;
        let tMax = (ii + 1) / nSeg2;
        if (dir > 0 && Math.abs(s.t - tMax) <= EPS && ii < nSeg2 - 0) {
          const jj = Math.min(ii + 1, nSeg2 - 1);
          tMin = jj / nSeg2;
          tMax = (jj + 1) / nSeg2;
        } else if (dir < 0 && Math.abs(s.t - tMin) <= EPS && ii > 0) {
          const jj = Math.max(ii - 1, 0);
          tMin = jj / nSeg2;
          tMax = (jj + 1) / nSeg2;
        }
        const tTarget = s.t + dir * totalStep;
        const tBound = clamp(tTarget, tMin, tMax);
        t = clamp01(tBound);
      } else {
        t = clamp01(s.t + dir * totalStep);
      }
      return { t };
    });
  },

  // ---------- Derived selectors ----------
  getPose: (t) => {
    const waypoints = get().waypoints;
    const baseT = t ?? get().t;
    const tt = clamp01(baseT);
    const { position, quaternion, fov, segmentIndex } = getPoseAt(
      waypoints,
      tt
    );
    return { position, quaternion, fov, segmentIndex };
  },
  getSegmentIndex: (t) => {
    const wps = get().waypoints;
    const { i } = segmentAt(t ?? get().t, wps.length);
    return i;
  },
  getEffectiveSensitivity: (segmentIndex) => {
    const g = get().globalSS ?? 1.0;
    const p = get().localSSPercent?.[segmentIndex] ?? 0;
    const eff = g * (1 + p / 100);
    return Math.max(0, eff);
  },
}));
