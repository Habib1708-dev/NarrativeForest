import React, { useMemo, useEffect, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";
import { useInstancedRocks } from "../hooks/InstancedRocks";

export default function Forest({ terrainMesh }) {
  // ---------------------------
  // Controls
  // ---------------------------
  const {
    size,
    seed,
    count, // trees
    chunkSize,
    nearRadius,
    midRadius,
    viewRadius,
    plantRadius,
  } = useControls("Forest", {
    size: { value: 20, min: 10, max: 200, step: 5 },
    seed: { value: 1, min: 0, max: 100, step: 1 },
    count: { value: 1000, min: 10, max: 20000, step: 10, label: "Tree Count" },
    chunkSize: { value: 5, min: 2, max: 20, step: 1, label: "Chunk Size (m)" },
    nearRadius: {
      value: 0.2,
      min: 0.01,
      max: 10,
      step: 0.01,
      label: "High LOD radius (chunks)",
    },
    midRadius: {
      value: 2,
      min: 1,
      max: 60,
      step: 1,
      label: "Low LOD radius (chunks)",
    },
    viewRadius: {
      value: 5,
      min: 2,
      max: 80,
      step: 1,
      label: "Cull radius (chunks)",
    },
    plantRadius: {
      value: 12,
      min: 2,
      max: 100,
      step: 1,
      label: "Plant radius (m)",
    },
  });

  const { tintColor, tintIntensity } = useControls("Tree Tint", {
    tintColor: { value: "#405a3c", label: "Tint Color" },
    tintIntensity: {
      value: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Intensity",
    },
  });

  const { rockCount, rockScaleMin, rockScaleMax } = useControls("Rocks", {
    rockCount: { value: 1000, min: 0, max: 10000, step: 10, label: "Count" },
    rockScaleMin: {
      value: 0.03,
      min: 0.03,
      max: 0.11,
      step: 0.001,
      label: "Scale Min",
    },
    rockScaleMax: {
      value: 0.101,
      min: 0.03,
      max: 0.11,
      step: 0.001,
      label: "Scale Max",
    },
  });

  const { rockTintColor, rockTintIntensity } = useControls("Rock Tint", {
    rockTintColor: { value: "#444444", label: "Tint Color" },
    rockTintIntensity: {
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Intensity",
    },
  });

  // ---------------------------
  // Assets
  // ---------------------------
  // High LOD (Spruce1)
  const highParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1.glb");

  // Low LOD (Spruce1_LOD) — your Windows path maps to /public
  // C:\Users\3liha\Desktop\narrative-forest\public\models\tree\Spruce_Fir\Spruce1_LOD.glb
  const lowParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1_LOD.glb");

  const rockParts = useInstancedRocks("/models/rocks/MossRock.glb");

  // ---------------------------
  // Materials tint
  // ---------------------------
  // Trees
  useEffect(() => {
    const target = new THREE.Color(tintColor);
    const tint = (parts) => {
      parts.forEach((p) => {
        const m = p.material;
        if (!m || !m.color) return;
        if (!m.userData._origColor) m.userData._origColor = m.color.clone();
        m.color.copy(m.userData._origColor).lerp(target, tintIntensity);
        if (typeof m.metalness === "number") m.metalness = 0.0;
        if (typeof m.roughness === "number")
          m.roughness = Math.min(1, Math.max(0.8, m.roughness));
        m.needsUpdate = true;
      });
    };
    if (highParts.length) tint(highParts);
    if (lowParts.length) tint(lowParts);
  }, [highParts, lowParts, tintColor, tintIntensity]);

  // Rocks
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

  // Keep a small exclusion for the cabin
  const CABIN_X = -1.8,
    CABIN_Z = -2.7,
    CABIN_HALF = 0.3;
  const insideCabinXZ = (x, z) =>
    x >= CABIN_X - CABIN_HALF &&
    x <= CABIN_X + CABIN_HALF &&
    z >= CABIN_Z - CABIN_HALF &&
    z <= CABIN_Z + CABIN_HALF;

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

  // Base Y of tree (baked bbox)
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
    const R = Math.min(plantRadius, effSize * 0.5 - 0.001);

    const arr = [];
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const origin = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);

    const bbox = new THREE.Box3().setFromObject(terrainMesh);
    const originY = bbox.max.y + 5;
    const rayFar = Math.max(10, bbox.max.y - bbox.min.y + 20);

    const index = makeHasher(0.25);
    const radiusPerScale = 30.0;

    let placed = 0,
      attempts = 0,
      maxAttempts = count * 20;

    while (placed < count && attempts < maxAttempts) {
      attempts++;

      const r = Math.sqrt(treeRng()) * R;
      const theta = treeRng() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      if (insideCabinXZ(x, z)) continue;

      const sMin = 0.02,
        sMax = 0.035;
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
    }

    if (attempts >= maxAttempts && placed < count) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[Forest] Tree placement saturated: ${placed}/${count}. Increase plantRadius or decrease count.`
        );
      }
    }
    return arr;
  }, [terrainMesh, seed, size, count, plantRadius, treeBaseMinY, treeRng]);

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
    for (const t of treeTransforms) {
      index.add(t.position[0], t.position[2], TREE_RADIUS);
    }

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
      attempts = 0,
      maxAttempts = rockCount * 30;

    while (placed < rockCount && attempts < maxAttempts) {
      attempts++;

      const r = Math.sqrt(rockRng()) * R;
      const theta = rockRng() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      if (insideCabinXZ(x, z)) continue;

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

      const rotX = (rockRng() - 0.5) * 0.2; // small tilt
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
  const cam2 = useRef(new THREE.Vector3());
  const moveThreshold = Math.max(0.5, chunkSize * 0.5);

  useEffect(() => {
    modesRef.current = chunkModes;
  }, [chunkModes]);

  const computeChunkModes = (chunksArr, camXZ) => {
    const rNear = Math.max(0.01, nearRadius);
    const rMid = Math.max(rNear + 0.001, midRadius);
    const rView = Math.max(rMid + 0.001, viewRadius);

    const halfDiag = Math.SQRT2 * (chunkSize / 2);
    const nearWorld = rNear * chunkSize;
    const midWorld = rMid * chunkSize;
    const viewWorld = rView * chunkSize;

    const next = {};
    for (const c of chunksArr) {
      const dist = c.center.distanceTo(camXZ);
      if (dist > viewWorld + halfDiag) next[c.key] = "off";
      else if (dist <= nearWorld + halfDiag) next[c.key] = "high";
      else if (dist <= midWorld + halfDiag) next[c.key] = "med";
      else next[c.key] = "off";
    }
    return next;
  };

  // Precompute initial modes before first paint
  const initialModes = useMemo(() => {
    const camXZ = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    return computeChunkModes(chunks, camXZ);
  }, [camera, chunks, chunkSize, nearRadius, midRadius, viewRadius]);

  useEffect(() => {
    setChunkModes(initialModes);
    modesRef.current = initialModes;
    lastCam.current.set(camera.position.x, 0, camera.position.z);
  }, [initialModes, camera.position.x, camera.position.z]);

  // Update modes when camera moves far enough
  useFrame(() => {
    cam2.current.set(camera.position.x, 0, camera.position.z);
    const dx = cam2.current.x - lastCam.current.x;
    const dz = cam2.current.z - lastCam.current.z;
    if (dx * dx + dz * dz < moveThreshold * moveThreshold) return;
    lastCam.current.copy(cam2.current);

    const next = computeChunkModes(chunks, cam2.current);
    const curr = modesRef.current;

    let changed = Object.keys(next).length !== Object.keys(curr).length;
    if (!changed)
      for (const k in next)
        if (curr[k] !== next[k]) {
          changed = true;
          break;
        }

    if (changed) {
      setChunkModes(next);
      modesRef.current = next;
    }
  });

  if (!highParts.length || !lowParts.length || !rockParts.length) return null;

  return (
    <group>
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
}

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

  // Trees matrices (yaw only)
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

  // Rocks matrices PER PART (rotX + rotY)
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

    // Trees med
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

  // Flip counts per LOD mode
  useEffect(() => {
    const setCount = (refs, n) =>
      refs.forEach((ref) => ref.current && (ref.current.count = n));

    if (mode === "high") {
      setCount(treeHighRefs.current, treeMatrices.length);
      setCount(treeMedRefs.current, 0);
      // rocks only in high
      rockRefs.current.forEach((ref, iPart) => {
        if (ref.current)
          ref.current.count = rockMatricesByPart[iPart]?.length || 0;
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
