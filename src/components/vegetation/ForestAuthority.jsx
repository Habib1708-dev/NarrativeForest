// src/components/ForestAuthority.jsx
// Authority-Anchored Forest System
// Extended version of ForestDynamicSampled with support for freeflight mode coordinate offset
import React, { useMemo, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useInstancedTree } from "../../hooks/useInstancedTree";
import { useInstancedRocks } from "../../hooks/useInstancedRocks";
import { heightAt as defaultHeightSampler } from "../../proc/heightfield";
import { emitDistanceFadeTileReady } from "../../utils/distanceFadeEvents";
import {
  usePerformanceMonitor,
  useGLBLoadTracker,
} from "../../utils/usePerformanceMonitor";
import {
  anchoredHeightAt,
  getSampleChunkCoords,
  worldToAnchoredChunk,
} from "../../proc/anchoredHeightfield";
import { useWorldAnchorStore } from "../../state/useWorldAnchorStore";

const DEFAULT_FOREST_PARAMS = Object.freeze({
  seed: 6,
  chunkSize: 2,
  nearRingChunks: 6, // Wider near ring for smoother freeflight (high-quality trees/rocks, no LOD)
  midRingChunks: 7, // Wider mid ring — safe since height sampling is procedural
  nearImmediateFraction: 0.4, // Slightly up from 0.3
  raysPerFrame: 1500, // Budget per frame for placement attempts (pure CPU math, ~0.5ms at this level)
  retentionSeconds: 2, // Reduced from 3 for faster memory reclamation
  treeMinSpacing: 0.7,
  rockMinSpacing: 0.35,
  treeTargetPerChunk: 14,
  rockTargetPerChunk: 12,
  treeScaleMin: 0.03,
  treeScaleMax: 0.06,
  rockScaleMin: 0.36,
  rockScaleMax: 0.48,
  renderMidTrees: false,
  renderExtraChunks: 3, // Keep original
  treeTint: "#000000",
  treeTintIntensity: 1,
  rockTint: "#444444",
  rockTintIntensity: 1,
  // Direction-aware pre-loading (main improvement - low overhead)
  predictAheadSeconds: 2.0, // Look ahead 2 seconds for smooth freeflight
  predictChunkRadius: 3, // Pre-load 3 extra chunks in movement direction
});

// Reuse transform helpers + matrix instances to reduce per-chunk GC pressure
const MATRIX_POOL = [];
const TMP_POS = new THREE.Vector3();
const TMP_SCALE = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_EULER = new THREE.Euler();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function acquireMatrix() {
  return MATRIX_POOL.length ? MATRIX_POOL.pop() : new THREE.Matrix4();
}

function releaseMatrix(m) {
  if (!m) return;
  m.identity();
  MATRIX_POOL.push(m);
}

/**
 * ForestAuthority — Authority-anchored forest system.
 *
 * This component extends ForestDynamicSampled with support for the WorldAnchor system:
 * - In AUTHORED mode: chunks sample in absolute world space
 * - In FREEFLIGHT mode: chunks sample with travel offset for infinite illusion
 *
 * Trees and rocks remain aligned with terrain because both use the same
 * anchor-relative coordinate space for sampling.
 */
