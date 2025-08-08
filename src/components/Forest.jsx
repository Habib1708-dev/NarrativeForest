// src/components/Forest.jsx
import React, { useMemo, useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";

export default function Forest({ terrainMesh }) {
  // Controls
  const {
    size, // world size (your terrain width/height)
    seed, // PRNG seed for placement
    count, // total trees to bake
    chunkSize, // each grid cell size (world units)
    nearRadius, // chunks within this are high LOD
    viewRadius, // chunks within this are visible at low LOD
  } = useControls("Forest", {
    size: { value: 30, min: 10, max: 200, step: 5 },
    seed: { value: 1, min: 0, max: 100, step: 1 },
    count: { value: 7000, min: 10, max: 20000, step: 10 },
    chunkSize: { value: 5, min: 2, max: 20, step: 1, label: "Chunk Size" },
    nearRadius: {
      value: 3,
      min: 1,
      max: 40,
      step: 1,
      label: "High LOD radius",
    },
    viewRadius: { value: 14, min: 2, max: 80, step: 1, label: "Cull radius" },
  });

  // Load both LOD versions once (returns parts: {geometry, material}[])
  const highParts = useInstancedTree("/models/tree/tree_aML.glb");
  const lowParts = useInstancedTree("/models/tree/tree_aMLDecimated.glb");

  // 1) Bake ALL transforms once (positions, rotations, scales with terrain Y)
  const allTransforms = useMemo(() => {
    if (!terrainMesh) return [];
    terrainMesh.updateMatrixWorld(true);

    const prng = mulberry32(Math.floor(seed));
    const arr = [];

    // Reuse one Raycaster and vectors (three-mesh-bvh accelerates this)
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = true;
    const origin = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);

    const originY = size; // cast from above world

    for (let i = 0; i < count; i++) {
      const x = prng() * size - size / 2;
      const z = prng() * size - size / 2;
      const scale = 0.02 + prng() * 0.02;

      origin.set(x, originY, z);
      ray.set(origin, down);
      ray.near = 0;
      ray.far = originY * 2;

      const hit = ray.intersectObject(terrainMesh, false)[0] || null;
      const terrainY = hit?.point.y ?? 0;

      // small bury to avoid floating
      const adjustedY = terrainY + 0.15 - scale * 4.5;

      arr.push({
        position: [x, adjustedY, z],
        rotation: prng() * Math.PI * 2,
        scale,
      });
    }

    return arr;
  }, [terrainMesh, seed, size, count]);

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

  // 3) Chunk LOD modes. We update these only when the camera moves enough.
  const { camera } = useThree();
  const [chunkModes, setChunkModes] = useState({}); // key -> "off" | "far" | "near"
  const lastCam = useRef(new THREE.Vector3(1e9, 0, 1e9)); // force first update
  const moveThreshold = Math.max(0.5, chunkSize * 0.5); // world units

  useEffect(() => {
    // Reset modes when chunk layout changes
    setChunkModes({});
    lastCam.current.set(1e9, 0, 1e9);
  }, [chunks, chunkSize, nearRadius, viewRadius]);

  useFrame(() => {
    const cx = camera.position.x;
    const cz = camera.position.z;
    const dx = cx - lastCam.current.x;
    const dz = cz - lastCam.current.z;
    if (dx * dx + dz * dz < moveThreshold * moveThreshold) return; // throttle by movement
    lastCam.current.set(cx, 0, cz);

    const halfDiag = Math.SQRT2 * (chunkSize / 2); // margin so a chunk flips later
    const nextModes = {};
    for (const c of chunks) {
      const dist = c.center.distanceTo(new THREE.Vector3(cx, 0, cz));
      if (dist > viewRadius + halfDiag) {
        nextModes[c.key] = "off";
      } else if (dist <= nearRadius + halfDiag) {
        nextModes[c.key] = "near"; // high LOD
      } else {
        nextModes[c.key] = "far"; // low LOD
      }
    }

    // Only update state if something actually changed
    let changed = false;
    if (Object.keys(nextModes).length !== Object.keys(chunkModes).length) {
      changed = true;
    } else {
      for (const k in nextModes) {
        if (chunkModes[k] !== nextModes[k]) {
          changed = true;
          break;
        }
      }
    }
    if (changed) setChunkModes(nextModes);
  });

  // 4) Render: one ChunkInstanced per chunk.
  //    We wait until the GLBs are loaded (parts available).
  if (highParts.length === 0 || lowParts.length === 0) return null;

  return (
    <group>
      {chunks.map((chunk) => (
        <ChunkInstanced
          key={chunk.key}
          transforms={chunk.transforms}
          mode={chunkModes[chunk.key] ?? "off"}
          highParts={highParts}
          lowParts={lowParts}
        />
      ))}
    </group>
  );
}

// A chunk renderer with *fixed-capacity* instancers for high/low LOD.
// We only update/bake when `mode` changes.
function ChunkInstanced({ transforms, mode, highParts, lowParts }) {
  // Fixed capacity per chunk = max trees in this chunk
  const capacity = transforms.length;

  // Refs for instanced meshes (one per sub-mesh/part)
  const highRefs = useRef(highParts.map(() => React.createRef()));
  const lowRefs = useRef(lowParts.map(() => React.createRef()));

  // On first mount, mark instance buffers dynamic
  useEffect(() => {
    highRefs.current.forEach((r) => {
      if (r.current) r.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    });
    lowRefs.current.forEach((r) => {
      if (r.current) r.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    });
  }, []);

  // Re-bake *only when mode changes*
  useEffect(() => {
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    // Helper: write all transforms into a specific instanced mesh set
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
        mesh.count = transforms.length; // draw only first N
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
      });
    }

    function hideAll(refArray) {
      refArray.forEach((ref) => {
        const mesh = ref.current;
        if (!mesh) return;
        mesh.count = 0; // no draw calls
      });
    }

    if (mode === "near") {
      // High LOD visible, Low hidden
      writeAll(highRefs.current);
      hideAll(lowRefs.current);
    } else if (mode === "far") {
      // Low LOD visible, High hidden
      writeAll(lowRefs.current);
      hideAll(highRefs.current);
    } else {
      // Off: both hidden
      hideAll(highRefs.current);
      hideAll(lowRefs.current);
    }
  }, [mode, transforms]);

  // Capacity is fixed; we control visibility via `.count`
  return (
    <group>
      {highParts.map((p, i) => (
        <instancedMesh
          key={`h-${i}`}
          ref={highRefs.current[i]}
          args={[p.geometry, p.material, capacity]}
          castShadow={false}
          receiveShadow={true}
          frustumCulled={false}
        />
      ))}
      {lowParts.map((p, i) => (
        <instancedMesh
          key={`l-${i}`}
          ref={lowRefs.current[i]}
          args={[p.geometry, p.material, capacity]}
          castShadow={false}
          receiveShadow={true}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

// Simple seedable PRNG
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let z = Math.imul(t ^ (t >>> 15), 1 | t);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
