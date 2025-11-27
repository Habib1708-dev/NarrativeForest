import React, { useMemo, useEffect, useRef, useState, forwardRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useInstancedTree } from "../hooks/InstancedTree";
import { useInstancedRocks } from "../hooks/InstancedRocks";

const DEFAULT_FOREST_SETTINGS = Object.freeze({
  size: 20,
  seed: 6,
  treeCount: 900,
  chunkSize: 5,
  nearRadius: 1.2,
  midRadius: 2,
  viewRadius: 5,
  plantRadius: 12,
  exclusion: Object.freeze({
    centerX: -1.4,
    centerZ: -2.7,
    width: 1.1,
    depth: 1.1,
  }),
  treeTintColor: "#000000ff",
  treeTintIntensity: 1,
  rockCount: 1000,
  rockScaleMin: 3.0,
  rockScaleMax: 4.0,
  rockTintColor: "#444444",
  rockTintIntensity: 1,
});

const Forest = forwardRef(function Forest({ terrainMesh, config }, ref) {
  const settings = useMemo(() => {
    if (!config) return DEFAULT_FOREST_SETTINGS;
    const merged = {
      ...DEFAULT_FOREST_SETTINGS,
      ...config,
      exclusion: {
        ...DEFAULT_FOREST_SETTINGS.exclusion,
        ...(config?.exclusion || {}),
      },
    };
    return merged;
  }, [config]);

  const {
    size,
    seed,
    treeCount,
    chunkSize,
    nearRadius,
    midRadius,
    viewRadius,
    plantRadius,
    exclusion,
    treeTintColor,
    treeTintIntensity,
    rockCount,
    rockScaleMin,
    rockScaleMax,
    rockTintColor,
    rockTintIntensity,
  } = settings;

  const {
    centerX: exCenterX,
    centerZ: exCenterZ,
    width: exWidth,
    depth: exDepth,
  } = exclusion;

  // ---------------------------
  // Assets
  // ---------------------------
  const highParts = useInstancedTree("/models/tree/Spruce1LOD.glb");
  const lowParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1_LOD.glb");
  const rockParts = useInstancedRocks("/models/rocks/MossRock.glb");

  // ---------------------------
  // Materials tint
  // ---------------------------
  useEffect(() => {
    const target = new THREE.Color(treeTintColor);
    const tint = (parts) => {
      parts.forEach((p) => {
        const m = p.material;
        if (!m || !m.color) return;
        if (!m.userData._origColor) m.userData._origColor = m.color.clone();
        m.color.copy(m.userData._origColor).lerp(target, treeTintIntensity);
        if (typeof m.metalness === "number") m.metalness = 0.0;
        if (typeof m.roughness === "number")
          m.roughness = Math.min(1, Math.max(0.8, m.roughness));
        m.needsUpdate = true;
      });
    };
    if (highParts.length) tint(highParts);
    if (lowParts.length) tint(lowParts);
  }, [highParts, lowParts, treeTintColor, treeTintIntensity]);

  useEffect(() => {
    const target = new THREE.Color(rockTintColor);
    rockParts.forEach((p) => {
      const m = p.material;
      if (!m || !m.color) return;
      if (!m.userData._origColor) m.userData._origColor = m.color.clone();
      m.color.copy(m.userData._origColor).lerp(target, rockTintIntensity);
      if (typeof m.metalness === "number") m.metalness = 0.0;
      if (typeof m.roughness === "number")
        m.roughness = Math.max(0.6, Math.min(1.0, m.roughness ?? 1.0));
      m.needsUpdate = true;
    });
  }, [rockParts, rockTintColor, rockTintIntensity]);

  // ---------------------------
  // Helpers
  // ---------------------------
  const RNG_A = 0x9e3779b9;
  const treeRng = useMemo(() => mulberry32((seed ^ RNG_A) >>> 0), [seed]);
  const rockRng = useMemo(() => mulberry32((seed ^ (RNG_A * 2)) >>> 0), [seed]);

  const insideExclusion = (x, z) =>
    Math.abs(x - exCenterX) <= exWidth * 0.5 &&
    Math.abs(z - exCenterZ) <= exDepth * 0.5;

  const makeHasher = (cellSize) => {
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
  };

  const treeBaseMinY = useMemo(() => {
    const parts = highParts.length ? highParts : lowParts;
    let minY = 0;
    for (const p of parts) {
      const bb = p.geometry.boundingBox;
      if (bb) minY = Math.min(minY, bb.min.y);
    }
    return minY;
  }, [highParts, lowParts]);

  // ---------------------------
  // Trees
  // ---------------------------
  const treeTransforms = useMemo(() => {
    if (!terrainMesh) return [];
    terrainMesh.updateMatrixWorld(true);

    const effSize = terrainMesh.getTerrainSize?.() ?? size;
    const R = Math.min(plantRadius * 1.15, effSize * 0.5 - 0.001);

    const arr = [];
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const origin = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);

    const bbox = new THREE.Box3().setFromObject(terrainMesh);
    const originY = bbox.max.y + 5;
    const rayFar = Math.max(10, bbox.max.y - bbox.min.y + 20);

    const index = makeHasher(0.25);

    let radiusPerScale = 30.0;
    let placed = 0,
      attempts = 0;
    const maxAttempts = treeCount * 30;
    let relaxes = 0;

    while (placed < treeCount && attempts < maxAttempts) {
      attempts++;

      const r = Math.sqrt(treeRng()) * R;
      const theta = treeRng() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      if (insideExclusion(x, z)) continue;

      const sMin = 0.02,
        sMax = 0.037;
      const scale = sMin + treeRng() * (sMax - sMin);
      const footprint = radiusPerScale * scale;

      if (!index.canPlace(x, z, footprint)) continue;

      origin.set(x, originY, z);
      ray.set(origin, down);
      ray.near = 0;
      ray.far = rayFar;

      const hit = ray.intersectObject(terrainMesh, false)[0] || null;
      if (!hit) continue;

      const terrainY = hit.point.y;
      const bottomAlign = -treeBaseMinY * scale;
      const sink = 0.02;
      const adjustedY = terrainY - bottomAlign - sink;

      arr.push({
        position: [x, adjustedY, z],
        rotation: treeRng() * Math.PI * 2,
        scale,
      });

      index.add(x, z, footprint);
      placed++;

      if (
        attempts % (treeCount * 4) === 0 &&
        placed < (attempts / (treeCount * 4)) * (treeCount * 0.6) &&
        relaxes < 3
      ) {
        radiusPerScale *= 0.9;
        relaxes++;
      }
    }

    if (attempts >= maxAttempts && placed < treeCount) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[Forest] Tree placement saturated: ${placed}/${treeCount}.`
        );
      }
    }
    return arr;
  }, [
    terrainMesh,
    seed,
    size,
    treeCount,
    plantRadius,
    treeBaseMinY,
    treeRng,
    exCenterX,
    exCenterZ,
    exWidth,
    exDepth,
  ]);

  // ---------------------------
  // Rocks
  // ---------------------------
  const rockTransforms = useMemo(() => {
    if (!terrainMesh || !rockParts.length) return [];
    terrainMesh.updateMatrixWorld(true);

    const effSize = terrainMesh.getTerrainSize?.() ?? size;
    const R = Math.min(plantRadius, effSize * 0.5 - 0.001);

    const arr = [];
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const origin = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);

    const bbox = new THREE.Box3().setFromObject(terrainMesh);
    const originY = bbox.max.y + 5;
    const rayFar = Math.max(10, bbox.max.y - bbox.min.y + 20);

    const index = makeHasher(0.2);
    const TREE_RADIUS = 0.18;
    for (const t of treeTransforms)
      index.add(t.position[0], t.position[2], TREE_RADIUS);

    const bottomByPart = rockParts.map((rp) => {
      const bb = rp.geometry.boundingBox || null;
      return bb ? -bb.min.y : 0;
    });

    const RANGE_MIN = 0.03,
      RANGE_MAX = 0.11;
    const sMinRaw = Math.min(rockScaleMin, rockScaleMax);
    const sMaxRaw = Math.max(rockScaleMin, rockScaleMax);
    const sMin = Math.max(RANGE_MIN, Math.min(sMinRaw, RANGE_MAX));
    const sMax = Math.max(RANGE_MIN, Math.min(sMaxRaw, RANGE_MAX));

    let placed = 0,
      attempts = 0;
    const maxAttempts = rockCount * 30;

    while (placed < rockCount && attempts < maxAttempts) {
      attempts++;

      const r = Math.sqrt(rockRng()) * R;
      const theta = rockRng() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      if (insideExclusion(x, z)) continue;

      const scale = sMin + rockRng() * (sMax - sMin);
      const ROCK_RADIUS = 0.12 * (scale / Math.max(0.001, sMax));

      if (!index.canPlace(x, z, ROCK_RADIUS)) continue;

      origin.set(x, originY, z);
      ray.set(origin, down);
      ray.near = 0;
      ray.far = rayFar;

      const hit = ray.intersectObject(terrainMesh, false)[0] || null;
      if (!hit) continue;

      const pick = Math.floor(rockRng() * Math.max(1, rockParts.length));

      let y = hit.point.y;
      const bottomAlign = (bottomByPart[pick] || 0) * scale;
      const sink = 0.4 * scale;
      y += bottomAlign - sink;

      const rotX = (rockRng() - 0.5) * 0.2;
      const rotY = rockRng() * Math.PI * 2;

      arr.push({ position: [x, y, z], rotation: [rotX, rotY], scale, pick });
      index.add(x, z, ROCK_RADIUS);
      placed++;
    }

    if (attempts >= maxAttempts && placed < rockCount) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[Forest] Rock placement saturated: ${placed}/${rockCount}.`
        );
      }
    }

    return arr;
  }, [
    terrainMesh,
    rockParts,
    size,
    plantRadius,
    rockCount,
    rockScaleMin,
    rockScaleMax,
    treeTransforms,
    rockRng,
    exCenterX,
    exCenterZ,
    exWidth,
    exDepth,
  ]);

  // ---------------------------
  // Chunking & LOD
  // ---------------------------
  const chunks = useMemo(() => {
    if (!terrainMesh) return [];
    const effSize = terrainMesh.getTerrainSize?.() ?? size;

    const map = new Map();
    const bucket = (x, z) => {
      const cx = Math.floor((x + effSize / 2) / chunkSize);
      const cz = Math.floor((z + effSize / 2) / chunkSize);
      const key = `${cx},${cz}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          cx,
          cz,
          treeTransforms: [],
          rockTransforms: [],
          center: new THREE.Vector3(
            cx * chunkSize - effSize / 2 + chunkSize / 2,
            0,
            cz * chunkSize - effSize / 2 + chunkSize / 2
          ),
        });
      }
      return map.get(key);
    };

    for (const t of treeTransforms) {
      const [x, , z] = t.position;
      bucket(x, z).treeTransforms.push(t);
    }
    for (const r of rockTransforms) {
      const [x, , z] = r.position;
      bucket(x, z).rockTransforms.push(r);
    }

    return Array.from(map.values());
  }, [terrainMesh, size, chunkSize, treeTransforms, rockTransforms]);

  const { camera } = useThree();
  const [chunkModes, setChunkModes] = useState({});
  const modesRef = useRef(chunkModes);
  const lastCam = useRef(new THREE.Vector3(1e9, 0, 1e9));
  const lastCellRef = useRef({ cx: 1e9, cz: 1e9 });
  const camXZ = useRef(new THREE.Vector3());
  const moveThreshold = Math.max(0.5, chunkSize * 0.5);

  useEffect(() => {
    modesRef.current = chunkModes;
  }, [chunkModes]);

  const computeChunkModes = (chunksArr, cam) => {
    const rNear = Math.max(0.01, nearRadius);
    const rMid = Math.max(rNear + 0.001, midRadius);
    const rView = Math.max(rMid + 0.001, viewRadius);

    const halfDiag = Math.SQRT2 * (chunkSize / 2);
    const nearWorld = rNear * chunkSize;
    const midWorld = rMid * chunkSize;
    const viewWorld = rView * chunkSize;

    const next = {};
    for (const c of chunksArr) {
      const dist = c.center.distanceTo(cam);
      if (dist > viewWorld + halfDiag) next[c.key] = "off";
      else if (dist <= nearWorld + halfDiag) next[c.key] = "high";
      else if (dist <= midWorld + halfDiag) next[c.key] = "med";
      else next[c.key] = "off";
    }
    return next;
  };

  const shallowDifferent = (a, b) => {
    const ak = Object.keys(a || {});
    const bk = Object.keys(b || {});
    if (ak.length !== bk.length) return true;
    for (const k of ak) if (a[k] !== b[k]) return true;
    return false;
  };

  // Initialize modes when chunks/knobs change (NOT on camera move)
  useEffect(() => {
    if (!chunks.length) return;

    const effSize = terrainMesh?.getTerrainSize?.() ?? size;
    const cam = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    const next = computeChunkModes(chunks, cam);

    if (shallowDifferent(modesRef.current, next)) {
      setChunkModes(next);
      modesRef.current = next;
    }

    lastCam.current.copy(cam);
    lastCellRef.current = {
      cx: Math.floor((cam.x + effSize * 0.5) / chunkSize),
      cz: Math.floor((cam.z + effSize * 0.5) / chunkSize),
    };
    // IMPORTANT: do NOT depend on camera.position.* here
  }, [chunks, chunkSize, nearRadius, midRadius, viewRadius, terrainMesh, size, camera]);

  // Recompute on cell changes or sufficient distance
  useFrame(() => {
    if (!chunks.length) return;

    const effSize = terrainMesh?.getTerrainSize?.() ?? size;
    camXZ.current.set(camera.position.x, 0, camera.position.z);

    const cx = Math.floor((camXZ.current.x + effSize * 0.5) / chunkSize);
    const cz = Math.floor((camXZ.current.z + effSize * 0.5) / chunkSize);

    if (cx !== lastCellRef.current.cx || cz !== lastCellRef.current.cz) {
      lastCellRef.current = { cx, cz };
      const next = computeChunkModes(chunks, camXZ.current);
      if (shallowDifferent(modesRef.current, next)) {
        setChunkModes(next);
        modesRef.current = next;
      }
      lastCam.current.copy(camXZ.current);
      return;
    }

    const dx = camXZ.current.x - lastCam.current.x;
    const dz = camXZ.current.z - lastCam.current.z;
    if (dx * dx + dz * dz >= moveThreshold * moveThreshold) {
      lastCam.current.copy(camXZ.current);
      const next = computeChunkModes(chunks, camXZ.current);
      if (shallowDifferent(modesRef.current, next)) {
        setChunkModes(next);
        modesRef.current = next;
      }
    }
  });

  if (!highParts.length || !lowParts.length || !rockParts.length) return null;

  return (
    <group ref={ref}>
      {chunks.map((chunk) => (
        <ChunkInstanced
          key={chunk.key}
          mode={chunkModes[chunk.key] ?? "off"}
          treeTransforms={chunk.treeTransforms}
          treeHighParts={highParts}
          treeMedParts={lowParts}
          rockTransforms={chunk.rockTransforms}
          rockParts={rockParts}
        />
      ))}
    </group>
  );
});

export default Forest;

// ---------------------------
// Child component
// ---------------------------
function ChunkInstanced({
  mode,
  treeTransforms,
  treeHighParts,
  treeMedParts,
  rockTransforms,
  rockParts,
}) {
  const treeCapacity = treeTransforms.length;

  const treeHighRefs = useRef(treeHighParts.map(() => React.createRef()));
  const treeMedRefs = useRef(treeMedParts.map(() => React.createRef()));
  const rockRefs = useRef(rockParts.map(() => React.createRef()));

  const treeMatrices = useMemo(() => {
    const list = new Array(treeTransforms.length);
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < treeTransforms.length; i++) {
      const t = treeTransforms[i];
      p.fromArray(t.position);
      q.setFromEuler(new THREE.Euler(0, t.rotation, 0));
      s.setScalar(t.scale);
      list[i] = m4.clone().compose(p, q, s);
    }
    return list;
  }, [treeTransforms]);

  const rockMatricesByPart = useMemo(() => {
    const lists = rockParts.map(() => []);
    if (!rockTransforms.length || !rockParts.length) return lists;
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    for (let i = 0; i < rockTransforms.length; i++) {
      const t = rockTransforms[i];
      const partIndex = Math.max(
        0,
        Math.min(rockParts.length - 1, t.pick || 0)
      );
      p.fromArray(t.position);
      const rx = t.rotation[0],
        ry = t.rotation[1];
      q.setFromEuler(new THREE.Euler(rx, ry, 0));
      s.set(t.scale, t.scale, t.scale);
      lists[partIndex].push(m4.clone().compose(p, q, s));
    }
    return lists;
  }, [rockTransforms, rockParts]);

  // Upload matrices once
  useEffect(() => {
    [treeHighRefs.current, treeMedRefs.current, rockRefs.current].forEach(
      (arr) =>
        arr.forEach((r) => {
          const mesh = r.current;
          if (!mesh) return;
          mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          mesh.matrixAutoUpdate = false;
          mesh.frustumCulled = false;
        })
    );

    // Trees high
    treeHighRefs.current.forEach((r) => {
      const mesh = r.current;
      if (!mesh) return;
      for (let i = 0; i < treeMatrices.length; i++)
        mesh.setMatrixAt(i, treeMatrices[i]);
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    });

    // Trees low/med
    treeMedRefs.current.forEach((r) => {
      const mesh = r.current;
      if (!mesh) return;
      for (let i = 0; i < treeMatrices.length; i++)
        mesh.setMatrixAt(i, treeMatrices[i]);
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    });

    // Rocks (per part)
    rockRefs.current.forEach((r, iPart) => {
      const mesh = r.current;
      if (!mesh) return;
      const mats = rockMatricesByPart[iPart] || [];
      for (let i = 0; i < mats.length; i++) mesh.setMatrixAt(i, mats[i]);
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [treeMatrices, rockMatricesByPart]);

  // Flip counts per LOD mode (+force buffer update)
  useEffect(() => {
    const setCount = (refs, n) =>
      refs.forEach((ref) => {
        const m = ref.current;
        if (m) {
          m.count = n;
          m.instanceMatrix.needsUpdate = true;
        }
      });

    if (mode === "high") {
      setCount(treeHighRefs.current, treeMatrices.length);
      setCount(treeMedRefs.current, 0);
      rockRefs.current.forEach((ref, iPart) => {
        const m = ref.current;
        if (m) {
          m.count = rockMatricesByPart[iPart]?.length || 0;
          m.instanceMatrix.needsUpdate = true;
        }
      });
    } else if (mode === "med") {
      setCount(treeHighRefs.current, 0);
      setCount(treeMedRefs.current, treeMatrices.length);
      setCount(rockRefs.current, 0);
    } else {
      setCount(treeHighRefs.current, 0);
      setCount(treeMedRefs.current, 0);
      setCount(rockRefs.current, 0);
    }
  }, [mode, treeMatrices.length, rockMatricesByPart]);

  return (
    <group>
      {/* Trees: High LOD */}
      {treeHighParts.map((p, i) => (
        <instancedMesh
          key={`th-${i}`}
          ref={treeHighRefs.current[i]}
          args={[p.geometry, p.material, treeCapacity]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}

      {/* Trees: Low/Med LOD */}
      {treeMedParts.map((p, i) => (
        <instancedMesh
          key={`tm-${i}`}
          ref={treeMedRefs.current[i]}
          args={[p.geometry, p.material, treeCapacity]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}

      {/* Rocks */}
      {rockParts.map((p, i) => {
        const cap = rockMatricesByPart[i]?.length || 1;
        return (
          <instancedMesh
            key={`rk-${i}`}
            ref={rockRefs.current[i]}
            args={[p.geometry, p.material, cap]}
            castShadow={false}
            receiveShadow
            frustumCulled={false}
          />
        );
      })}
    </group>
  );
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