export default function ForestAuthority({
  terrainGroup, // REQUIRED (still used for bounds change detection + occluder publishing)
  tileSize = 4,
  terrainLoadRadius = 2,
  exclusion = null,
  refRockRefs, // OPTIONAL: external array/refs for the rocks instancedMeshes
  onOccludersChange = () => { }, // OPTIONAL: callback(occ[]) for fog prepass, etc.
  sampleHeight = defaultHeightSampler, // height sampler (used as fallback, prefer anchoredHeightAt)
  config,
  onInitialReady,
}) {
  const { camera } = useThree();
  const { markStart, markEnd } = usePerformanceMonitor("ForestAuthority");
  useGLBLoadTracker("/models/tree/Spruce_Fir/Spruce1_draco.glb");
  useGLBLoadTracker("/models/tree/Spruce_Fir/Spruce1LOD_draco.glb");
  useGLBLoadTracker("/models/rocks/MateriallessRock.glb");

  const settings = useMemo(() => {
    if (!config) return DEFAULT_FOREST_PARAMS;
    return { ...DEFAULT_FOREST_PARAMS, ...config };
  }, [config]);
  const initialReadyNotifiedRef = useRef(false);
  const onInitialReadyRef = useRef(onInitialReady);

  useEffect(() => {
    onInitialReadyRef.current = onInitialReady;
  }, [onInitialReady]);

  useEffect(() => {
    markStart("glb-loads");
    markStart("initial-chunks");
  }, [markStart]);

  const {
    seed,
    chunkSize,
    nearRingChunks,
    midRingChunks,
    nearImmediateFraction,
    raysPerFrame,
    retentionSeconds,
    treeMinSpacing,
    rockMinSpacing,
    treeTargetPerChunk,
    rockTargetPerChunk,
    treeScaleMin,
    treeScaleMax,
    rockScaleMin,
    rockScaleMax,
    renderMidTrees,
    renderExtraChunks,
    treeTint,
    treeTintIntensity,
    rockTint,
    rockTintIntensity,
    predictAheadSeconds,
    predictChunkRadius,
  } = settings;

  // Terrain half-extent clamp so forest never outruns loaded tiles
  const tileHalfExtent = useMemo(
    () => (terrainLoadRadius + 0.5) * tileSize,
    [terrainLoadRadius, tileSize]
  );
  const maxRFromTiles = useMemo(
    () =>
      Math.max(1, Math.floor((tileHalfExtent - 0.5) / Math.max(1, chunkSize))),
    [tileHalfExtent, chunkSize]
  );

  // Effective radii (ensure mid >= near, both within tile extent)
  const NEAR_SCALE = 0.8;
  const NEAR_R = Math.max(
    1,
    Math.min(
      Math.max(1, Math.round((nearRingChunks | 0) * NEAR_SCALE)),
      maxRFromTiles
    )
  );
  const MID_R = Math.max(NEAR_R, Math.min(midRingChunks | 0, maxRFromTiles));
  const RENDER_EXTRA = Math.max(0, Math.floor(renderExtraChunks ?? 0));
  const RENDER_R = Math.max(
    MID_R,
    Math.min(maxRFromTiles, MID_R + RENDER_EXTRA)
  );
  const immediateChunkFraction = useMemo(() => {
    if (!Number.isFinite(nearImmediateFraction)) return 0.3;
    return Math.min(0.9, Math.max(0.1, nearImmediateFraction));
  }, [nearImmediateFraction]);

  // ---------------- Assets ----------------
  const highParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1_draco.glb");
  const lodParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1LOD_draco.glb");
  const rockParts = useInstancedRocks("/models/rocks/MateriallessRock.glb");

  // Instanced refs
  const treeHighRefs = useRef(highParts.map(() => React.createRef()));
  const treeLodRefs = useRef(lodParts.map(() => React.createRef()));
  const rockRefsArray = useMemo(() => {
    const external =
      (Array.isArray(refRockRefs) && refRockRefs) ||
      (Array.isArray(refRockRefs?.current) && refRockRefs.current) ||
      null;
    return external ?? rockParts.map(() => React.createRef());
  }, [refRockRefs, rockParts.length]);

  // Optional tints
  useEffect(() => {
    const tintC = new THREE.Color(treeTint);
    [...highParts, ...lodParts].forEach((p) => {
      const m = p.material;
      if (!m?.color) return;
      if (!m.userData._origColor) m.userData._origColor = m.color.clone();
      m.color.copy(m.userData._origColor).lerp(tintC, treeTintIntensity);
      if (typeof m.metalness === "number") m.metalness = 0.0;
      if (typeof m.roughness === "number")
        m.roughness = Math.min(1, Math.max(0.8, m.roughness ?? 1));
      m.needsUpdate = true;
    });
  }, [highParts, lodParts, treeTint, treeTintIntensity]);

  useEffect(() => {
    const tintC = new THREE.Color(rockTint);
    rockParts.forEach((p) => {
      const m = p.material;
      if (!m?.color) return;
      if (!m.userData._origColor) m.userData._origColor = m.color.clone();
      m.color.copy(m.userData._origColor).lerp(tintC, rockTintIntensity);
      if (typeof m.metalness === "number") m.metalness = 0.0;
      if (typeof m.roughness === "number")
        m.roughness = Math.max(0.6, Math.min(1.0, m.roughness ?? 1.0));
      m.needsUpdate = true;
    });
  }, [rockParts, rockTint, rockTintIntensity]);

  useEffect(() => {
    if (highParts.length && lodParts.length && rockParts.length) {
      markEnd("glb-loads");
    }
  }, [highParts.length, lodParts.length, rockParts.length, markEnd]);

  // ---------------- Helpers ----------------
  const treeBaseMinY = useMemo(() => {
    let minY = 0;
    for (const p of highParts) {
      const bb = p.geometry.boundingBox;
      if (bb) minY = Math.min(minY, bb.min.y);
    }
    return minY;
  }, [highParts]);

  const rockBottomPerPart = useMemo(
    () =>
      rockParts.map((rp) => {
        const bb = rp.geometry.boundingBox || null;
        return bb ? -bb.min.y : 0;
      }),
    [rockParts]
  );

  const insideExclusion = (x, z) => {
    if (!exclusion) return false;
    const { centerX, centerZ, width, depth } = exclusion;
    return (
      Math.abs(x - centerX) <= width * 0.5 &&
      Math.abs(z - centerZ) <= depth * 0.5
    );
  };

  // ---------------- Chunk windows & modes (NEAR + MID only) ----------------
  const modesRef = useRef({});
  const lastCellRef = useRef({ cx: 1e9, cz: 1e9 });
  const camXZ = useRef(new THREE.Vector3());
  const prevChildrenCountRef = useRef(-1);

  // Direction-aware pre-loading: velocity tracking
  const lastCamPosRef = useRef(new THREE.Vector3());
  const camVelocityRef = useRef(new THREE.Vector3());
  const lastFrameTimeRef = useRef(performance.now());

  useEffect(() => {
    lastCellRef.current = { cx: 1e9, cz: 1e9 };
  }, [NEAR_R, MID_R, RENDER_R]);

  // Chunk cache
  const cacheRef = useRef(new Map());
  const coldCacheRef = useRef(new Map());
  const buildQueueRef = useRef([]);
  const dropTimesRef = useRef(new Map());

  const needsRefreshRef = useRef(false);
  const scheduleRefresh = () => {
    needsRefreshRef.current = true;
  };

  // Capacities
  const TREE_CAP = 6000;
  const TREE_LOD_CAP = 6000;
  const ROCK_CAP_PER_PART = 1200;

  // Memoize instancedMesh ctor args so R3F doesn't recreate materials every render
  const treeHighArgs = useMemo(
    () => highParts.map((p) => [p.geometry, p.material, TREE_CAP]),
    [highParts]
  );
  const treeLodArgs = useMemo(() => {
    if (!highParts.length) return [];
    return lodParts.map((p, i) => [
      p.geometry,
      highParts[i % highParts.length]?.material || p.material,
      TREE_LOD_CAP,
    ]);
  }, [lodParts, highParts]);
  const rockArgs = useMemo(
    () => rockParts.map((p) => [p.geometry, p.material, ROCK_CAP_PER_PART]),
    [rockParts]
  );

  // One-time mesh init
  useEffect(() => {
    [treeHighRefs.current, treeLodRefs.current, rockRefsArray].forEach((arr) =>
      arr.forEach((r) => {
        const m = r.current;
        if (!m) return;
        m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        m.count = 0;
        m.instanceMatrix.needsUpdate = true;

        emitDistanceFadeTileReady({ mesh: m, key: m.uuid });
      })
    );
  }, [highParts.length, lodParts.length, rockParts.length, rockRefsArray]);

  // ---------- PUBLISH OCCLUDERS (trees & rocks instanced meshes) ----------
  const publishOccluders = useCallback(() => {
    const occ = [];
    treeHighRefs.current.forEach((r) => r.current && occ.push(r.current));
    treeLodRefs.current.forEach((r) => r.current && occ.push(r.current));
    rockRefsArray.forEach((r) => r.current && occ.push(r.current));
    onOccludersChange?.(occ);
  }, [onOccludersChange, rockRefsArray]);

  useEffect(() => {
    publishOccluders();
    return () => onOccludersChange?.([]);
  }, [
    publishOccluders,
    highParts.length,
    lodParts.length,
    rockParts.length,
    onOccludersChange,
  ]);

  useEffect(() => {
    scheduleRefresh();
  }, []);

  useEffect(() => {
    scheduleRefresh();
  }, [renderMidTrees, RENDER_EXTRA, sampleHeight, immediateChunkFraction]);

  useEffect(() => {
    releaseCacheMap(cacheRef.current);
    releaseCacheMap(coldCacheRef.current);
    buildQueueRef.current.length = 0;
    dropTimesRef.current.clear();
    scheduleRefresh();
  }, [
    seed,
    chunkSize,
    treeMinSpacing,
    rockMinSpacing,
    treeTargetPerChunk,
    rockTargetPerChunk,
    treeScaleMin,
    treeScaleMax,
    rockScaleMin,
    rockScaleMax,
    sampleHeight,
  ]);
  // ------------------------------------------------------------------------

  const chunkKey = (cx, cz) => `${cx},${cz}`;

  /**
   * AUTHORITY-ANCHOR AWARE: Convert world position to chunk coordinates.
   * In FREEFLIGHT mode, uses sample-space coordinates.
   */
  const worldToChunk = (x, z) => {
    return worldToAnchoredChunk(x, z, chunkSize);
  };

  // Frame counter for throttling retention checks
  const frameCountRef = useRef(0);

  const neighborhood = (cx, cz, R) => {
    const out = [];
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) out.push([cx + dx, cz + dz]);
    return out;
  };

  const computeModes = (cx, cz, velocity = null) => {
    const next = {};
    const assign = (coords, mode) => {
      for (const [x, z] of coords) {
        const key = chunkKey(x, z);
        next[key] = mode;
      }
    };

    assign(neighborhood(cx, cz, RENDER_R), "far");
    assign(neighborhood(cx, cz, MID_R), "med");

    const nearEntries = neighborhood(cx, cz, NEAR_R).map(([x, z]) => ({
      x,
      z,
      distSq: (x - cx) * (x - cx) + (z - cz) * (z - cz),
    }));

    nearEntries.sort((a, b) => a.distSq - b.distSq);
    const totalNear = nearEntries.length;
    const immediateCount = Math.min(
      totalNear,
      Math.max(1, Math.round(totalNear * immediateChunkFraction))
    );

    nearEntries.forEach((entry, idx) => {
      const mode = idx < immediateCount ? "highImmediate" : "highBuffer";
      const key = chunkKey(entry.x, entry.z);
      next[key] = mode;
    });

    // Direction-aware pre-loading: predict chunks ahead of camera movement
    if (velocity && velocity.lengthSq() > 0.01) {
      const speed = velocity.length();
      const dir = velocity.clone().normalize();
      // Calculate how many chunks ahead based on speed and predictAheadSeconds
      const predictDist = speed * (predictAheadSeconds || 1.5);
      const predictChunks = Math.ceil(predictDist / chunkSize) + (predictChunkRadius || 3);

      // Pre-load chunks in a cone ahead of camera
      for (let i = 1; i <= predictChunks; i++) {
        // Main direction
        const px = cx + Math.round(dir.x * i);
        const pz = cz + Math.round(dir.z * i);
        const key = chunkKey(px, pz);
        if (!next[key] || next[key] === "far" || next[key] === "med") {
          next[key] = "highPredicted";
        }

        // Spread to adjacent chunks for wider coverage (cone effect)
        if (i > 1) {
          const perpX = -dir.z;
          const perpZ = dir.x;
          for (let offset = -1; offset <= 1; offset += 2) {
            const spreadFactor = Math.min(1, i * 0.3);
            const sx = cx + Math.round(dir.x * i + perpX * offset * spreadFactor);
            const sz = cz + Math.round(dir.z * i + perpZ * offset * spreadFactor);
            const sKey = chunkKey(sx, sz);
            if (!next[sKey] || next[sKey] === "far" || next[sKey] === "med") {
              next[sKey] = "highPredicted";
            }
          }
        }
      }
    }

    return { next, viewSet: new Set(Object.keys(next)) };
  };

  // ==================== CONSOLIDATED useFrame ====================
  useFrame(() => {
    frameCountRef.current++;
    const now = performance.now();

    // === Phase 1: Camera tracking & mode computation ===
    if (terrainGroup) {
      const childrenCount = terrainGroup.children?.length ?? 0;
      if (childrenCount !== prevChildrenCountRef.current) {
        prevChildrenCountRef.current = childrenCount;
        scheduleRefresh();
      }

      camXZ.current.set(camera.position.x, 0, camera.position.z);

      // Calculate camera velocity for direction-aware pre-loading
      const dt = (now - lastFrameTimeRef.current) / 1000; // Delta time in seconds
      if (dt > 0 && dt < 0.5) {
        // Avoid huge deltas (e.g., after tab switch)
        camVelocityRef.current
          .subVectors(camXZ.current, lastCamPosRef.current)
          .divideScalar(dt);
      }
      lastCamPosRef.current.copy(camXZ.current);
      lastFrameTimeRef.current = now;

      // AUTHORITY-ANCHOR AWARE: Use anchor-relative chunk coordinates
      const [ccx, ccz] = worldToChunk(camXZ.current.x, camXZ.current.z);
      if (ccx !== lastCellRef.current.cx || ccz !== lastCellRef.current.cz) {
        lastCellRef.current = { cx: ccx, cz: ccz };

        // Pass velocity for direction-aware pre-loading
        const { next, viewSet } = computeModes(ccx, ccz, camVelocityRef.current);

        for (const k of viewSet) {
          if (!cacheRef.current.has(k)) {
            const restored = coldCacheRef.current.get(k);
            if (restored) {
              cacheRef.current.set(k, restored);
              coldCacheRef.current.delete(k);
              scheduleRefresh();
            } else {
              const commaIdx = k.indexOf(",");
              const x = parseInt(k.slice(0, commaIdx), 10);
              const z = parseInt(k.slice(commaIdx + 1), 10);
              buildQueueRef.current.push({ key: k, cx: x, cz: z, enqueuedAt: now });
            }
          }
          dropTimesRef.current.delete(k);
        }

        modesRef.current = next;
        for (const k of cacheRef.current.keys()) {
          if (!viewSet.has(k)) dropTimesRef.current.set(k, now);
        }

        scheduleRefresh();
      }
    }

    // === Phase 2: Retention management (throttled - every 10 frames) ===
    if (frameCountRef.current % 10 === 0 && dropTimesRef.current.size > 0) {
      const cooldown = retentionSeconds * 1000;
      dropTimesRef.current.forEach((t0, key) => {
        if (now - t0 >= cooldown) {
          const rec = cacheRef.current.get(key);
          if (rec) {
            coldCacheRef.current.set(key, rec);
            cacheRef.current.delete(key);
            scheduleRefresh();
          }
          dropTimesRef.current.delete(key);
        }
      });
    }

    // === Phase 3: Build queue processing ===
    if (buildQueueRef.current.length) {
      let budget = raysPerFrame;
      if (!Number.isFinite(budget) || budget <= 0) budget = 1;

      // Priority sorting: highImmediate first, then highPredicted, then others
      const priority = {
        highImmediate: 0,
        highPredicted: 1,
        highBuffer: 2,
        med: 3,
        far: 4,
      };
      buildQueueRef.current.sort((a, b) => {
        const ma = modesRef.current[a.key];
        const mb = modesRef.current[b.key];
        return (priority[ma] ?? 5) - (priority[mb] ?? 5);
      });

      while (budget > 0 && buildQueueRef.current.length) {
        const job = buildQueueRef.current.shift();
        const { key, cx, cz } = job;
        if (cacheRef.current.has(key)) continue;

        const staleCold = coldCacheRef.current.get(key);
        if (staleCold) {
          releaseChunkRecord(staleCold);
          coldCacheRef.current.delete(key);
        }

        // AUTHORITY-ANCHOR AWARE: Use buildChunkAuthority which samples with anchor offset
        const result = buildChunkAuthority(cx, cz, {
          chunkSize,
          treeMinSpacing,
          rockMinSpacing,
          treeTargetPerChunk,
          rockTargetPerChunk,
          treeScaleMin,
          treeScaleMax,
          rockScaleMin,
          rockScaleMax,
          seed,
          treeBaseMinY,
          rockBottomPerPart,
          insideExclusion,
        });

        budget -= Math.max(1, result.cost);

        cacheRef.current.set(key, {
          trees: result.treeMatrices,
          rocksByPart: result.rockMatricesByPart,
          built: true,
        });
        scheduleRefresh();
      }
    }

    // === Phase 4: Initial ready check ===
    if (!initialReadyNotifiedRef.current) {
      const modes = modesRef.current;
      let hasAnyModes = false;
      for (const _ in modes) {
        hasAnyModes = true;
        break;
      }
      if (hasAnyModes && buildQueueRef.current.length === 0) {
        let allCached = true;
        for (const key in modes) {
          if (!cacheRef.current.has(key)) {
            allCached = false;
            break;
          }
        }
        if (allCached) {
          initialReadyNotifiedRef.current = true;
          markEnd("initial-chunks");
          onInitialReadyRef.current?.();
        }
      }
    }
  });

  useEffect(() => {
    return () => {
      releaseCacheMap(cacheRef.current);
      releaseCacheMap(coldCacheRef.current);
      buildQueueRef.current.length = 0;
      dropTimesRef.current.clear();
    };
  }, []);

  // Rebuild overlapping chunks immediately when exclusion changes (instant cleanup)
  useEffect(() => {
    if (!exclusion) return;
    const { centerX, centerZ, width, depth } = exclusion;
    const minX = centerX - width * 0.5;
    const maxX = centerX + width * 0.5;
    const minZ = centerZ - depth * 0.5;
    const maxZ = centerZ + depth * 0.5;

    const minCx = Math.floor(minX / chunkSize);
    const maxCx = Math.floor(maxX / chunkSize);
    const minCz = Math.floor(minZ / chunkSize);
    const maxCz = Math.floor(maxZ / chunkSize);

    const now = performance.now();
    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = chunkKey(cx, cz);
        let removed = false;
        const warm = cacheRef.current.get(key);
        if (warm) {
          releaseChunkRecord(warm);
          cacheRef.current.delete(key);
          removed = true;
        }
        const cold = coldCacheRef.current.get(key);
        if (cold) {
          releaseChunkRecord(cold);
          coldCacheRef.current.delete(key);
          removed = true;
        }
        if (removed && modesRef.current[key]) {
          buildQueueRef.current.push({ key, cx, cz, enqueuedAt: now });
        }
      }
    }
    scheduleRefresh();
  }, [exclusion, chunkSize]);

  // Aggregate matrices from active chunks → upload to instanced meshes
  function applyInstancing() {
    const modes = modesRef.current;
    let hasAnyModes = false;
    for (const _ in modes) {
      hasAnyModes = true;
      break;
    }
    if (!hasAnyModes) return;

    const nearImmediateTrees = [];
    const nearBufferTrees = [];
    const rocksByPart = rockParts.map(() => []);

    for (const key in modes) {
      if (!Object.hasOwn(modes, key)) continue;
      const mode = modes[key];
      const rec = cacheRef.current.get(key);
      if (!rec) continue;

      if (mode === "highImmediate") {
        for (let j = 0; j < rec.trees.length; j++) nearImmediateTrees.push(rec.trees[j]);
      } else if (mode === "highBuffer" || mode === "highPredicted") {
        for (let j = 0; j < rec.trees.length; j++) nearBufferTrees.push(rec.trees[j]);
      }
      if (mode === "highImmediate" || mode === "highBuffer" || mode === "highPredicted") {
        rec.rocksByPart.forEach((arr, i) => {
          for (let j = 0; j < arr.length; j++) rocksByPart[i].push(arr[j]);
        });
      }
    }

    const uploadTreeMatrices = (refs, mats, cap) => {
      refs.forEach((ref) => {
        const m = ref.current;
        if (!m) return;
        const N = Math.min(cap, mats.length);
        for (let i = 0; i < N; i++) m.setMatrixAt(i, mats[i]);
        m.count = N;
        m.instanceMatrix.needsUpdate = true;
      });
    };

    uploadTreeMatrices(treeHighRefs.current, nearImmediateTrees, TREE_CAP);
    uploadTreeMatrices(treeLodRefs.current, nearBufferTrees, TREE_LOD_CAP);

    rockRefsArray.forEach((ref, iPart) => {
      const m = ref.current;
      if (!m) return;
      const mats = rocksByPart[iPart] || [];
      const N = Math.min(ROCK_CAP_PER_PART, mats.length);
      for (let i = 0; i < N; i++) m.setMatrixAt(i, mats[i]);
      m.count = N;
      m.instanceMatrix.needsUpdate = true;
    });
  }

  // Apply instancing at priority 1
  useFrame(() => {
    if (!needsRefreshRef.current) return;
    needsRefreshRef.current = false;
    applyInstancing();
  }, 1);

  if (!highParts.length || !lodParts.length || !rockParts.length) return null;

  return (
    <group name="ForestAuthority">
      {/* Trees: HIGH LOD (near always; mid if toggled) */}
      {highParts.map((p, i) => (
        <instancedMesh
          key={`fa-th-${i}`}
          ref={treeHighRefs.current[i]}
          args={treeHighArgs[i]}
          frustumCulled={false}
        />
      ))}

      {/* Trees: LOD buffer within near ring */}
      {lodParts.map((p, i) => (
        <instancedMesh
          key={`fa-tlod-${i}`}
          ref={treeLodRefs.current[i]}
          args={treeLodArgs[i]}
          frustumCulled={false}
        />
      ))}

      {/* Rocks: near ring only */}
      {rockParts.map((p, i) => (
        <instancedMesh
          key={`fa-rk-${i}`}
          ref={rockRefsArray[i]}
          args={rockArgs[i]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/**
 * AUTHORITY-ANCHOR AWARE: Chunk builder using anchor-relative sampling.
 *
 * Uses sample-space chunk coordinates for deterministic hashing,
 * and anchoredHeightAt for terrain height sampling.
 */
function buildChunkAuthority(cx, cz, opts) {
  const {
    chunkSize,
    treeMinSpacing,
    rockMinSpacing,
    treeTargetPerChunk,
    rockTargetPerChunk,
    treeScaleMin,
    treeScaleMax,
    rockScaleMin,
    rockScaleMax,
    seed,
    treeBaseMinY,
    rockBottomPerPart,
    insideExclusion,
  } = opts;

  // AUTHORITY-ANCHOR AWARE: Get sample-space chunk coordinates for deterministic hashing
  // This ensures the same terrain features appear at the same sample-space coordinates
  // regardless of where freeflight was activated
  const { cx: sampleCx, cz: sampleCz } = getSampleChunkCoords(cx, cz, chunkSize);

  // Use sample-space coordinates for RNG seed
  const rng = mulberry32(
    ((sampleCx * 73856093) ^ (sampleCz * 19349663) ^ (seed ^ 0x9e3779b9)) >>> 0
  );

  // World-space bounds for placement
  const minX = cx * chunkSize;
  const minZ = cz * chunkSize;
  const maxX = minX + chunkSize;
  const maxZ = minZ + chunkSize;

  const occTrees = makeHasherLocal(Math.max(0.05, treeMinSpacing * 0.5));
  const occRocks = makeHasherLocal(Math.max(0.05, rockMinSpacing * 0.5));

  const trees = [];
  const rockByPart = rockBottomPerPart.map(() => []);

  let treeAttempts = 0;
  let rockAttempts = 0;
  let treesPlaced = 0;
  let rocksPlaced = 0;

  {
    const maxAttempts = treeTargetPerChunk * 60;
    const tMin = Math.max(0.001, Math.min(treeScaleMin, treeScaleMax));
    const tMax = Math.max(tMin + 1e-4, Math.max(treeScaleMin, treeScaleMax));
    const rTree = Math.max(0.05, treeMinSpacing * 0.5);

    while (treesPlaced < treeTargetPerChunk && treeAttempts < maxAttempts) {
      treeAttempts++;

      const x = minX + rng() * (maxX - minX);
      const z = minZ + rng() * (maxZ - minZ);
      if (insideExclusion(x, z)) continue;

      const scale = tMin + rng() * (tMax - tMin);
      if (!occTrees.canPlace(x, z, rTree)) continue;

      // AUTHORITY-ANCHOR AWARE: Use anchoredHeightAt for terrain sampling
      const terrainY = anchoredHeightAt(x, z);
      if (!Number.isFinite(terrainY)) continue;

      const bottomAlign = -treeBaseMinY * scale;
      const sink = 0.02;
      const y = terrainY - bottomAlign - sink;

      const rotY = rng() * Math.PI * 2;

      const m4 = acquireMatrix();
      TMP_POS.set(x, y, z);
      TMP_QUAT.setFromAxisAngle(Y_AXIS, rotY);
      TMP_SCALE.setScalar(scale);
      m4.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
      trees.push(m4);

      occTrees.add(x, z, rTree);
      treesPlaced++;
    }
  }

  {
    const maxAttempts = rockTargetPerChunk * 60;
    const rMin = Math.max(0.02, Math.min(rockScaleMin, rockScaleMax));
    const rMax = Math.max(rMin + 1e-4, Math.max(rockScaleMin, rockScaleMax));
    const rRock = Math.max(0.03, rockMinSpacing * 0.5);

    while (rocksPlaced < rockTargetPerChunk && rockAttempts < maxAttempts) {
      rockAttempts++;

      const x = minX + rng() * (maxX - minX);
      const z = minZ + rng() * (maxZ - minZ);
      if (insideExclusion(x, z)) continue;

      const scale = rMin + rng() * (rMax - rMin);
      if (!occRocks.canPlace(x, z, rRock)) continue;

      // AUTHORITY-ANCHOR AWARE: Use anchoredHeightAt for terrain sampling
      const terrainY = anchoredHeightAt(x, z);
      if (!Number.isFinite(terrainY)) continue;

      const pick = Math.floor(rng() * Math.max(1, rockBottomPerPart.length));

      let y = terrainY;
      const bottomAlign = (rockBottomPerPart[pick] || 0) * scale;
      const sink = 0.4 * scale;
      y += bottomAlign - sink;

      const rx = (rng() - 0.5) * 0.2;
      const ry = rng() * Math.PI * 2;

      const m4 = acquireMatrix();
      TMP_POS.set(x, y, z);
      TMP_EULER.set(rx, ry, 0);
      TMP_QUAT.setFromEuler(TMP_EULER);
      TMP_SCALE.setScalar(scale);
      m4.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
      rockByPart[pick].push(m4);

      occRocks.add(x, z, rRock);
      rocksPlaced++;
    }
  }

  const cost = Math.max(1, treeAttempts + rockAttempts);

  return { treeMatrices: trees, rockMatricesByPart: rockByPart, cost };
}

function makeHasherLocal(cellSize) {
  const map = new Map();
  const key = (i, j) => `${i},${j}`;
  const cell = (x, z) => [Math.floor(x / cellSize), Math.floor(z / cellSize)];
  const add = (x, z, r) => {
    const [ci, cj] = cell(x, z);
    const k = key(ci, cj);
    let arr = map.get(k);
    if (!arr) {
      arr = [];
      map.set(k, arr);
    }
    arr.push({ x, z, r });
  };
  const canPlace = (x, z, r) => {
    const [ci, cj] = cell(x, z);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const arr = map.get(key(ci + di, cj + dj));
        if (!arr) continue;
        for (const it of arr) {
          const dx = x - it.x;
          const dz = z - it.z;
          const rr = r + it.r;
          if (dx * dx + dz * dz < rr * rr) return false;
        }
      }
    return true;
  };
  return { add, canPlace };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let z = Math.imul(t ^ (t >>> 15), 1 | t);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function releaseChunkRecord(rec) {
  if (!rec) return;
  if (rec.trees) {
    rec.trees.forEach(releaseMatrix);
    rec.trees.length = 0;
  }
  if (rec.rocksByPart) {
    rec.rocksByPart.forEach((arr) => {
      arr.forEach(releaseMatrix);
      arr.length = 0;
    });
  }
}

function releaseCacheMap(map) {
  if (!map) return;
  for (const rec of map.values()) releaseChunkRecord(rec);
  map.clear();
}
