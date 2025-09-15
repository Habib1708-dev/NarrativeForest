// src/components/ForestDynamic.jsx
import React, {
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useState,
} from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";
import { useInstancedRocks } from "../hooks/InstancedRocks";

/**
 * ForestDynamic — two rings (NEAR + MID) with BVH raycasts and instancing.
 * Publishes occluders (trees/rocks instancedMeshes) via onOccludersChange.
 */
export default function ForestDynamic({
  terrainGroup, // REQUIRED
  tileSize = 4,
  terrainLoadRadius = 2,
  exclusion = null,
  refRockRefs, // OPTIONAL: external array/refs for the rocks instancedMeshes
  onOccludersChange = () => {}, // OPTIONAL: callback(occ[]) for fog prepass, etc.
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

  // ---------------- Assets ----------------
  const highParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1.glb");
  const rockParts = useInstancedRocks("/models/cabin/MateriallessRock.glb");

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
  const [, setModes] = useState({});
  const lastCellRef = useRef({ cx: 1e9, cz: 1e9 });
  const camXZ = useRef(new THREE.Vector3());

  // Chunk cache
  const cacheRef = useRef(new Map());
  const buildQueueRef = useRef([]);
  const dropTimesRef = useRef(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());
  raycasterRef.current.firstHitOnly = true;

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
    for (const [x, z] of neighborhood(cx, cz, NEAR_R))
      next[chunkKey(x, z)] = "high";
    for (const [x, z] of neighborhood(cx, cz, MID_R))
      next[chunkKey(x, z)] ??= "med";
    const viewSet = new Set(Object.keys(next)); // near+mid only
    return { next, viewSet };
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

    // Enqueue builds (NEAR + MID only)
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
      if (!viewSet.has(k)) dropTimesRef.current.set(k, performance.now());

    // Reflect new rings immediately
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

  // Build cadence — budgeted rays (NEAR + MID only)
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
        if (cacheRef.current.has(key)) {
          cacheRef.current.delete(key);
          // If currently in view, enqueue rebuild
          if (modesRef.current[key]) {
            buildQueueRef.current.push({ key, cx, cz, enqueuedAt: now });
          }
        }
      }
    }
    refreshInstancing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exclusion, chunkSize]);

  // Aggregate matrices from active chunks → upload to instanced meshes
  const refreshInstancing = () => {
    if (!Object.keys(modesRef.current).length) return;

    const nearTrees = []; // always rendered
    const midTrees = []; // rendered only if renderMidTrees = true
    const rocksByPart = rockParts.map(() => []);

    for (const [key, mode] of Object.entries(modesRef.current)) {
      const rec = cacheRef.current.get(key);
      if (!rec) continue;

      if (mode === "high") {
        nearTrees.push(...rec.trees);
        rec.rocksByPart.forEach((arr, i) => rocksByPart[i].push(...arr)); // rocks near only
      } else if (mode === "med") {
        midTrees.push(...rec.trees);
      }
    }

    const allTrees = renderMidTrees ? nearTrees.concat(midTrees) : nearTrees;

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
  };

  if (!highParts.length || !rockParts.length) return null;

  return (
    <group name="ForestDynamic">
      {/* Trees: HIGH LOD (near always; mid if toggled) */}
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

      {/* Rocks: near ring only */}
      {rockParts.map((p, i) => (
        <instancedMesh
          key={`fd-rk-${i}`}
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
