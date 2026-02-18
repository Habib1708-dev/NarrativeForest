// src/state/useSplineCameraStore.js
// Independent Zustand store for the spline-based scroll camera.
// Mirrors the scroll-inertia pattern from useCameraStore but is much simpler —
// no freeflight, no scenic pauses, no segment-local sensitivity.

import { create } from "zustand";
import { gsap } from "gsap";
import { createSplineSampler, SPLINE_WAYPOINTS } from "../utils/splineCameraPath";

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const isBrowser = typeof window !== "undefined";

/* ---- mutable refs shared by the tick loop and applyWheel ---- */
const scrollState = { velocity: 0 };
const tDriver = { value: 0 };

export const useSplineCameraStore = create((set, get) => {
  const sampler = createSplineSampler(SPLINE_WAYPOINTS);
  let velocityTween = null;
  let tickerActive = false;

  /* ---- GSAP ticker (inertia integration) ---- */

  const stopTicker = () => {
    if (!tickerActive) return;
    gsap.ticker.remove(tick);
    tickerActive = false;
  };

  const ensureTicker = () => {
    if (tickerActive) return;
    gsap.ticker.add(tick);
    tickerActive = true;
  };

  function tick() {
    if (!isBrowser) { stopTicker(); return; }
    const { enabled } = get();
    if (!enabled) { stopTicker(); return; }

    const deltaRatio = gsap.ticker.deltaRatio();
    const dt = deltaRatio / 60;
    if (dt <= 0) return;

    // Stop when velocity is negligible
    if (Math.abs(scrollState.velocity) <= 0.0004) {
      scrollState.velocity = 0;
      stopTicker();
      return;
    }

    let nextT = tDriver.value + scrollState.velocity * dt;

    // Clamp at boundaries and kill velocity
    if (nextT <= 0 || nextT >= 1) {
      nextT = clamp01(nextT);
      scrollState.velocity = 0;
      if (velocityTween) { velocityTween.kill(); velocityTween = null; }
    }

    if (Math.abs(nextT - tDriver.value) > 1e-7) {
      tDriver.value = nextT;
      set({ t: nextT });
    }

    if (!velocityTween?.isActive() && Math.abs(scrollState.velocity) <= 0.0004) {
      stopTicker();
    }
  }

  /* ---- store ---- */

  return {
    t: 0,
    enabled: true,
    fov: 50,
    sampler, // exposed for debug visualisation

    /* -- setters -- */

    setT: (t) => {
      if (velocityTween) { velocityTween.kill(); velocityTween = null; }
      scrollState.velocity = 0;
      const clamped = clamp01(t);
      tDriver.value = clamped;
      set({ t: clamped });
    },

    setEnabled: (v) => set({ enabled: !!v }),

    /* -- scroll input -- */

    applyWheel: (deltaY) => {
      const state = get();
      if (!state.enabled || deltaY === 0) return;

      const dir = deltaY < 0 ? +1 : -1;
      const mag = Math.abs(deltaY);

      // Magnitude mapping — simplified from useCameraStore
      const baseStep = 100;
      const scaleFactor = 0.0015;
      const power = 0.85;
      const maxStep = 0.03;

      const steps = mag / Math.max(1, baseStep);
      let stepSize = Math.pow(steps, power) * scaleFactor;
      stepSize = Math.min(stepSize, maxStep);

      // Immediate portion (32%) + inertia portion (68%)
      const immediateRatio = 0.32;
      const immediateDelta = dir * stepSize * immediateRatio;
      const baseT = clamp01(state.t + immediateDelta);
      tDriver.value = baseT;
      set({ t: baseT });

      if (!isBrowser) return;

      // Inertia impulse
      const impulse = dir * stepSize * (1 - immediateRatio);
      const velocityScale = 7.5;
      const maxVelocity = 0.24;

      scrollState.velocity += impulse * velocityScale;
      scrollState.velocity = Math.max(-maxVelocity, Math.min(maxVelocity, scrollState.velocity));

      if (velocityTween) velocityTween.kill();
      velocityTween = gsap.to(scrollState, {
        velocity: 0,
        duration: 1.05,
        ease: "power3.out",
        overwrite: "auto",
        onComplete: () => { velocityTween = null; },
      });

      ensureTicker();
    },

    /* -- pose getter (called every frame in useFrame) -- */

    getPose: () => {
      const { t, fov } = get();
      const { position, quaternion, segmentIndex } = sampler.sample(t);
      return { position, quaternion, fov, segmentIndex };
    },
  };
});
