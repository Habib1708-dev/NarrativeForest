// src/state/useCameraStore.js
import { create } from "zustand";
import * as THREE from "three";
import { gsap } from "gsap";
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
    isAnchor: true,
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
// legacy friction ↔ halfLife mapping
const frictionToHalfLife = (f) => {
  const ff = THREE.MathUtils.clamp(f, 1e-4, 0.999999);
  return Math.log(0.5) / Math.log(ff); // t when v halves if v *= f^t
};
const halfLifeToFriction = (h) => Math.pow(0.5, 1 / Math.max(1e-6, h));

const WAYPOINT_EPS = 1e-4;
const RELEASE_MARGIN = 1e-4;

const maybeRestoreSuppressedAnchor = (get, set) => {
  const stateNow = get();
  const suppressed = stateNow._suppressedAnchorIndex ?? -1;
  if (suppressed < 0) return;
  const suppressedT = stateNow._suppressedAnchorT;
  const wps = stateNow.waypoints ?? [];
  const nSeg = Math.max(0, wps.length - 1);
  if (nSeg <= 0) {
    if (suppressed !== -1)
      set({ _suppressedAnchorIndex: -1, _suppressedAnchorT: null });
    return;
  }
  const tNow = clamp01(stateNow.t ?? 0);
  const nearestIdx = Math.round(tNow * nSeg);
  const atWaypoint = Math.abs(tNow - nearestIdx / nSeg) <= WAYPOINT_EPS;
  const anchorsConf = stateNow.anchors ?? {};
  const snapRadius = Math.max(0, anchorsConf.snapRadius ?? 0.015);
  const distFromSuppressed =
    suppressedT == null ? Infinity : Math.abs(tNow - suppressedT);
  const farEnough = distFromSuppressed >= snapRadius + RELEASE_MARGIN;
  if ((atWaypoint && nearestIdx !== suppressed) || farEnough) {
    set({ _suppressedAnchorIndex: -1, _suppressedAnchorT: null });
  }
};

