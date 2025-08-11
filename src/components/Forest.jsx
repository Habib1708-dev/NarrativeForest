// src/components/Forest.jsx
import React, { useMemo, useEffect, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";

export default function Forest({ terrainMesh }) {
  // Controls
  const {
    size,
    seed,
    count,
    chunkSize,
    nearRadius,
    midRadius,
    viewRadius,
    plantRadius, // NEW: spawn radius (meters)
  } = useControls("Forest", {
    size: { value: 30, min: 10, max: 200, step: 5 },
    seed: { value: 1, min: 0, max: 100, step: 1 },
    count: { value: 3500, min: 10, max: 20000, step: 10 },
    chunkSize: { value: 5, min: 2, max: 20, step: 1, label: "Chunk Size (m)" },
    nearRadius: {
      value: 1,
      min: 1,
      max: 40,
      step: 1,
      label: "High LOD radius (chunks)",
    },
    midRadius: {
      value: 3,
      min: 1,
      max: 60,
      step: 1,
      label: "Medium LOD radius (chunks)",
    },
    viewRadius: {
      value: 6,
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
    }, // NEW
  });

  // Load LODs
  const highParts = useInstancedTree(
    "/models/tree/PineTrees2/PineTree1Decimated4589.glb"
  );
  const medParts = useInstancedTree(
    "/models/tree/PineTrees2/PineTree2MediumLODDecimated1668.glb"
  );
  const lowParts = useInstancedTree(
    "/models/tree/PineTrees2/PineTree2LowLODDecimated89.glb"
  );

  // 1) Bake transforms once
  const allTransforms = useMemo(() => {
    if (!terrainMesh) return [];
    terrainMesh.updateMatrixWorld(true);

    const prng = mulberry32(Math.floor(seed));
    const arr = [];

    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const origin = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);

    const bbox = new THREE.Box3().setFromObject(terrainMesh);
    const originY = bbox.max.y + 5;
    const rayFar = Math.max(10, bbox.max.y - bbox.min.y + 20);

    // cap radius to stay within terrain bounds
    const R = Math.min(plantRadius, size * 0.5 - 0.001);

    for (let i = 0; i < count; i++) {
      // Uniform disk sampling (centered at terrain origin)
      const r = Math.sqrt(prng()) * R;
      const theta = prng() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      const scale = 0.003 + prng() * (0.006 - 0.003);

      origin.set(x, originY, z);
      ray.set(origin, down);
      ray.near = 0;
      ray.far = rayFar;

      const hit = ray.intersectObject(terrainMesh, false)[0] || null;
      const terrainY = hit?.point.y ?? 0;

      // tiny bury so no floating
      const adjustedY = terrainY - scale * 2.0;

      arr.push({
        position: [x, adjustedY, z],
        rotation: prng() * Math.PI * 2,
        scale,
      });
    }

    return arr;
  }, [terrainMesh, seed, size, count, plantRadius]);

  // 2) Partition into chunks
  const chunks = useMemo(() => {
    if (allTransforms.length === 0) return [];
    const map = new Map();
    for (const t of allTransforms) {
      const [x, , z] = t.position;
      const cx = Math.floor((x + size / 2) / chunkSize);
      const cz = Math.floor((z + size / 2) / chunkSize);
      const key = `${cx},${cz}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          cx,
          cz,
          transforms: [],
          center: new THREE.Vector3(
            cx * chunkSize - size / 2 + chunkSize / 2,
            0,
            cz * chunkSize - size / 2 + chunkSize / 2
          ),
        });
      }
      map.get(key).transforms.push(t);
    }
    return Array.from(map.values());
  }, [allTransforms, size, chunkSize]);

  // 3) LOD selection
  const { camera } = useThree();
  const [chunkModes, setChunkModes] = useState({});
  const lastCam = useRef(new THREE.Vector3(1e9, 0, 1e9));
  const moveThreshold = Math.max(0.5, chunkSize * 0.5);

  useEffect(() => {
    setChunkModes({});
    lastCam.current.set(1e9, 0, 1e9);
  }, [chunks, chunkSize, nearRadius, midRadius, viewRadius]);

  useFrame(() => {
    const cx = camera.position.x,
      cz = camera.position.z;
    const dx = cx - lastCam.current.x,
      dz = cz - lastCam.current.z;
    if (dx * dx + dz * dz < moveThreshold * moveThreshold) return;
    lastCam.current.set(cx, 0, cz);

    const halfDiag = Math.SQRT2 * (chunkSize / 2);
    const nearWorld = nearRadius * chunkSize;
    const midWorld = midRadius * chunkSize;
    const viewWorld = viewRadius * chunkSize;

    const cam2 = new THREE.Vector3(cx, 0, cz);
    const nextModes = {};
    for (const c of chunks) {
      const dist = c.center.distanceTo(cam2);
      if (dist > viewWorld + halfDiag) nextModes[c.key] = "off";
      else if (dist <= nearWorld + halfDiag) nextModes[c.key] = "high";
      else if (dist <= midWorld + halfDiag) nextModes[c.key] = "med";
      else nextModes[c.key] = "low";
    }

    let changed = false;
    if (Object.keys(nextModes).length !== Object.keys(chunkModes).length)
      changed = true;
    else
      for (const k in nextModes)
        if (chunkModes[k] !== nextModes[k]) {
          changed = true;
          break;
        }
    if (changed) setChunkModes(nextModes);
  });

  if (!highParts.length || !medParts.length || !lowParts.length) return null;

  return (
    <group>
      {chunks.map((chunk) => (
        <ChunkInstanced
          key={chunk.key}
          transforms={chunk.transforms}
          mode={chunkModes[chunk.key] ?? "off"}
          highParts={highParts}
          medParts={medParts}
          lowParts={lowParts}
        />
      ))}
    </group>
  );
}

function ChunkInstanced({ transforms, mode, highParts, medParts, lowParts }) {
  const capacity = transforms.length;
  const highRefs = useRef(highParts.map(() => React.createRef()));
  const medRefs = useRef(medParts.map(() => React.createRef()));
  const lowRefs = useRef(lowParts.map(() => React.createRef()));

  useEffect(() => {
    [highRefs.current, medRefs.current, lowRefs.current].forEach((arr) =>
      arr.forEach(
        (r) =>
          r.current && r.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      )
    );
  }, []);

  useEffect(() => {
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    function writeAll(refArray) {
      refArray.forEach((ref) => {
        const mesh = ref.current;
        if (!mesh) return;
        for (let i = 0; i < transforms.length; i++) {
          const t = transforms[i];
          p.fromArray(t.position);
          q.setFromEuler(new THREE.Euler(0, t.rotation, 0));
          s.setScalar(t.scale);
          m4.compose(p, q, s);
          mesh.setMatrixAt(i, m4);
        }
        mesh.count = transforms.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
      });
    }
    function hideAll(refArray) {
      refArray.forEach((ref) => {
        const mesh = ref.current;
        if (mesh) mesh.count = 0;
      });
    }

    if (mode === "high") {
      writeAll(highRefs.current);
      hideAll(medRefs.current);
      hideAll(lowRefs.current);
    } else if (mode === "med") {
      writeAll(medRefs.current);
      hideAll(highRefs.current);
      hideAll(lowRefs.current);
    } else if (mode === "low") {
      writeAll(lowRefs.current);
      hideAll(highRefs.current);
      hideAll(medRefs.current);
    } else {
      hideAll(highRefs.current);
      hideAll(medRefs.current);
      hideAll(lowRefs.current);
    }
  }, [mode, transforms]);

  return (
    <group>
      {highParts.map((p, i) => (
        <instancedMesh
          key={`h-${i}`}
          ref={highRefs.current[i]}
          args={[p.geometry, p.material, capacity]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}
      {medParts.map((p, i) => (
        <instancedMesh
          key={`m-${i}`}
          ref={medRefs.current[i]}
          args={[p.geometry, p.material, capacity]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}
      {lowParts.map((p, i) => (
        <instancedMesh
          key={`l-${i}`}
          ref={lowRefs.current[i]}
          args={[p.geometry, p.material, capacity]}
          castShadow={false}
          receiveShadow
          frustumCulled={false}
        />
      ))}
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
