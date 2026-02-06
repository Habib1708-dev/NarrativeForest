// src/components/ForestDynamic.jsx
import React, { useMemo, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useInstancedTree } from "../../hooks/useInstancedTree";
import { useInstancedRocks } from "../../hooks/useInstancedRocks";
import { emitDistanceFadeTileReady } from "../../utils/distanceFadeEvents";

const DEFAULT_FOREST_PARAMS = Object.freeze({
  seed: 6,
  chunkSize: 2,
  nearRingChunks: 3,
  midRingChunks: 4,
  raysPerFrame: 150,
  retentionSeconds: 2,
  treeMinSpacing: 0.7,
  rockMinSpacing: 0.35,
  treeTargetPerChunk: 14,
  rockTargetPerChunk: 12,
  treeScaleMin: 0.03,
  treeScaleMax: 0.06,
  rockScaleMin: 0.36,
  rockScaleMax: 0.48,
  renderMidTrees: false,
  renderExtraChunks: 3,
  treeTint: "#000000",
  treeTintIntensity: 1,
  rockTint: "#444444",
  rockTintIntensity: 1,
});

/**
 * ForestDynamic — two rings (NEAR + MID) with optional FAR extension via BVH raycasts and instancing.
 * Publishes occluders (trees/rocks instancedMeshes) via onOccludersChange.
 */
