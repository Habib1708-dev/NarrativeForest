// src/components/ForestDynamic.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";
import { useInstancedRocks } from "../hooks/InstancedRocks";

/**
 * ForestDynamic — camera-centric, size-less forest:
 * - Moving window in chunk space (aligned with DistanceFade), no global size.
 * - BVH-accelerated downward raycasts vs TerrainTiled group (recursive=true).
 * - Deterministic per-chunk RNG for reproducible revisits.
 * - Poisson-ish spacing using a light occupancy grid.
 * - Sinks trees/rocks into ground like your original Forest.jsx.
 * - Instanced meshes: high LOD near, low LOD mid; rocks near only.
 */

export default function ForestDynamic({
  terrainGroup, // REQUIRED: Group from TerrainTiled (raycast target)
  fadeDistStart = 6, // should match DistanceFade
  fadeDistEnd = 9, // should match DistanceFade
  tileSize = 4, // TerrainTiled tile size
  terrainLoadRadius = 2, // TerrainTiled.loadRadius
  exclusion = null, // {centerX, centerZ, width, depth} or null
}) {
  const { camera } = useThree();

  // ---------------- Controls ----------------
  const {
    seed,
    chunkSize,
    marginBeyondFade,
    useFadeDerived,
    forestHalfOverride,
    nearRingExtra,
    midRingExtra,
    raysPerFrame,
    retentionSeconds,
    prefetchAheadChunks,

    // Dense scatter controls
    treeMinSpacing,
    rockMinSpacing,
    treeTargetPerChunk,
    rockTargetPerChunk,
    rockScaleMin,
    rockScaleMax,

    // Optional tint
    treeTint,
    treeTintIntensity,
    rockTint,
    rockTintIntensity,
  } = useControls("Forest (Dynamic)", {
    seed: { value: 6, min: 0, max: 2 ** 31 - 1, step: 1 },
    chunkSize: { value: 3, min: 2, max: 8, step: 1 }, // <<< 3 m chunks
    marginBeyondFade: { value: 2.0, min: 0, max: 6, step: 0.1 },
    useFadeDerived: { value: true },
    forestHalfOverride: { value: 9, min: 4, max: 20, step: 0.1 },
    nearRingExtra: { value: 0, min: 0, max: 2, step: 1 },
    midRingExtra: { value: 0, min: -2, max: 2, step: 1 },
    raysPerFrame: { value: 150, min: 5, max: 400, step: 5 }, // <<< fills fast
    retentionSeconds: { value: 2.0, min: 0.5, max: 10, step: 0.5 },
    prefetchAheadChunks: { value: 1, min: 0, max: 3, step: 1 },

    // Dense & predictable
    treeMinSpacing: {
      value: 0.7,
      min: 0.3,
      max: 2.0,
      step: 0.05,
      label: "Tree min spacing (m)",
    },
    rockMinSpacing: {
      value: 0.35,
      min: 0.15,
      max: 1.5,
      step: 0.05,
      label: "Rock min spacing (m)",
    },
    treeTargetPerChunk: { value: 14, min: 2, max: 60, step: 1 },
    rockTargetPerChunk: { value: 12, min: 0, max: 60, step: 1 },
    rockScaleMin: { value: 0.03, min: 0.02, max: 0.2, step: 0.005 },
    rockScaleMax: { value: 0.12, min: 0.03, max: 0.3, step: 0.005 },

    treeTint: { value: "#000000" },
    treeTintIntensity: { value: 0.0, min: 0, max: 1, step: 0.01 },
    rockTint: { value: "#444444" },
    rockTintIntensity: { value: 1.0, min: 0, max: 1, step: 0.01 },
  });

  // Clamp the forest window so it never outruns terrain tiles
  const tileHalfExtent = useMemo(
    () => (terrainLoadRadius + 0.5) * tileSize,
    [terrainLoadRadius, tileSize]
  );

  const forestHalf = useMemo(() => {
    if (!useFadeDerived)
      return Math.min(forestHalfOverride, tileHalfExtent - 1.0);
    const target = fadeDistEnd + marginBeyondFade;
    return Math.max(2, Math.min(target, tileHalfExtent - 1.0));
  }, [
    useFadeDerived,
    forestHalfOverride,
    fadeDistEnd,
    marginBeyondFade,
    tileHalfExtent,
  ]);

  // Chunk radii
  const nearRChunks = Math.max(
    1,
    Math.floor(fadeDistStart / chunkSize) + nearRingExtra
  );
  const midRChunksRaw = Math.max(
    nearRChunks + 1,
    Math.floor((fadeDistEnd + marginBeyondFade) / chunkSize) + midRingExtra
  );
  const maxRFromTiles = Math.max(
    1,
    Math.floor((tileHalfExtent - 0.5) / chunkSize)
  ); // safety clamp
  const midRChunks = Math.min(midRChunksRaw, maxRFromTiles);
  const viewRChunks = Math.max(
    midRChunks + 1,
    Math.floor(forestHalf / chunkSize) + 1
  );

  // ---------------- Assets ----------------
  const highParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1.glb");
  const lowParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1_LOD.glb");
  const rockParts = useInstancedRocks("/models/rocks/MossRock.glb");

  // Optional tints
  useEffect(() => {
    const tintC = new THREE.Color(treeTint);
    const tint = (parts) => {
      parts.forEach((p) => {
        const m = p.material;
        if (!m || !m.color) return;
        if (!m.userData._origColor) m.userData._origColor = m.color.clone();
        m.color.copy(m.userData._origColor).lerp(tintC, treeTintIntensity);
        if (typeof m.metalness === "number") m.metalness = 0.0;
        if (typeof m.roughness === "number")
          m.roughness = Math.min(1, Math.max(0.8, m.roughness ?? 1));
        m.needsUpdate = true;
      });
    };
    if (highParts.length) tint(highParts);
    if (lowParts.length) tint(lowParts);
  }, [highParts, lowParts, treeTint, treeTintIntensity]);

  useEffect(() => {
    const tintC = new THREE.Color(rockTint);
    rockParts.forEach((p) => {
      const m = p.material;
      if (!m || !m.color) return;
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
    const parts = highParts.length ? highParts : lowParts;
    let minY = 0;
    for (const p of parts) {
      const bb = p.geometry.boundingBox;
      if (bb) minY = Math.min(minY, bb.min.y);
    }
    return minY;
  }, [highParts, lowParts]);

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

  // ---------------- Chunk windows & modes ----------------
  const modesRef = useRef({});
  const [modes, setModes] = useState({});
  const lastCellRef = useRef({ cx: 1e9, cz: 1e9 });
  const camXZ = useRef(new THREE.Vector3());

  // Chunk cache: key -> {trees:[Matrix4], rocksByPart:[Matrix4[]], built:true}
  const cacheRef = useRef(new Map());
  const buildQueueRef = useRef([]);
  const dropTimesRef = useRef(new Map()); // key -> timestamp
  const raycasterRef = useRef(new THREE.Raycaster());
  raycasterRef.current.firstHitOnly = true;

  // Instancing refs
  const treeHighRefs = useRef(highParts.map(() => React.createRef()));
  const treeLowRefs = useRef(lowParts.map(() => React.createRef()));
  const rockRefs = useRef(rockParts.map(() => React.createRef()));

  // Capacities
  const TREE_CAP = 2000; // allow denser totals
  const ROCK_CAP_PER_PART = 1200;

  // One-time mesh init
  useEffect(() => {
    [treeHighRefs.current, treeLowRefs.current, rockRefs.current].forEach(
      (arr) =>
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
  }, [highParts, lowParts, rockParts]);

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

  const forwardPrefetch = (cx, cz, RView, ahead, dirX, dirZ) => {
    const out = [];
    const fx = Math.abs(dirX) >= Math.abs(dirZ) ? Math.sign(dirX) : 0;
    const fz = Math.abs(dirZ) > Math.abs(dirX) ? Math.sign(dirZ) : 0;
    if (fx !== 0) {
      for (let dz = -RView; dz <= RView; dz++)
        for (let k = 1; k <= ahead; k++)
          out.push([cx + (RView + k) * fx, cz + dz]);
    }
    if (fz !== 0) {
      for (let dx = -RView; dx <= RView; dx++)
        for (let k = 1; k <= ahead; k++)
          out.push([cx + dx, cz + (RView + k) * fz]);
    }
    return out;
  };

  const computeModes = (cx, cz) => {
    const next = {};
    for (const [x, z] of neighborhood(cx, cz, nearRChunks))
      next[chunkKey(x, z)] = "high";
    for (const [x, z] of neighborhood(cx, cz, midRChunks))
      next[chunkKey(x, z)] ??= "med";
    for (const [x, z] of neighborhood(cx, cz, viewRChunks))
      next[chunkKey(x, z)] ??= "off";
    return { next, viewSet: new Set(Object.keys(next)) };
  };

  // Recompute when entering a new chunk
  useFrame(() => {
    if (!terrainGroup) return;

    camXZ.current.set(camera.position.x, 0, camera.position.z);
    const [ccx, ccz] = worldToChunk(camXZ.current.x, camXZ.current.z);

    if (ccx === lastCellRef.current.cx && ccz === lastCellRef.current.cz)
      return;
    lastCellRef.current = { cx: ccx, cz: ccz };

    const { next, viewSet } = computeModes(ccx, ccz);

    // Prefetch forward
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() > 0) dir.normalize();
    const ahead = forwardPrefetch(
      ccx,
      ccz,
      viewRChunks,
      prefetchAheadChunks,
      dir.x,
      dir.z
    );
    for (const [ax, az] of ahead) {
      const k = chunkKey(ax, az);
      if (!(k in next)) next[k] = "off";
      viewSet.add(k);
    }

    // Enqueue builds
    const now = performance.now();
    for (const k of viewSet) {
      if (!cacheRef.current.has(k)) {
        const [x, z] = k.split(",").map((n) => parseInt(n, 10));
        buildQueueRef.current.push({ key: k, cx: x, cz: z, enqueuedAt: now });
      }
      dropTimesRef.current.delete(k);
    }

    // Update modes & schedule drop
    modesRef.current = next;
    setModes(next);
    for (const k of cacheRef.current.keys())
      if (!viewSet.has(k)) dropTimesRef.current.set(k, now);

    // Immediately flip instancing counts to reflect new LOD rings
    refreshInstancing();
  });

  // Drop chunks outside retention window after cooldown
  useFrame(() => {
    if (!Object.keys(modesRef.current).length) return;
    const now = performance.now();
    const cooldown = retentionSeconds * 1000;
    dropTimesRef.current.forEach((t0, key) => {
      if (now - t0 >= cooldown) {
        cacheRef.current.delete(key);
        dropTimesRef.current.delete(key);
      }
    });
  });

  // Build cadence — budgeted rays
  useFrame(() => {
    if (!terrainGroup || !buildQueueRef.current.length) return;

    const raycaster = raycasterRef.current;
    let raysLeft = raysPerFrame;

    while (raysLeft > 0 && buildQueueRef.current.length) {
      const job = buildQueueRef.current.shift();
      if (cacheRef.current.has(job.key)) continue;

      const result = buildChunk(job.cx, job.cz, raysLeft, {
        chunkSize,
        treeMinSpacing,
        rockMinSpacing,
        treeTargetPerChunk,
        rockTargetPerChunk,
        rockScaleMin,
        rockScaleMax,
        seed,
        terrainGroup,
        raycaster,
        treeBaseMinY,
        rockBottomPerPart,
        insideExclusion,
      });

      raysLeft -= result.raysUsed;

      cacheRef.current.set(job.key, {
        trees: result.treeMatrices,
        rocksByPart: result.rockMatricesByPart,
        built: true,
      });
    }

    refreshInstancing();
  });

  // Aggregate matrices from active chunks → upload to instanced meshes
  const refreshInstancing = () => {
    if (!Object.keys(modesRef.current).length) return;

    const highTrees = [];
    const medTrees = [];
    const rocksByPart = rockParts.map(() => []);

    for (const [key, mode] of Object.entries(modesRef.current)) {
      const rec = cacheRef.current.get(key);
      if (!rec) continue;
      if (mode === "high") {
        highTrees.push(...rec.trees);
        rec.rocksByPart.forEach((arr, i) => rocksByPart[i].push(...arr));
      } else if (mode === "med") {
        medTrees.push(...rec.trees);
      }
    }

    // Trees high
    treeHighRefs.current.forEach((ref) => {
      const m = ref.current;
      if (!m) return;
      const N = Math.min(TREE_CAP, highTrees.length);
      for (let i = 0; i < N; i++) m.setMatrixAt(i, highTrees[i]);
      m.count = N;
      m.instanceMatrix.needsUpdate = true;
    });

    // Trees low
    treeLowRefs.current.forEach((ref) => {
      const m = ref.current;
      if (!m) return;
      const N = Math.min(TREE_CAP, medTrees.length);
      for (let i = 0; i < N; i++) m.setMatrixAt(i, medTrees[i]);
      m.count = N;
      m.instanceMatrix.needsUpdate = true;
    });

    // Rocks per part
    rockRefs.current.forEach((ref, iPart) => {
      const m = ref.current;
      if (!m) return;
      const mats = rocksByPart[iPart] || [];
      const N = Math.min(ROCK_CAP_PER_PART, mats.length);
      for (let i = 0; i < N; i++) m.setMatrixAt(i, mats[i]);
      m.count = N;
      m.instanceMatrix.needsUpdate = true;
    });
  };

  if (!highParts.length || !lowParts.length || !rockParts.length) return null;

  return (
    <group name="ForestDynamic">
      {/* Trees: High LOD */}
      {highParts.map((p, i) => (
        <instancedMesh
          key={`fd-th-${i}`}
          ref={treeHighRefs.current[i]}
          args={[p.geometry, p.material, TREE_CAP]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}

      {/* Trees: Low LOD */}
      {lowParts.map((p, i) => (
        <instancedMesh
          key={`fd-tm-${i}`}
          ref={treeLowRefs.current[i]}
          args={[p.geometry, p.material, TREE_CAP]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}

      {/* Rocks */}
      {rockParts.map((p, i) => (
        <instancedMesh
          key={`fd-rk-${i}`}
          ref={rockRefs.current[i]}
          args={[p.geometry, p.material, ROCK_CAP_PER_PART]}
          castShadow={false}
          receiveShadow
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
    rockScaleMin,
    rockScaleMax,
    seed,
    terrainGroup,
    raycaster,
    treeBaseMinY,
    rockBottomPerPart,
    insideExclusion,
  } = opts;

  const rng = mulberry32(
    ((cx * 73856093) ^ (cz * 19349663) ^ (seed ^ 0x9e3779b9)) >>> 0
  );

  // Chunk world bounds
  const minX = cx * chunkSize;
  const minZ = cz * chunkSize;
  const maxX = minX + chunkSize;
  const maxZ = minZ + chunkSize;

  // Terrain top bound for ray origin
  const bb = new THREE.Box3().setFromObject(terrainGroup);
  const originY = (bb.max.y || 0) + 5;
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
    const sMin = 0.02,
      sMax = 0.037;
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

      const scale = sMin + rng() * (sMax - sMin);
      if (!occTrees.canPlace(x, z, rTree)) continue;

      const origin = new THREE.Vector3(x, originY, z);
      raycaster.set(origin, down);
      const hit = raycaster.intersectObject(terrainGroup, true)[0] || null;
      raysUsed++;
      if (!hit) continue;

      const terrainY = hit.point.y;
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
      placed++;
    }
  }

  // Rocks
  {
    let placed = 0,
      attempts = 0;
    const maxAttempts = rockTargetPerChunk * 60;
    const sMin = Math.max(0.02, Math.min(rockScaleMin, rockScaleMax));
    const sMax = Math.max(rockScaleMin, rockScaleMax);
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

      const scale = sMin + rng() * (sMax - sMin);
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
      const sink = 0.4 * scale; // "dig" rocks
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