export const useCameraStore = create((set, get) => ({
  waypoints: seedWaypoints,

  // normalized [0..1]
  t: 0,
  // current glide velocity in t/sec
  v: 0,

  // flags
  enabled: false,
  paused: false,
  locked: false,

  // segment-aware sensitivity (unit baseline). Keep magnitudeMap micro; use GlobalSS as macro multiplier.
  globalSS: 1.0,
  localSSPercent: {},

  // Magnitude → Glide mapping (new)
  magnitudeMap: {
    baseStep: 100, // typical wheel notch size
    scaleFactor: 0.0015, // |deltaY|=100 → 0.0015 t immediate step (micro)
    power: 1.0, // 1 = linear; >1 flattens small flicks; <1 boosts them
    minImpulse: 0.0,
    maxStep: 0.02, // cap immediate step
    glideRatio: 0.1, // glide distance as a fraction of step size
    replaceVelocity: true, // whether new glide replaces prior velocity
  },

  // Physics (new). halfLife actually drives decay; 'friction' is a legacy alias.
  physics: {
    halfLife: 0.08, // fast stop
    deadZone: 0.03, // snap-to-zero threshold
    maxSpeed: 0.8,
    // ------- legacy/compat fields expected by your Leva panel -------
    friction: halfLifeToFriction(0.08), // shown/edited in Leva; mapped to halfLife
    wheelBoost: 0.1, // alias to magnitudeMap.scaleFactor
  },

  // Optional scenic snap (unchanged)
  scenic: {},
  scenicDwellMs: 300,
  scenicSnapRadius: 0.006,
  scenicResist: 0.5,

  // overlays / gizmos (kept)
  overlays: { bobAmp: 0.02, bobFreq: 0.6, driftAmt: 0.02 },
  gizmos: Object.fromEntries(seedWaypoints.map((w) => [w.name ?? "wp", false])),

  // Anchor configuration for major stopping points
  anchors: {
    enabled: true, // global anchor system toggle
    snapRadius: 0.022, // distance threshold to trigger snap
    dwellMs: 100, // how long to pause at anchor after snap
    snapEase: "power2.out", // GSAP easing for snap animation
    snapDuration: 1.8, // snap animation duration
    releaseGraceMs: 1000, // after leaving an anchor, ignore pull for this long
  },

  // Micro smoothing config (soften each step visually)
  microSmooth: {
    enabled: true,
    // Stage A: catch-up from a brief holdback
    frac: 1.5, // fraction of step size to initially cancel
    maxOffset: 0.006, // cap the visual cancel amount in t-space
    duration: 0.4, // time to go from -cancel to tail (or to 0 if no tail)
    ease: "sine.out",
    // Stage B: optional gentle tail (cool-down) that progresses a tiny bit further, then ceases
    tailFrac: 0.1, // fraction of step size for tail amplitude
    tailMax: 0.004, // cap of tail amplitude in t-space
    tailBoundFrac: 0.7, // keep within this fraction of remaining distance to boundary
    tailDuration: 1.0, // time to fade tail to zero
    tailEase: "sine.out",
  },

  // internals
  _dwellUntil: 0,
  _smoothOffset: 0,
  _smoothTween: null,
  _snapTween: null, // GSAP tween for anchor snap animation
  _anchorDwelling: false, // flag to indicate we're dwelling at an anchor
  _anchorRelease: null,
  _lastAnchorIndex: -1,
  _suppressedAnchorIndex: -1,
  _suppressedAnchorT: null,

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
    set((s) => {
      const next = { ...s.magnitudeMap, ...patch };
      // keep legacy alias in sync
      const nextPhysics = { ...s.physics, wheelBoost: next.scaleFactor };
      return { magnitudeMap: next, physics: nextPhysics };
    }),

  setPhysics: (patch) =>
    set((s) => {
      const out = { ...s.physics, ...patch };

      // --- legacy inputs mapping ---
      if (patch && typeof patch.friction === "number") {
        // Update halfLife from provided friction
        out.halfLife = frictionToHalfLife(patch.friction);
      } else if (patch && typeof patch.halfLife === "number") {
        // Keep friction mirror in sync for Leva display
        out.friction = halfLifeToFriction(patch.halfLife);
      }

      if (patch && typeof patch.wheelBoost === "number") {
        // Map legacy wheelBoost → magnitude scale
        const scale = Math.max(0, patch.wheelBoost);
        return {
          physics: out,
          magnitudeMap: { ...s.magnitudeMap, scaleFactor: scale },
        };
      }

      return { physics: out };
    }),

  setOverlays: (patch) =>
    set((s) => ({ overlays: { ...s.overlays, ...patch } })),

  setMicroSmooth: (patch) =>
    set((s) => ({ microSmooth: { ...s.microSmooth, ...patch } })),

  setAnchors: (patch) => set((s) => ({ anchors: { ...s.anchors, ...patch } })),

  setScenic: (name, v) =>
    set((s) => ({ scenic: { ...s.scenic, [name]: !!v } })),
  toggleScenic: (name) =>
    set((s) => ({ scenic: { ...s.scenic, [name]: !s.scenic[name] } })),
  setScenicDwellMs: (ms) => set({ scenicDwellMs: Math.max(0, ms | 0) }),
  setScenicSnapRadius: (r) =>
    set({ scenicSnapRadius: Math.max(0, Math.min(0.05, r)) }),
  setScenicResist: (f) => set({ scenicResist: Math.max(0, Math.min(1, f)) }),
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
    const isAnchor = waypoints[clamped]?.isAnchor;
    const suppressIdx = isAnchor ? clamped : -1;
    const suppressT = isAnchor ? t : null;
    set({
      t,
      v: 0,
      _dwellUntil: 0,
      _anchorRelease: null,
      _suppressedAnchorIndex: suppressIdx,
      _suppressedAnchorT: suppressT,
    });
  },

  // ---------- wheel input → STEP + GLIDE (micro) ----------
  applyWheel: (deltaY) => {
    const initialState = get();
    if (!initialState.enabled || initialState.paused || deltaY === 0) return;

    const nowMs = performance.now();

    // If dwelling at anchor, release gracefully and grant a grace window
    if (initialState._dwellUntil && nowMs < initialState._dwellUntil) {
      const snapTween = initialState._snapTween;
      if (snapTween && typeof snapTween.kill === "function") {
        snapTween.kill();
      }
      const releaseMs = Math.max(
        0,
        (initialState.anchors?.releaseGraceMs ?? 350) | 0
      );
      const waypoints = initialState.waypoints ?? [];
      const nSegInit = waypoints.length > 0 ? waypoints.length - 1 : 0;
      const anchorIdx = initialState._lastAnchorIndex;
      let releaseEntry = null;
      if (anchorIdx != null && anchorIdx >= 0 && nSegInit > 0) {
        const anchorT = anchorIdx / nSegInit;
        const snapRadius = Math.max(
          0,
          initialState.anchors?.snapRadius ?? 0.015
        );
        const exitDistance = Math.max(snapRadius * 1.5, snapRadius + 0.002);
        releaseEntry = {
          anchorIndex: anchorIdx,
          anchorT,
          startedAt: nowMs,
          until: nowMs + releaseMs,
          exitDistance,
        };
      }
      set({
        _dwellUntil: 0,
        _anchorDwelling: false,
        _snapTween: null,
        _anchorRelease: releaseEntry,
      });
    }

    const state = get();
    const dir = deltaY < 0 ? +1 : -1;
    const mag = Math.abs(deltaY);

    const {
      baseStep,
      scaleFactor,
      power,
      minImpulse,
      maxStep,
      glideRatio,
      replaceVelocity,
    } = state.magnitudeMap;

    // Normalize magnitude to step units, then power-map and scale
    const steps = mag / Math.max(1, baseStep);
    let stepSize =
      Math.pow(steps, Math.max(0.001, power)) * Math.max(0, scaleFactor);

    // optional per-segment multiplier (kept)
    const segIndex = state.getSegmentIndex();
    // Effective sensitivity; guard against accidental near-zero making scroll feel dead
    const sens = state.getEffectiveSensitivity(segIndex);
    stepSize *= sens > 1e-4 ? sens : 1.0;

    if (stepSize < (minImpulse ?? 0)) return;
    stepSize = Math.min(stepSize, maxStep ?? 0.02);

    const anchorsConf = state.anchors;
    const anchorWaypoints = state.waypoints;
    const currT = state.t ?? 0;
    const suppressedIdx = state._suppressedAnchorIndex ?? -1;

    let releaseActive = false;
    if (anchorsConf?.enabled && state._anchorRelease) {
      if (state._anchorRelease.anchorIndex === suppressedIdx) {
        set({ _anchorRelease: null });
      } else {
        const snapRadius = Math.max(0, anchorsConf.snapRadius ?? 0.015);
        const exitDistance =
          state._anchorRelease.exitDistance ??
          Math.max(snapRadius * 1.5, snapRadius + 0.002);
        const anchorT = state._anchorRelease.anchorT;
        const distFromAnchor = Math.abs(currT - (anchorT ?? currT));
        const withinDistance = distFromAnchor <= exitDistance + 1e-6;
        const withinTime =
          state._anchorRelease.until != null &&
          nowMs < state._anchorRelease.until;
        releaseActive = withinDistance || withinTime;
        if (!releaseActive) {
          set({ _anchorRelease: null });
        }
      }
    }

    if (
      anchorsConf?.enabled &&
      (anchorWaypoints?.length ?? 0) > 1 &&
      suppressedIdx !== null
    ) {
      const nSeg = anchorWaypoints.length - 1;
      const snapRadius = Math.max(0, anchorsConf.snapRadius ?? 0.015);
      let closestIdx = -1;
      let closestDist = Infinity;
      let closestT = 0;
      for (let i = 0; i < anchorWaypoints.length; i++) {
        const wp = anchorWaypoints[i];
        if (!wp?.isAnchor || i === suppressedIdx) continue;
        const tAnchor = nSeg > 0 ? i / nSeg : 0;
        const dist = Math.abs(tAnchor - currT);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
          closestT = tAnchor;
        }
      }
      if (closestIdx >= 0 && closestDist <= snapRadius + 1e-6) {
        const movingAway =
          (dir > 0 && closestT <= currT) || (dir < 0 && closestT >= currT);
        if (movingAway) {
          const releaseMs = Math.max(0, anchorsConf.releaseGraceMs ?? 350);
          const exitDistance = Math.max(snapRadius * 1.5, snapRadius + 0.002);
          set({
            _anchorRelease: {
              anchorIndex: closestIdx,
              anchorT: closestT,
              startedAt: nowMs,
              until: nowMs + releaseMs,
              exitDistance,
            },
          });
          releaseActive = true;
        }
      }
    }

    let effectiveStep = Math.abs(stepSize);

    set((s) => {
      // Immediate step in t with optional slip extension
      let totalStep = stepSize;
      const slip = s.microSlip ?? {};
      if (slip.enabled) {
        const wps = s.waypoints;
        const nSeg = Math.max(0, wps.length - 1);
        let i = nSeg > 0 ? Math.floor(s.t * nSeg) : 0;
        i = THREE.MathUtils.clamp(i, 0, Math.max(0, nSeg - 1));
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
        ii = THREE.MathUtils.clamp(ii, 0, Math.max(0, nSeg2 - 1));
        let tMin = ii / nSeg2;
        let tMax = (ii + 1) / nSeg2;
        // If we are effectively at a boundary, allow crossing by choosing adjacent segment bounds
        if (dir > 0 && Math.abs(s.t - tMax) <= EPS && ii < nSeg2 - 0) {
          // move into next segment when scrolling forward
          const jj = Math.min(ii + 1, nSeg2 - 1);
          tMin = jj / nSeg2;
          tMax = (jj + 1) / nSeg2;
        } else if (dir < 0 && Math.abs(s.t - tMin) <= EPS && ii > 0) {
          // move into previous segment when scrolling backward
          const jj = Math.max(ii - 1, 0);
          tMin = jj / nSeg2;
          tMax = (jj + 1) / nSeg2;
        }
        const tTarget = s.t + dir * totalStep;
        // clamp target within the chosen segment bounds
        const tBound = THREE.MathUtils.clamp(tTarget, tMin, tMax);
        t = clamp01(tBound);
      } else {
        t = clamp01(s.t + dir * totalStep);
      }
      // Compute glide distance proportional to step
      const gDist = Math.abs(totalStep) * (glideRatio ?? 0.1);
      // Convert desired glide distance to initial velocity using exponential decay model
      const lambda = Math.LN2 / Math.max(s.physics.halfLife, 1e-6);
      let vGlide = gDist * lambda * dir;
      // Replace or add to current velocity
      let vNew = replaceVelocity ? vGlide : s.v + vGlide;
      vNew = THREE.MathUtils.clamp(
        vNew,
        -s.physics.maxSpeed,
        s.physics.maxSpeed
      );
      // Clamp to boundaries and zero if at bounds moving outward
      if ((t <= 0 && vNew < 0) || (t >= 1 && vNew > 0)) vNew = 0;
      effectiveStep = Math.abs(totalStep);
      return { t, v: vNew, _dwellUntil: 0 };
    });

    maybeRestoreSuppressedAnchor(get, set);

    // Visual smoothing with gentle tail: -cancel -> tail -> 0
    const ms = get().microSmooth ?? {};
    if (ms.enabled) {
      const sAbs = effectiveStep;
      const cancel = Math.min(sAbs * (ms.frac ?? 1.0), ms.maxOffset ?? 0.006);
      const amt = cancel * dir;
      const prev = get()._smoothTween;
      if (prev && typeof prev.kill === "function") prev.kill();
      if (amt !== 0) {
        const holder = { val: -amt };
        set({ _smoothOffset: holder.val });
        // compute a safe tail amplitude (can be zero)
        let tail = 0;
        if ((ms.tailFrac ?? 0) > 0 || (ms.tailMax ?? 0) > 0) {
          const wps = get().waypoints;
          const nSeg = Math.max(0, wps.length - 1);
          const tNow = get().t ?? 0;
          let i = nSeg > 0 ? Math.floor(tNow * nSeg) : 0;
          i = THREE.MathUtils.clamp(i, 0, Math.max(0, nSeg - 1));
          const tCurr = nSeg > 0 ? i / nSeg : 0;
          const tNext = nSeg > 0 ? (i + 1) / nSeg : 1;
          const remaining =
            dir > 0 ? Math.max(0, tNext - tNow) : Math.max(0, tNow - tCurr);
          const tailRaw = Math.min(
            sAbs * (ms.tailFrac ?? 0.1),
            ms.tailMax ?? 0.004
          );
          tail = Math.min(tailRaw, (ms.tailBoundFrac ?? 0.7) * remaining) * dir;
        }
        const tl = gsap.timeline();
        tl.to(holder, {
          val: tail || 0,
          duration: Math.max(0.05, ms.duration ?? 0.14),
          ease: ms.ease ?? "sine.out",
          onUpdate: () => set({ _smoothOffset: holder.val }),
        });
        tl.to(holder, {
          val: 0,
          duration: Math.max(0.05, ms.tailDuration ?? 0.3),
          ease: ms.tailEase ?? "sine.out",
          onUpdate: () => set({ _smoothOffset: holder.val }),
          onComplete: () => set({ _smoothTween: null, _smoothOffset: 0 }),
        });
        set({ _smoothTween: tl });
      }
    }

    // Micro pop removed per request

    // Micro glide removed per request
  },

  // ---------- per-frame integrator (exponential decay to full stop) ----------
  step: (dt, nowMs = performance.now()) => {
    const state = get();
    const {
      enabled,
      paused,
      locked,
      physics,
      scenicSnapRadius,
      scenicResist,
      scenicDwellMs,
      waypoints,
      scenic,
      anchors,
    } = state;
    if (!enabled || paused || locked) return;

    let { t, v } = state;
    const suppressedIdx = state._suppressedAnchorIndex ?? -1;

    // If snap tween is active, let it control movement
    if (state._snapTween) {
      if (v !== 0) set({ v: 0 });
      return;
    }

    // scenic/anchor dwell hold
    if (state._dwellUntil && nowMs < state._dwellUntil) {
      if (v !== 0) set({ v: 0 });
      return;
    }

    let releaseActive = false;
    if (anchors?.enabled && state._anchorRelease) {
      if (state._anchorRelease.anchorIndex === suppressedIdx) {
        set({ _anchorRelease: null });
      } else {
        const snapRadius = Math.max(0, anchors.snapRadius ?? 0.015);
        const exitDistance =
          state._anchorRelease.exitDistance ??
          Math.max(snapRadius * 1.5, snapRadius + 0.002);
        const anchorT = state._anchorRelease.anchorT;
        const distFromAnchor = Math.abs(t - (anchorT ?? t));
        const withinDistance = distFromAnchor <= exitDistance + 1e-6;
        const withinTime =
          state._anchorRelease.until != null &&
          nowMs < state._anchorRelease.until;
        releaseActive = withinDistance || withinTime;
        if (!releaseActive) {
          set({ _anchorRelease: null });
        }
      }
    }

    // Find nearest anchor if anchor system enabled and not in release grace
    let nearestAnchor = null;
    let nearestAnchorIdx = -1;
    let distToAnchor = Infinity;
    let anchorT = 0;
    let isApproaching = false;

    if (anchors?.enabled && !releaseActive) {
      const nSeg = waypoints.length - 1;
      if (nSeg > 0) {
        // Check all anchor waypoints
        waypoints.forEach((wp, idx) => {
          if (wp.isAnchor && idx !== suppressedIdx) {
            const wpT = idx / nSeg;
            const dist = Math.abs(t - wpT);
            // Check if we're moving toward this anchor
            const movingToward = (v > 0 && wpT > t) || (v < 0 && wpT < t);
            if (movingToward && dist < distToAnchor) {
              distToAnchor = dist;
              nearestAnchor = wp;
              anchorT = wpT;
              nearestAnchorIdx = idx;
              isApproaching = true;
            }
          }
        });
      }
    }

    // Exponential decay driven by base physics settings (no extra boost)
    const lambda = Math.LN2 / Math.max(physics.halfLife, 1e-6);
    const decay = Math.exp(-lambda * Math.max(0, dt));
    v *= decay;

    // snap to zero when tiny
    if (Math.abs(v) < physics.deadZone) v = 0;

    // Anchor snap logic
    if (anchors?.enabled && !releaseActive && nearestAnchor && isApproaching) {
      const snapRadius = anchors.snapRadius ?? 0.015;
      if (distToAnchor <= snapRadius && Math.abs(v) < physics.deadZone * 2) {
        // Start smooth snap to anchor
        const holder = { val: t };
        const snapTween = gsap.to(holder, {
          val: anchorT,
          duration: anchors.snapDuration ?? 0.3,
          ease: anchors.snapEase ?? "power2.out",
          onUpdate: () => set({ t: holder.val }),
          onComplete: () => {
            set({
              t: anchorT,
              v: 0,
              _snapTween: null,
              _dwellUntil: nowMs + (anchors.dwellMs ?? 600),
              _anchorDwelling: true,
              _lastAnchorIndex: nearestAnchorIdx,
              _suppressedAnchorIndex: nearestAnchorIdx,
              _suppressedAnchorT: anchorT,
              _anchorRelease: null,
            });
          },
        });
        set({ _snapTween: snapTween, v: 0 });
        return;
      }
    }

    // Optional scenic soft snap (legacy, kept for non-anchor waypoints)
    if (scenic && Object.values(scenic).some(Boolean)) {
      const nSeg = waypoints.length - 1;
      if (nSeg > 0) {
        const nearestIdx = Math.round(t * nSeg);
        const wp = waypoints[nearestIdx];
        if (wp && scenic[wp.name] && !wp.isAnchor) {
          const tStar = nearestIdx / nSeg;
          const dist = Math.abs(t - tStar);
          if (dist <= scenicSnapRadius) {
            v *= scenicResist;
            if (Math.abs(v) < physics.deadZone * 1.2) {
              t = tStar;
              v = 0;
              set({ _dwellUntil: nowMs + scenicDwellMs });
            }
          }
        }
      }
    }

    // integrate t and enforce stop at each waypoint boundary
    if (v !== 0) {
      const nSeg = Math.max(0, waypoints.length - 1);
      const tPrev = t;
      t = clamp01(t + v * dt);
      if (nSeg > 0) {
        const i = Math.floor(tPrev * nSeg);
        const tCurr = i / nSeg;
        const tNext = (i + 1) / nSeg;
        if (v > 0 && t >= tNext) {
          t = tNext;
          v = 0;
        } else if (v < 0 && t <= tCurr) {
          t = tCurr;
          v = 0;
        }
      }
      if (t === 0 || t === 1) v = 0;
    }

    set({ t, v, _anchorDwelling: false });

    maybeRestoreSuppressedAnchor(get, set);
  },

  // ---------- Derived selectors ----------
  getPose: (t) => {
    const waypoints = get().waypoints;
    const baseT = t ?? get().t;
    const oSmooth = get()._smoothOffset ?? 0;
    const tt = clamp01(baseT + oSmooth);
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
