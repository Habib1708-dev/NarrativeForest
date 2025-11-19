// src/components/ForestDynamicSampled.jsx
import React, { useMemo, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";
import { useInstancedRocks } from "../hooks/InstancedRocks";
import { heightAt as defaultHeightSampler } from "../proc/heightfield";

/**
 * ForestDynamicSampled — mirrors ForestDynamic, but uses deterministic height sampling
 * instead of per-instance BVH raycasts. Kept side-by-side so behaviour stays identical
 * while we validate the sampler path.
 */
export default function ForestDynamicSampled({
  terrainGroup, // REQUIRED (still used for bounds change detection + occluder publishing)
  tileSize = 4,
  terrainLoadRadius = 2,
  exclusion = null,
  refRockRefs, // OPTIONAL: external array/refs for the rocks instancedMeshes
  onOccludersChange = () => {}, // OPTIONAL: callback(occ[]) for fog prepass, etc.
  sampleHeight = defaultHeightSampler, // height sampler replacing raycasts
}) {
  const { camera } = useThree();

  // ---------------- Controls ----------------
  const {
    seed,
    chunkSize,
    nearRingChunks,
    midRingChunks,
    raysPerFrame,
    retentionSeconds,

    // Scatter & spacing
    treeMinSpacing,
    rockMinSpacing,
    treeTargetPerChunk,
    rockTargetPerChunk,

    // Explicit scale ranges
    treeScaleMin,
    treeScaleMax,
    rockScaleMin,
    rockScaleMax,

    // Rendering toggles
    renderMidTrees,
    renderExtraChunks,

    // Optional tint
    treeTint,
    treeTintIntensity,
    rockTint,
    rockTintIntensity,
  } = useControls("Forest (Dynamic)", {
    seed: { value: 6, min: 0, max: 2 ** 31 - 1, step: 1 },
    chunkSize: { value: 2, min: 1, max: 8, step: 1 },
    nearRingChunks: {
      value: 3,
      min: 1,
      max: 12,
      step: 1,
      label: "Near radius (chunks)",
    },
    midRingChunks: {
      value: 4,
      min: 1,
      max: 16,
      step: 1,
      label: "Mid radius (chunks)",
    },
    raysPerFrame: { value: 150, min: 50, max: 400, step: 5 },
    retentionSeconds: { value: 2.0, min: 0.5, max: 10, step: 0.5 },

    // Spacing & density
    treeMinSpacing: { value: 0.7, min: 0.3, max: 2.0, step: 0.05 },
    rockMinSpacing: { value: 0.35, min: 0.15, max: 1.5, step: 0.05 },
    treeTargetPerChunk: { value: 14, min: 2, max: 60, step: 1 },
    rockTargetPerChunk: { value: 12, min: 0, max: 60, step: 1 },

    // Scales
    treeScaleMin: { value: 0.03, min: 0.005, max: 0.2, step: 0.001 },
    treeScaleMax: { value: 0.06, min: 0.006, max: 0.3, step: 0.001 },
    rockScaleMin: { value: 0.36, min: 0.02, max: 0.5, step: 0.001 },
    rockScaleMax: { value: 0.48, min: 0.03, max: 0.8, step: 0.001 },

    // Rendering toggles
    renderMidTrees: {
      value: false,
      label: "Render mid trees (built either way)",
    },
    renderExtraChunks: {
      value: 3,
      min: 0,
      max: 12,
      step: 1,
      label: "Render radius extra (chunks)",
    },

    // Optional tint
    treeTint: { value: "#000000" },
    treeTintIntensity: { value: 1.0, min: 0, max: 1, step: 0.01 },
    rockTint: { value: "#444444" },
    rockTintIntensity: { value: 1.0, min: 0, max: 1, step: 0.01 },
  });

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
  const NEAR_R = Math.max(1, Math.min(nearRingChunks | 0, maxRFromTiles));
  const MID_R = Math.max(NEAR_R, Math.min(midRingChunks | 0, maxRFromTiles));
  const RENDER_EXTRA = Math.max(0, Math.floor(renderExtraChunks ?? 0));
  const RENDER_R = Math.max(
    MID_R,
    Math.min(maxRFromTiles, MID_R + RENDER_EXTRA)
  );

  // ---------------- Assets ----------------
  const highParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1.glb");
  const rockParts = useInstancedRocks("/models/cabin/MateriallessRock.glb");

  // Instanced refs
  const treeHighRefs = useRef(highParts.map(() => React.createRef()));
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
    highParts.forEach((p) => {
      const m = p.material;
      if (!m?.color) return;
      if (!m.userData._origColor) m.userData._origColor = m.color.clone();
      m.color.copy(m.userData._origColor).lerp(tintC, treeTintIntensity);
      if (typeof m.metalness === "number") m.metalness = 0.0;
      if (typeof m.roughness === "number")
        m.roughness = Math.min(1, Math.max(0.8, m.roughness ?? 1));
      m.needsUpdate = true;
    });
  }, [highParts, treeTint, treeTintIntensity]);

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
  const ROCK_CAP_PER_PART = 1200;

  // One-time mesh init
  useEffect(() => {
    [treeHighRefs.current, rockRefsArray].forEach((arr) =>
      arr.forEach((r) => {
        const m = r.current;
        if (!m) return;
        m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        m.count = 0;
        m.instanceMatrix.needsUpdate = true;
      })
    );
  }, [highParts.length, rockParts.length, rockRefsArray]);

  // ---------- PUBLISH OCCLUDERS (trees & rocks instanced meshes) ----------
  const publishOccluders = useCallback(() => {
    const occ = [];
    treeHighRefs.current.forEach((r) => r.current && occ.push(r.current));
    rockRefsArray.forEach((r) => r.current && occ.push(r.current));
    onOccludersChange?.(occ);
  }, [onOccludersChange, rockRefsArray]);

  useEffect(() => {
    publishOccluders();
    return () => onOccludersChange?.([]);
  }, [publishOccluders, highParts.length, rockParts.length, onOccludersChange]);

  useEffect(() => {
    scheduleRefresh();
  }, []);

  useEffect(() => {
    scheduleRefresh();
  }, [renderMidTrees, RENDER_EXTRA, sampleHeight]);

  useEffect(() => {
    cacheRef.current.clear();
    coldCacheRef.current.clear();
    buildQueueRef.current.length = 0;
    dropTimesRef.current.clear();
    scheduleRefresh();
  }, [seed, chunkSize, treeMinSpacing, rockMinSpacing, sampleHeight]);
  // ------------------------------------------------------------------------

  const chunkKey = (cx, cz) => `${cx},${cz}`;
  const worldToChunk = (x, z) => [
    Math.floor(x / chunkSize),
    Math.floor(z / chunkSize),
  ];

  const neighborhood = (cx, cz, R) => {
    const out = [];
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) out.push([cx + dx, cz + dz]);
    return out;
  };

  const computeModes = (cx, cz) => {
    const next = {};
    const assign = (coords, mode) => {
      for (const [x, z] of coords) {
        const key = chunkKey(x, z);
        if (!next[key]) next[key] = mode;
      }
    };

    assign(neighborhood(cx, cz, RENDER_R), "far");
    assign(neighborhood(cx, cz, MID_R), "med");
    assign(neighborhood(cx, cz, NEAR_R), "high");

    return { next, viewSet: new Set(Object.keys(next)) };
  };

  // Recompute when entering a new chunk
  useFrame(() => {
    if (!terrainGroup) return;

    const childrenCount = terrainGroup.children?.length ?? 0;
    if (childrenCount !== prevChildrenCountRef.current) {
      prevChildrenCountRef.current = childrenCount;
      scheduleRefresh();
    }

    camXZ.current.set(camera.position.x, 0, camera.position.z);
    const [ccx, ccz] = worldToChunk(camXZ.current.x, camXZ.current.z);
    if (ccx === lastCellRef.current.cx && ccz === lastCellRef.current.cz)
      return;
    lastCellRef.current = { cx: ccx, cz: ccz };

    const { next, viewSet } = computeModes(ccx, ccz);

    const now = performance.now();
    for (const k of viewSet) {
      if (!cacheRef.current.has(k)) {
        const restored = coldCacheRef.current.get(k);
        if (restored) {
          cacheRef.current.set(k, restored);
          coldCacheRef.current.delete(k);
          scheduleRefresh();
        } else {
          const [x, z] = k.split(",").map((n) => parseInt(n, 10));
          buildQueueRef.current.push({ key: k, cx: x, cz: z, enqueuedAt: now });
        }
      }
      dropTimesRef.current.delete(k);
    }

    modesRef.current = next;
    for (const k of cacheRef.current.keys())
      if (!viewSet.has(k)) dropTimesRef.current.set(k, performance.now());

    scheduleRefresh();
  });

  // Drop chunks outside retention window after cooldown
  useFrame(() => {
    if (!Object.keys(modesRef.current).length) return;
    const now = performance.now();
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
  });

  // Build cadence — budget derived from raysPerFrame setting
  useFrame(() => {
    if (!buildQueueRef.current.length) return;

    let budget = raysPerFrame;
    if (!Number.isFinite(budget) || budget <= 0) budget = 1;

    while (budget > 0 && buildQueueRef.current.length) {
      const job = buildQueueRef.current.shift();
      if (cacheRef.current.has(job.key)) continue;

      const result = buildChunkSampled(job.cx, job.cz, {
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
        sampleHeight,
      });

      budget -= Math.max(1, result.cost);

      cacheRef.current.set(job.key, {
        trees: result.treeMatrices,
        rocksByPart: result.rockMatricesByPart,
        built: true,
      });
      coldCacheRef.current.delete(job.key);
      scheduleRefresh();
    }
  });

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
        if (cacheRef.current.has(key)) {
          cacheRef.current.delete(key);
          removed = true;
        }
        if (coldCacheRef.current.has(key)) {
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
    if (!Object.keys(modesRef.current).length) return;

    const nearTrees = [];
    const midTrees = [];
    const farTrees = [];
    const rocksByPart = rockParts.map(() => []);

    for (const [key, mode] of Object.entries(modesRef.current)) {
      const rec = cacheRef.current.get(key);
      if (!rec) continue;

      if (mode === "high") {
        nearTrees.push(...rec.trees);
        rec.rocksByPart.forEach((arr, i) => rocksByPart[i].push(...arr));
      } else if (mode === "med") {
        midTrees.push(...rec.trees);
        rec.rocksByPart.forEach((arr, i) => rocksByPart[i].push(...arr));
      } else if (mode === "far") {
        farTrees.push(...rec.trees);
        rec.rocksByPart.forEach((arr, i) => rocksByPart[i].push(...arr));
      }
    }

    const includeMidTrees = renderMidTrees || RENDER_EXTRA > 0;
    const allTrees = nearTrees
      .concat(includeMidTrees ? midTrees : [])
      .concat(farTrees);

    treeHighRefs.current.forEach((ref) => {
      const m = ref.current;
      if (!m) return;
      const N = Math.min(TREE_CAP, allTrees.length);
      for (let i = 0; i < N; i++) m.setMatrixAt(i, allTrees[i]);
      m.count = N;
      m.instanceMatrix.needsUpdate = true;
    });

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

  useFrame(() => {
    if (!needsRefreshRef.current) return;
    needsRefreshRef.current = false;
    applyInstancing();
  }, 1);

  if (!highParts.length || !rockParts.length) return null;

  return (
    <group name="ForestDynamicSampled">
      {/* Trees: HIGH LOD (near always; mid if toggled) */}
      {highParts.map((p, i) => (
        <instancedMesh
          key={`fds-th-${i}`}
          ref={treeHighRefs.current[i]}
          args={[p.geometry, p.material, TREE_CAP]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}

      {/* Rocks: near ring only */}
      {rockParts.map((p, i) => (
        <instancedMesh
          key={`fds-rk-${i}`}
          ref={rockRefsArray[i]}
          args={[p.geometry, p.material, ROCK_CAP_PER_PART]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/** --------- Chunk builder (deterministic, height sampler) --------- */
function buildChunkSampled(cx, cz, opts) {
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
    sampleHeight,
  } = opts;

  const rng = mulberry32(
    ((cx * 73856093) ^ (cz * 19349663) ^ (seed ^ 0x9e3779b9)) >>> 0
  );

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

      const terrainY = sampleHeight(x, z);
      if (!Number.isFinite(terrainY)) continue;

      const bottomAlign = -treeBaseMinY * scale;
      const sink = 0.02;
      const y = terrainY - bottomAlign - sink;

      const rotY = rng() * Math.PI * 2;

      const m4 = new THREE.Matrix4();
      const p = new THREE.Vector3(x, y, z);
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, rotY, 0)
      );
      const s = new THREE.Vector3(scale, scale, scale);
      m4.compose(p, q, s);
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

      const terrainY = sampleHeight(x, z);
      if (!Number.isFinite(terrainY)) continue;

      const pick = Math.floor(rng() * Math.max(1, rockBottomPerPart.length));

      let y = terrainY;
      const bottomAlign = (rockBottomPerPart[pick] || 0) * scale;
      const sink = 0.4 * scale;
      y += bottomAlign - sink;

      const rx = (rng() - 0.5) * 0.2;
      const ry = rng() * Math.PI * 2;

      const m4 = new THREE.Matrix4();
      const p = new THREE.Vector3(x, y, z);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0));
      const s = new THREE.Vector3(scale, scale, scale);
      m4.compose(p, q, s);
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
