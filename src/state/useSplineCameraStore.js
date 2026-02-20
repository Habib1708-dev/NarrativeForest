// src/state/useSplineCameraStore.js
// Independent Zustand store for the spline-based scroll camera.
// Mirrors the scroll-inertia pattern from useCameraStore but is much simpler —
// no freeflight, no scenic pauses, no segment-local sensitivity.

import { create } from "zustand";
import { gsap } from "gsap";
import * as THREE from "three";
import {
  createSplineSampler,
  SPLINE_WAYPOINTS,
  DEFAULT_CURVE_PARAMS,
  WEIGHT_FNS,
} from "../utils/splineCameraPath";

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothStep = (x) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const isBrowser = typeof window !== "undefined";
const axisMap = { x: 0, y: 1, z: 2 };
const cloneWaypoints = (wps) =>
  wps.map((w) => ({ pos: [...w.pos], dir: [...w.dir], name: w.name }));
const clampStep = (v) => Math.max(0.001, Math.min(10, Number(v) || 0.05));

/* ---- mutable refs shared by the tick loop and applyWheel ---- */
const scrollState = { velocity: 0 };
const tDriver = { value: 0 };

export const useSplineCameraStore = create((set, get) => {
  const initialWaypoints = cloneWaypoints(SPLINE_WAYPOINTS);
  const initialCurveParams = { ...DEFAULT_CURVE_PARAMS };
  const segCount = Math.max(0, initialWaypoints.length - 1);
  const initialSegmentOffsets = Array.from({ length: segCount }, (_, i) => {
    if (i === 3) return [0, -0.13, -0.13];  // segment 3: y and z axis offset
    if (i === 4) return [0, 0, 0.06];
    return [0, 0, 0];
  });
  const initialSegmentWeightFns = Array.from(
    { length: segCount },
    () => "bell"
  );
  const initialSegmentGroups = [];
  let velocityTween = null;
  let tickerActive = false;
  let skipNextVelocityTick = false;
  const diveOffsetRef = { value: 0 };
  let diveTween = null;
  let lastScrollInputAt = 0;
  const DIVE_BURST_GAP_MS = 140;

  const startSegment0Dive = (diveCfg) => {
    const dipAmount = Number(diveCfg?.dipAmount ?? -0.05);
    const returnDuration = Math.max(0.05, Number(diveCfg?.returnDuration ?? 0.5));
    const returnEase = diveCfg?.returnEase ?? "power2.out";
    const attackDuration = Math.min(0.18, Math.max(0.06, returnDuration * 0.2));

    if (diveTween) diveTween.kill();
    if (!Number.isFinite(dipAmount) || dipAmount === 0) {
      diveOffsetRef.value = 0;
      set({ segment0DiveOffset: 0 });
      return;
    }

    diveTween = gsap.timeline({
      overwrite: "auto",
      onUpdate: () => set({ segment0DiveOffset: diveOffsetRef.value }),
      onComplete: () => {
        diveTween = null;
        diveOffsetRef.value = 0;
        set({ segment0DiveOffset: 0 });
      },
    });

    diveTween
      .to(diveOffsetRef, {
        value: dipAmount,
        duration: attackDuration,
        ease: "sine.out",
      })
      .to(diveOffsetRef, {
        value: 0,
        duration: returnDuration,
        ease: returnEase,
      });
  };

  const rebuild = (
    waypoints,
    curveParams,
    segmentOffsets,
    segmentWeightFns,
    segmentGroups
  ) =>
    createSplineSampler(
      waypoints,
      curveParams,
      segmentOffsets,
      segmentWeightFns,
      segmentGroups
    );

  const rebuildFromCurrent = (patch = {}) => {
    const s = get();
    const waypoints = patch.waypoints ?? s.waypoints;
    const curveParams = patch.curveParams ?? s.curveParams;
    const segmentOffsets = patch.segmentOffsets ?? s.segmentOffsets;
    const segmentWeightFns = patch.segmentWeightFns ?? s.segmentWeightFns;
    const segmentGroups = patch.segmentGroups ?? s.segmentGroups;
    return rebuild(
      waypoints,
      curveParams,
      segmentOffsets,
      segmentWeightFns,
      segmentGroups
    );
  };

  /* ---- GSAP ticker (inertia integration) ---- */

  const stopTicker = () => {
    if (!tickerActive) return;
    gsap.ticker.remove(tick);
    tickerActive = false;
    skipNextVelocityTick = false;
  };

  const ensureTicker = () => {
    if (tickerActive) return;
    gsap.ticker.add(tick);
    tickerActive = true;
    // When waking from idle, immediateDelta was already applied in applyWheel.
    // Skip one velocity integration tick to avoid a startup double-kick.
    skipNextVelocityTick = true;
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

    if (skipNextVelocityTick) {
      skipNextVelocityTick = false;
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
    scrollSensitivity: 5.5,
    /** Extra scroll multiplier: effective scroll = baseScroll * (1 + scrollSlideFactor). 0 = no slide, 0.5 = 50% extra. */
    scrollSlideFactor: 1.3,
    segment0DiveOffset: 0,
    segment0Dive: {
      enabled: true,
      dipAmount: -0.05,
      returnDuration: 0.95,
      returnEase: "sine.out",
    },
    segment1Float: {
      enabled: true,
      amplitude: 0.01,
      frequency: 0.45,
    },
    showSplineViz: false,
    showSplineGeometry: false,
    waypoints: initialWaypoints,
    curveParams: initialCurveParams,
    segmentOffsets: initialSegmentOffsets,
    segmentWeightFns: initialSegmentWeightFns,
    segmentGroups: initialSegmentGroups,
    selectedSegments: segCount > 4 ? [4] : [],
    selectedWaypoint: -1,
    activeAxis: "z",
    activeAxes: ["z"],
    nudgeStep: 0.05,
    insertSegment: -1,
    insertT: 0.5,
    affectedWaypoints: [],
    sampler: rebuild(
      initialWaypoints,
      initialCurveParams,
      initialSegmentOffsets,
      initialSegmentWeightFns,
      initialSegmentGroups
    ),

    /* -- setters -- */
    setShowSplineViz: (v) => set({ showSplineViz: !!v }),
    setShowSplineGeometry: (v) => set({ showSplineGeometry: !!v }),
    setScrollSensitivity: (v) =>
      set({ scrollSensitivity: Math.max(0.01, Math.min(10, Number(v) || 1)) }),
    setScrollSlideFactor: (v) =>
      set({ scrollSlideFactor: Math.max(0, Math.min(2, Number(v) ?? 0)) }),
    setSegment0Dive: (patch) =>
      set((s) => ({ segment0Dive: { ...s.segment0Dive, ...patch } })),
    setSegment1Float: (patch) =>
      set((s) => ({ segment1Float: { ...s.segment1Float, ...patch } })),
    triggerSegment0Dive: () => {
      const state = get();
      const { sampler: sm, segment0Dive: diveCfg } = state;
      const uSeg = sm.scrollToU ? sm.scrollToU(state.t) : state.t;
      const { segmentIndex: segIdx } = sm.sample(uSeg);
      if (segIdx !== 0 || diveCfg?.enabled === false) return;
      startSegment0Dive(diveCfg);
    },
    resetSegment0Dive: () => {
      if (diveTween) {
        diveTween.kill();
        diveTween = null;
      }
      diveOffsetRef.value = 0;
      set({ segment0DiveOffset: 0 });
    },
    setSegment0DiveOffset: (v) => {
      diveOffsetRef.value = Number(v);
      set({ segment0DiveOffset: diveOffsetRef.value });
    },
    setCurveParams: (patch) => {
      const curveParams = { ...get().curveParams, ...patch };
      const sampler = rebuildFromCurrent({ curveParams });
      set({ curveParams, sampler });
    },

    setT: (t) => {
      if (velocityTween) { velocityTween.kill(); velocityTween = null; }
      scrollState.velocity = 0;
      const clamped = clamp01(t);
      tDriver.value = clamped;
      set({ t: clamped });
    },

    setEnabled: (v) => set({ enabled: !!v }),
    setSelectedWaypoint: (i) => set({ selectedWaypoint: Number(i), selectedSegments: Number(i) >= 0 ? [] : get().selectedSegments }),
    setSelectedSegment: (i) =>
      set({
        selectedSegments: Number(i) >= 0 ? [Number(i)] : [],
        selectedWaypoint: Number(i) >= 0 ? -1 : get().selectedWaypoint,
      }),
    setSelectedSegments: (arr) => {
      const segCount = Math.max(0, get().waypoints.length - 1);
      const next = [...new Set((arr || []).map(Number))]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < segCount);
      set({ selectedSegments: next, selectedWaypoint: next.length ? -1 : get().selectedWaypoint });
    },
    getSelectedSegmentRange: () => {
      const segs = [...get().selectedSegments].sort((a, b) => a - b);
      if (!segs.length) return null;
      return { start: segs[0], end: segs[segs.length - 1] };
    },
    setSelectedSegmentRange: (start, end) => {
      const segCount = Math.max(0, get().waypoints.length - 1);
      let s = Number(start);
      let e = Number(end);
      if (!Number.isInteger(s) || !Number.isInteger(e)) return;
      s = Math.max(0, Math.min(segCount - 1, s));
      e = Math.max(0, Math.min(segCount - 1, e));
      if (e < s) [s, e] = [e, s];
      const selectedSegments = Array.from({ length: e - s + 1 }, (_, i) => s + i);
      set({ selectedSegments, selectedWaypoint: -1 });
    },
    setActiveAxis: (axis) => {
      const a = axisMap[axis] != null ? axis : "y";
      set({ activeAxis: a, activeAxes: [a] });
    },
    setActiveAxes: (axes) => {
      const next = [...new Set((axes || []).filter((a) => axisMap[a] != null))];
      const activeAxis = next[0] ?? get().activeAxis ?? "y";
      set({ activeAxes: next, activeAxis });
    },
    setNudgeStep: (v) => set({ nudgeStep: clampStep(v) }),
    setInsertSegment: (i) => {
      const segCount = Math.max(0, get().waypoints.length - 1);
      const idx = Number(i);
      set({ insertSegment: Number.isInteger(idx) && idx >= 0 && idx < segCount ? idx : -1 });
    },
    setInsertT: (t) => set({ insertT: clamp01(Number(t) || 0) }),
    setAffectedWaypoints: (arr) => {
      const wpCount = get().waypoints.length;
      const next = [...new Set((arr || []).map(Number))]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < wpCount);
      set({ affectedWaypoints: next });
    },

    updateWaypoint: (index, patch) => {
      const idx = Number(index);
      const wps = cloneWaypoints(get().waypoints);
      if (!Number.isInteger(idx) || idx < 0 || idx >= wps.length) return;
      if (patch.pos) wps[idx].pos = [...patch.pos];
      if (patch.dir) wps[idx].dir = [...patch.dir];
      if (patch.name !== undefined) wps[idx].name = patch.name;
      const sampler = rebuildFromCurrent({ waypoints: wps });
      set({ waypoints: wps, sampler });
    },

    updateSegmentOffsetAxis: (segmentIndex, axis, value) => {
      const s = get();
      const idx = Number(segmentIndex);
      const ai = axisMap[axis];
      if (!Number.isInteger(idx) || idx < 0 || idx >= s.segmentOffsets.length || ai == null) return;
      const nextOffsets = s.segmentOffsets.map((off) => [...off]);
      nextOffsets[idx][ai] = Number(value) || 0;
      const sampler = rebuildFromCurrent({ segmentOffsets: nextOffsets });
      set({ segmentOffsets: nextOffsets, sampler });
    },

    setSelectedSegmentsWeightFn: (fnName) => {
      if (!WEIGHT_FNS[fnName]) return;
      const s = get();
      if (!s.selectedSegments.length) return;
      const sorted = [...s.selectedSegments].sort((a, b) => a - b);
      if (sorted.length > 1) {
        const start = sorted[0];
        const end = sorted[sorted.length - 1];
        const prev = s.segmentGroups.find((g) => g.start === start && g.end === end);
        const nextGroups = s.segmentGroups
          .filter((g) => !(g.start === start && g.end === end))
          .concat([
            {
              start,
              end,
              offset: prev?.offset ?? [0, 0, 0],
              weightFn: fnName,
            },
          ]);
        const sampler = rebuildFromCurrent({ segmentGroups: nextGroups });
        set({ segmentGroups: nextGroups, sampler });
        return;
      }

      const nextFns = [...s.segmentWeightFns];
      const idx = sorted[0];
      if (idx >= 0 && idx < nextFns.length) nextFns[idx] = fnName;
      const sampler = rebuildFromCurrent({ segmentWeightFns: nextFns });
      set({ segmentWeightFns: nextFns, sampler });
    },

    updateSelectedSegmentRangeOffsetAxis: (axis, value) => {
      const s = get();
      if (s.selectedSegments.length <= 1) return;
      const ai = axisMap[axis];
      if (ai == null) return;
      const sorted = [...s.selectedSegments].sort((a, b) => a - b);
      const start = sorted[0];
      const end = sorted[sorted.length - 1];
      const prev = s.segmentGroups.find((g) => g.start === start && g.end === end);
      const baseOffset = prev?.offset ?? [0, 0, 0];
      const nextOffset = [...baseOffset];
      nextOffset[ai] = Number(value) || 0;
      const nextGroups = s.segmentGroups
        .filter((g) => !(g.start === start && g.end === end))
        .concat([
          {
            start,
            end,
            offset: nextOffset,
            weightFn: prev?.weightFn ?? "bell",
          },
        ]);
      const sampler = rebuildFromCurrent({ segmentGroups: nextGroups });
      set({ segmentGroups: nextGroups, sampler });
    },

    nudgeSegmentsByAxis: (direction) => {
      const s = get();
      if (!s.selectedSegments.length || !s.activeAxes.length) return;
      const delta = (direction < 0 ? -1 : 1) * s.nudgeStep;
      const sorted = [...s.selectedSegments].sort((a, b) => a - b);
      if (sorted.length > 1) {
        const start = sorted[0];
        const end = sorted[sorted.length - 1];
        const prev = s.segmentGroups.find((g) => g.start === start && g.end === end);
        const nextOffset = [...(prev?.offset ?? [0, 0, 0])];
        s.activeAxes.forEach((axis) => {
          const ai = axisMap[axis];
          if (ai == null) return;
          nextOffset[ai] += delta;
        });
        const nextGroups = s.segmentGroups
          .filter((g) => !(g.start === start && g.end === end))
          .concat([
            {
              start,
              end,
              offset: nextOffset,
              weightFn: prev?.weightFn ?? "bell",
            },
          ]);
        const sampler = rebuildFromCurrent({ segmentGroups: nextGroups });
        set({ segmentGroups: nextGroups, sampler });
        return;
      }

      const nextOffsets = s.segmentOffsets.map((off) => [...off]);
      const segIdx = sorted[0];
      if (segIdx < 0 || segIdx >= nextOffsets.length) return;
      s.activeAxes.forEach((axis) => {
        const ai = axisMap[axis];
        if (ai == null) return;
        nextOffsets[segIdx][ai] += delta;
      });
      const sampler = rebuildFromCurrent({ segmentOffsets: nextOffsets });
      set({ segmentOffsets: nextOffsets, sampler });
    },

    nudgeWaypointsByAxis: (direction) => {
      const s = get();
      if (!s.affectedWaypoints.length || !s.activeAxes.length) return;
      const delta = (direction < 0 ? -1 : 1) * s.nudgeStep;
      const wps = cloneWaypoints(s.waypoints);
      s.affectedWaypoints.forEach((wpIdx) => {
        if (wpIdx < 0 || wpIdx >= wps.length) return;
        s.activeAxes.forEach((axis) => {
          const ai = axisMap[axis];
          if (ai == null) return;
          wps[wpIdx].pos[ai] += delta;
        });
      });
      const sampler = rebuildFromCurrent({ waypoints: wps });
      set({ waypoints: wps, sampler });
    },

    nudgeSelected: (direction) => {
      const s = get();
      if (s.selectedWaypoint < 0 || s.selectedWaypoint >= s.waypoints.length) return;
      const ai = axisMap[s.activeAxis] ?? 1;
      const delta = (direction < 0 ? -1 : 1) * s.nudgeStep;
      const wps = cloneWaypoints(s.waypoints);
      wps[s.selectedWaypoint].pos[ai] += delta;
      const sampler = rebuildFromCurrent({ waypoints: wps });
      set({ waypoints: wps, sampler });
    },

    nudgeSelectedDir: (direction) => {
      const s = get();
      if (s.selectedWaypoint < 0 || s.selectedWaypoint >= s.waypoints.length) return;
      const ai = axisMap[s.activeAxis] ?? 1;
      const delta = (direction < 0 ? -1 : 1) * s.nudgeStep;
      const wps = cloneWaypoints(s.waypoints);
      wps[s.selectedWaypoint].dir[ai] += delta;
      const sampler = rebuildFromCurrent({ waypoints: wps });
      set({ waypoints: wps, sampler });
    },

    insertPointInSegment: (segmentIndex, t) => {
      const s = get();
      const i = Number(segmentIndex);
      if (!Number.isInteger(i) || i < 0 || i >= s.waypoints.length - 1) return;
      const lt = clamp01(Number(t) || 0.5);
      const wps = cloneWaypoints(s.waypoints);
      const A = wps[i];
      const B = wps[i + 1];

      const pos = A.pos.map((v, k) => v + (B.pos[k] - v) * lt);
      const dirA = new THREE.Vector3(...A.dir).normalize();
      const dirB = new THREE.Vector3(...B.dir).normalize();
      const dir = dirA.lerp(dirB, lt).normalize();
      const inserted = {
        pos,
        dir: [dir.x, dir.y, dir.z],
        name: `Inserted ${A.name} -> ${B.name}`,
      };
      wps.splice(i + 1, 0, inserted);

      const nextOffsets = s.segmentOffsets.map((off) => [...off]);
      const baseOff = nextOffsets[i] ?? [0, 0, 0];
      const offA = [baseOff[0] * 0.5, baseOff[1] * 0.5, baseOff[2] * 0.5];
      const offB = [baseOff[0] * 0.5, baseOff[1] * 0.5, baseOff[2] * 0.5];
      nextOffsets.splice(i, 1, offA, offB);

      const nextFns = [...s.segmentWeightFns];
      const baseFn = nextFns[i] ?? "bell";
      nextFns.splice(i, 1, baseFn, baseFn);

      const shiftIndex = (idx) => (idx > i ? idx + 1 : idx);
      const affectedWaypoints = s.affectedWaypoints.map(shiftIndex);
      const nextGroups = s.segmentGroups
        .map((g) => {
          let start = g.start;
          let end = g.end;
          if (start > i) start += 1;
          if (end >= i) end += 1;
          return { ...g, start, end };
        })
        .filter((g) => g.start <= g.end);
      const sampler = rebuild(
        wps,
        s.curveParams,
        nextOffsets,
        nextFns,
        nextGroups
      );

      set({
        waypoints: wps,
        segmentOffsets: nextOffsets,
        segmentWeightFns: nextFns,
        segmentGroups: nextGroups,
        affectedWaypoints,
        selectedSegments: [i, i + 1],
        selectedWaypoint: i + 1,
        insertSegment: i,
        sampler,
      });
    },

    resetWaypoints: () => {
      const waypoints = cloneWaypoints(SPLINE_WAYPOINTS);
      const segmentOffsets = Array.from(
        { length: Math.max(0, waypoints.length - 1) },
        () => [0, 0, 0]
      );
      const segmentWeightFns = Array.from(
        { length: Math.max(0, waypoints.length - 1) },
        () => "bell"
      );
      const segmentGroups = [];
      const sampler = rebuild(
        waypoints,
        get().curveParams,
        segmentOffsets,
        segmentWeightFns,
        segmentGroups
      );
      set({
        waypoints,
        segmentOffsets,
        segmentWeightFns,
        segmentGroups,
        selectedSegments: [],
        selectedWaypoint: -1,
        affectedWaypoints: [],
        insertSegment: -1,
        sampler,
      });
    },

    copyWaypointsToClipboard: () => {
      const text = JSON.stringify(get().waypoints, null, 2);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(
          () => console.log("[SplineCamera] Waypoints copied to clipboard"),
          () => console.log("[SplineCamera] Waypoints:\n", text)
        );
      } else {
        console.log("[SplineCamera] Waypoints:\n", text);
      }
    },

    captureCurrentPose: (camera) => {
      const dir = camera.getWorldDirection(new THREE.Vector3());
      const pos = [camera.position.x, camera.position.y, camera.position.z];
      const d = [dir.x, dir.y, dir.z];
      const { selectedWaypoint: idx, waypoints } = get();
      if (idx < 0 || idx >= waypoints.length) return;
      const wps = cloneWaypoints(waypoints);
      wps[idx].pos = pos;
      wps[idx].dir = d;
      const sampler = rebuildFromCurrent({ waypoints: wps });
      set({ waypoints: wps, sampler });
    },

    /* -- scroll input -- */

    applyWheel: (deltaY) => {
      const state = get();
      if (!state.enabled || deltaY === 0) return;

      // Positive deltaY drives progression forward along the spline.
      const dir = deltaY > 0 ? +1 : -1;
      const mag = Math.abs(deltaY);
      const sensitivity = Math.max(0.01, Math.min(10, state.scrollSensitivity ?? 1));

      // Magnitude mapping — simplified from useCameraStore
      const baseStep = 100;
      const scaleFactor = 0.0015;
      const power = 0.85;
      const maxStep = 0.03;

      const steps = mag / Math.max(1, baseStep);
      let stepSize = Math.pow(steps, power) * scaleFactor * sensitivity;
      stepSize = Math.min(stepSize, maxStep * sensitivity);

      // Sliding: effective scroll = baseScroll * (1 + scrollSlideFactor)
      const slideFactor = Math.max(0, state.scrollSlideFactor ?? 0);
      stepSize *= 1 + slideFactor;

      // Immediate portion (32%) + inertia portion (68%)
      const immediateRatio = 0.32;
      const immediateDelta = dir * stepSize * immediateRatio;
      const baseT = clamp01(state.t + immediateDelta);
      tDriver.value = baseT;
      set({ t: baseT });

      // First-segment dive: at scroll start in segment 0, apply constant dip then ease back
      const { sampler: sm, segment0Dive: diveCfg } = get();
      const uSeg = sm.scrollToU ? sm.scrollToU(baseT) : baseT;
      const { segmentIndex: segIdx } = sm.sample(uSeg);
      const now = isBrowser && typeof performance !== "undefined" ? performance.now() : Date.now();
      const isNewScrollBurst = now - lastScrollInputAt > DIVE_BURST_GAP_MS;
      lastScrollInputAt = now;
      if (segIdx === 0 && diveCfg?.enabled !== false && isNewScrollBurst) {
        startSegment0Dive(diveCfg);
      }

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
      const { t, fov, sampler, segment0DiveOffset: diveOff, segment1Float: floatCfg } = get();
      const u = sampler.scrollToU ? sampler.scrollToU(t) : t;
      const { position, quaternion, segmentIndex } = sampler.sample(u);
      let outPosition = position;
      // Apply dive offset whenever it's non-zero, so leaving segment 0 doesn't snap.
      if ((diveOff ?? 0) !== 0) {
        const dipDistance = Math.abs(diveOff);
        outPosition = position.clone().add(new THREE.Vector3(0, -dipDistance, 0));
      }
      // Segments 1–3 (2nd, 3rd, 4th): subtle vertical float, blended at boundaries.
      if ([1, 2, 3].includes(segmentIndex) && floatCfg?.enabled) {
        const uAtWaypoint = sampler.uAtWaypoint;
        let floatBlend = 1;
        if (Array.isArray(uAtWaypoint) && segmentIndex >= 0 && segmentIndex < uAtWaypoint.length - 1) {
          const u0 = uAtWaypoint[segmentIndex];
          const u1 = uAtWaypoint[segmentIndex + 1];
          const localT = clamp01(u1 > u0 ? (u - u0) / (u1 - u0) : 0);
          if (segmentIndex === 1) floatBlend = smoothStep(localT);
          else if (segmentIndex === 3) floatBlend = smoothStep(1 - localT);
        }
        const time = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
        const amplitude = Number(floatCfg.amplitude ?? 0.01);
        const frequency = Number(floatCfg.frequency ?? 0.45);
        const dy = floatBlend * amplitude * Math.sin(2 * Math.PI * frequency * time);
        outPosition = outPosition.clone().add(new THREE.Vector3(0, dy, 0));
      }
      return { position: outPosition, quaternion, fov, segmentIndex };
    },
  };
});