export default function ForestDynamic({
  terrainGroup, // REQUIRED
  tileSize = 4,
  terrainLoadRadius = 2,
  exclusion = null,
  refRockRefs, // OPTIONAL: external array/refs for the rocks instancedMeshes
  onOccludersChange = () => {}, // OPTIONAL: callback(occ[]) for fog prepass, etc.
  config,
}) {
  const { camera } = useThree();
  const settings = useMemo(() => {
    if (!config) return DEFAULT_FOREST_PARAMS;
    return { ...DEFAULT_FOREST_PARAMS, ...config };
  }, [config]);

  const {
    seed,
    chunkSize,
    nearRingChunks,
    midRingChunks,
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
  const NEAR_R = Math.max(1, Math.min(nearRingChunks | 0, maxRFromTiles));
  const MID_R = Math.max(NEAR_R, Math.min(midRingChunks | 0, maxRFromTiles));
  const RENDER_EXTRA = Math.max(0, Math.floor(renderExtraChunks ?? 0));
  const RENDER_R = Math.max(
    MID_R,
    Math.min(maxRFromTiles, MID_R + RENDER_EXTRA)
  );

  // ---------------- Assets ----------------
  const highParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1.glb");
  const rockParts = useInstancedRocks("/models/rocks/MateriallessRock.glb");

  // Instanced refs
  const treeHighRefs = useRef(highParts.map(() => React.createRef()));
  // Single, conflict-free rock refs array:
  const rockRefsArray = useMemo(() => {
    // Accept either an array of refs, or a ref object whose .current is an array of refs
    const external =
      (Array.isArray(refRockRefs) && refRockRefs) ||
      (Array.isArray(refRockRefs?.current) && refRockRefs.current) ||
      null;
    return external ?? rockParts.map(() => React.createRef());
    // depend only on length so we don't regenerate refs every frame
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

  const terrainBoundsRef = useRef(null);
  const ensureTerrainBounds = useCallback(() => {
    if (!terrainGroup) return;
    try {
      terrainGroup.updateMatrixWorld?.(true);
    } catch (err) {
      // terrainGroup might be mid-disposal; ignore and retry next frame
    }
    const box = new THREE.Box3().setFromObject(terrainGroup);
    terrainBoundsRef.current = {
      minY: box.min.y,
      maxY: box.max.y,
    };
  }, [terrainGroup]);

  useEffect(() => {
    if (!terrainGroup) return;
    ensureTerrainBounds();
  }, [terrainGroup, ensureTerrainBounds]);

  useEffect(() => {
    lastCellRef.current = { cx: 1e9, cz: 1e9 };
  }, [NEAR_R, MID_R, RENDER_R]);

  // Chunk cache
  const cacheRef = useRef(new Map());
  const coldCacheRef = useRef(new Map());
  const buildQueueRef = useRef([]);
  const dropTimesRef = useRef(new Map());
  // Raycasting removed - component is not actively used (replaced by ForestDynamicSampled)
  // const raycasterRef = useRef(new THREE.Raycaster());
  // raycasterRef.current.firstHitOnly = true;

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

        // Notify DistanceFade that this mesh is ready to be patched
        emitDistanceFadeTileReady({ mesh: m, key: m.uuid });
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highParts.length, rockParts.length]);

  // ---------- PUBLISH OCCLUDERS (trees & rocks instanced meshes) ----------
  const publishOccluders = useCallback(() => {
    const occ = [];
    treeHighRefs.current.forEach((r) => r.current && occ.push(r.current));
    rockRefsArray.forEach((r) => r.current && occ.push(r.current));
    onOccludersChange?.(occ);
  }, [onOccludersChange, rockRefsArray]);

  useEffect(() => {
    publishOccluders();
    return () => onOccludersChange?.([]); // clear on unmount
  }, [publishOccluders, highParts.length, rockParts.length, onOccludersChange]);

  useEffect(() => {
    scheduleRefresh();
  }, []);

  useEffect(() => {
    scheduleRefresh();
  }, [renderMidTrees, RENDER_EXTRA]);

  useEffect(() => {
    cacheRef.current.clear();
    coldCacheRef.current.clear();
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
  ]);
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

    const viewSet = new Set();
    for (const k in next) viewSet.add(k);
    return { next, viewSet };
  };

  // Recompute when entering a new chunk
  useFrame(() => {
    if (!terrainGroup) return;

    const childrenCount = terrainGroup.children?.length ?? 0;
    if (childrenCount !== prevChildrenCountRef.current) {
      prevChildrenCountRef.current = childrenCount;
      ensureTerrainBounds();
      scheduleRefresh();
    }

    if (!terrainBoundsRef.current) {
      ensureTerrainBounds();
    }

    camXZ.current.set(camera.position.x, 0, camera.position.z);
    const [ccx, ccz] = worldToChunk(camXZ.current.x, camXZ.current.z);
    if (ccx === lastCellRef.current.cx && ccz === lastCellRef.current.cz)
      return;
    lastCellRef.current = { cx: ccx, cz: ccz };

    const { next, viewSet } = computeModes(ccx, ccz);

    // Enqueue builds (NEAR + MID only)
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

    // Update modes & schedule drop
    modesRef.current = next;
    for (const k of cacheRef.current.keys())
      if (!viewSet.has(k)) dropTimesRef.current.set(k, performance.now());

    scheduleRefresh();
  });

  // Drop chunks outside retention window after cooldown
  useFrame(() => {
    let hasModes = false;
    for (const _ in modesRef.current) { hasModes = true; break; }
    if (!hasModes) return;
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

  // Build cadence — budgeted rays (NEAR + MID only)
  useFrame(() => {
    if (!terrainGroup || !buildQueueRef.current.length) return;

    const raycaster = raycasterRef.current;
    let raysLeft = raysPerFrame;

    if (!terrainBoundsRef.current) {
      ensureTerrainBounds();
    }

    while (raysLeft > 0 && buildQueueRef.current.length) {
      const job = buildQueueRef.current.shift();
      if (cacheRef.current.has(job.key)) continue;

      const result = buildChunk(job.cx, job.cz, raysLeft, {
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
        terrainGroup,
        raycaster,
        treeBaseMinY,
        rockBottomPerPart,
        insideExclusion,
        terrainBounds: terrainBoundsRef.current,
      });

      raysLeft -= result.raysUsed;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exclusion, chunkSize]);

  // Aggregate matrices from active chunks → upload to instanced meshes
  function applyInstancing() {
    let hasAnyMode = false;
    for (const _ in modesRef.current) { hasAnyMode = true; break; }
    if (!hasAnyMode) return;

    const nearTrees = []; // always rendered
    const midTrees = []; // rendered only if renderMidTrees = true
    const farTrees = []; // outer ring
    const rocksByPart = rockParts.map(() => []);

    for (const key in modesRef.current) {
      const mode = modesRef.current[key];
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

    // Trees (HIGH LOD)
    treeHighRefs.current.forEach((ref) => {
      const m = ref.current;
      if (!m) return;
      const N = Math.min(TREE_CAP, allTrees.length);
      for (let i = 0; i < N; i++) m.setMatrixAt(i, allTrees[i]);
      m.count = N;
      m.instanceMatrix.needsUpdate = true;
    });

    // Rocks per part (near ring only)
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
    <group name="ForestDynamic">
      {/* Trees: HIGH LOD (near always; mid if toggled) */}
      {highParts.map((p, i) => (
        <instancedMesh
          key={`fd-th-${i}`}
          ref={treeHighRefs.current[i]}
          args={[p.geometry, p.material, TREE_CAP]}
          frustumCulled={false}
        />
      ))}

      {/* Rocks: near ring only */}
      {rockParts.map((p, i) => (
        <instancedMesh
          key={`fd-rk-${i}`}
          ref={rockRefsArray[i]}
          args={[p.geometry, p.material, ROCK_CAP_PER_PART]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/** --------- Chunk builder (deterministic, BVH raycasts) --------- */
function buildChunk(cx, cz, rayBudget, opts) {
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
    terrainGroup,
    raycaster,
    treeBaseMinY,
    rockBottomPerPart,
    insideExclusion,
    terrainBounds,
  } = opts;

  const rng = mulberry32(
    ((cx * 73856093) ^ (cz * 19349663) ^ (seed ^ 0x9e3779b9)) >>> 0
  );

  // Chunk world bounds
  const minX = cx * chunkSize;
  const minZ = cz * chunkSize;
  const maxX = minX + chunkSize;
  const maxZ = minZ + chunkSize;

  // Terrain top bound for ray origin (cached bounds keep placement unchanged)
  const originY = (terrainBounds?.maxY ?? 0) + 5;
  const down = new THREE.Vector3(0, -1, 0);

  // Occupancy hashes (grid cell ~ half the spacing)
  const occTrees = makeHasherLocal(Math.max(0.05, treeMinSpacing * 0.5));
  const occRocks = makeHasherLocal(Math.max(0.05, rockMinSpacing * 0.5));

  const trees = [];
  const rockByPart = rockBottomPerPart.map(() => []);

  let raysUsed = 0;

  // Trees
  {
    let placed = 0,
      attempts = 0;
    const maxAttempts = treeTargetPerChunk * 60; // denser → more tries
    const tMin = Math.max(0.001, Math.min(treeScaleMin, treeScaleMax));
    const tMax = Math.max(tMin + 1e-4, Math.max(treeScaleMin, treeScaleMax));
    const rTree = Math.max(0.05, treeMinSpacing * 0.5);

    while (
      placed < treeTargetPerChunk &&
      attempts < maxAttempts &&
      raysUsed < rayBudget
    ) {
      attempts++;

      const x = minX + rng() * (maxX - minX);
      const z = minZ + rng() * (maxZ - minZ);
      if (insideExclusion(x, z)) continue;

      const scale = tMin + rng() * (tMax - tMin); // UNIFORM in [tMin..tMax]
      if (!occTrees.canPlace(x, z, rTree)) continue;

      const origin = new THREE.Vector3(x, originY, z);
      raycaster.set(origin, down);
      const hit = raycaster.intersectObject(terrainGroup, true)[0] || null;
      raysUsed++;
      if (!hit) continue;

      const terrainY = hit.point.y;
      const bottomAlign = -treeBaseMinY * scale;
      const sink = 0.02; // dig slightly
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
      placed++;
    }
  }

  // Rocks
  {
    let placed = 0,
      attempts = 0;
    const maxAttempts = rockTargetPerChunk * 60;
    const rMin = Math.max(0.02, Math.min(rockScaleMin, rockScaleMax));
    const rMax = Math.max(rMin + 1e-4, Math.max(rockScaleMin, rockScaleMax));
    const rRock = Math.max(0.03, rockMinSpacing * 0.5);

    while (
      placed < rockTargetPerChunk &&
      attempts < maxAttempts &&
      raysUsed < rayBudget
    ) {
      attempts++;

      const x = minX + rng() * (maxX - minX);
      const z = minZ + rng() * (maxZ - minZ);
      if (insideExclusion(x, z)) continue;

      const scale = rMin + rng() * (rMax - rMin); // UNIFORM in [rMin..rMax]
      if (!occRocks.canPlace(x, z, rRock)) continue;

      const origin = new THREE.Vector3(x, originY, z);
      raycaster.set(origin, down);
      const hit = raycaster.intersectObject(terrainGroup, true)[0] || null;
      raysUsed++;
      if (!hit) continue;

      const terrainY = hit.point.y;
      const pick = Math.floor(rng() * Math.max(1, rockBottomPerPart.length));

      let y = terrainY;
      const bottomAlign = (rockBottomPerPart[pick] || 0) * scale;
      const sink = 0.4 * scale; // “dig rocks in” proportional to size
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
      placed++;
    }
  }

  return { treeMatrices: trees, rockMatricesByPart: rockByPart, raysUsed };
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
          const dx = x - it.x,
            dz = z - it.z;
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
