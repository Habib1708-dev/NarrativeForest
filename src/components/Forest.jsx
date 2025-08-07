// src/components/Forest.jsx
import React, { useRef, useEffect, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Detailed } from "@react-three/drei";
import * as THREE from "three";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";

export default function Forest({ terrainMesh, camera }) {
  // 1) Forest & culling controls
  const { size, seed, count, lodDist, viewRadius, chunkSize } = useControls(
    "Forest",
    {
      size: { value: 30, min: 10, max: 100, step: 5 },
      seed: { value: 1, min: 0, max: 100, step: 1 },
      count: { value: 1000, min: 10, max: 5000, step: 10 },
      lodDist: { value: 20, min: 1, max: 100, step: 1, label: "LOD Dist" },
      viewRadius: {
        value: 40,
        min: 10,
        max: 100,
        step: 5,
        label: "Cull Radius",
      },
      chunkSize: { value: 5, min: 1, max: 15, step: 1, label: "Chunk Size" },
    }
  );

  // 2) Load both LOD versions of the tree
  const highParts = useInstancedTree("/models/tree/tree_aML.glb");
  const lowParts = useInstancedTree("/models/tree/tree_aMLDecimated.glb");

  // 3) Compute all transforms once terrainMesh is available
  const [allTransforms, setAllTransforms] = useState([]);
  useEffect(() => {
    if (!terrainMesh) return;
    terrainMesh.updateMatrixWorld(true);

    const prng = mulberry32(Math.floor(seed));
    const arr = [];
    const originY = 30;
    const down = new THREE.Vector3(0, -1, 0);

    for (let i = 0; i < count; i++) {
      const x = prng() * size - size / 2;
      const z = prng() * size - size / 2;
      const origin = new THREE.Vector3(x, originY, z);
      const ray = new THREE.Raycaster(origin, down, 0, originY + 20);
      ray.firstHitOnly = true;
      const hit = ray.intersectObject(terrainMesh, false)[0] || null;
      const y = hit?.point.y ?? 0;

      arr.push({
        position: [x, y + 0.15, z],
        rotation: prng() * Math.PI * 2,
        scale: 0.02 + prng() * 0.02,
      });
    }

    setAllTransforms(arr);
  }, [terrainMesh, seed, size, count]);

  // 4) Partition transforms into spatial chunks
  const chunks = useMemo(() => {
    const map = new Map();
    allTransforms.forEach((t) => {
      const [x, , z] = t.position;
      const cx = Math.floor((x + size / 2) / chunkSize);
      const cz = Math.floor((z + size / 2) / chunkSize);
      const key = `${cx},${cz}`;
      if (!map.has(key)) map.set(key, { cx, cz, transforms: [] });
      map.get(key).transforms.push(t);
    });
    return Array.from(map.values());
  }, [allTransforms, size, chunkSize]);

  // 5) Prepare refs per chunk & part
  const chunkRefs = useMemo(
    () =>
      chunks.map((chunk) => ({
        center: new THREE.Vector3(
          chunk.cx * chunkSize - size / 2 + chunkSize / 2,
          0,
          chunk.cz * chunkSize - size / 2 + chunkSize / 2
        ),
        high: highParts.map(() => React.createRef()),
        low: lowParts.map(() => React.createRef()),
      })),
    [chunks, highParts, lowParts, size, chunkSize]
  );

  // 6) Bake instance matrices per chunk
  useEffect(() => {
    const m4 = new THREE.Matrix4(),
      p = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3();

    chunks.forEach((chunk, idx) => {
      const { transforms } = chunk;
      const { high: hRefs, low: lRefs } = chunkRefs[idx];

      transforms.forEach((t, i) => {
        p.fromArray(t.position);
        q.setFromEuler(new THREE.Euler(0, t.rotation, 0));
        s.setScalar(t.scale);
        m4.compose(p, q, s);

        hRefs.forEach((ref) => {
          const mesh = ref.current;
          if (mesh) mesh.setMatrixAt(i, m4);
        });
        lRefs.forEach((ref) => {
          const mesh = ref.current;
          if (mesh) mesh.setMatrixAt(i, m4);
        });
      });

      // Mark all instanceMatrix buffers dirty
      hRefs.forEach(
        (ref) => ref.current && (ref.current.instanceMatrix.needsUpdate = true)
      );
      lRefs.forEach(
        (ref) => ref.current && (ref.current.instanceMatrix.needsUpdate = true)
      );
    });
  }, [chunks, chunkRefs]);

  // 7) Frustum/distance culling of chunks
  useFrame(() => {
    const camPos = camera.position;
    chunkRefs.forEach((c, idx) => {
      const dist = c.center.distanceTo(camPos);
      const visible = dist <= viewRadius;
      c.high.forEach((ref) => ref.current && (ref.current.visible = visible));
      c.low.forEach((ref) => ref.current && (ref.current.visible = visible));
    });
  });

  // 8) Render: one Detailed LOD group per chunk
  return (
    <group>
      {chunks.map((chunk, idx) => {
        const { transforms } = chunk;
        return (
          <Detailed key={idx} distances={[lodDist]}>
            {highParts.map((p, i) => (
              <instancedMesh
                key={`h-${idx}-${i}`}
                ref={chunkRefs[idx].high[i]}
                args={[p.geometry, p.material, transforms.length]}
                frustumCulled={false}
              />
            ))}
            {lowParts.map((p, i) => (
              <instancedMesh
                key={`l-${idx}-${i}`}
                ref={chunkRefs[idx].low[i]}
                args={[p.geometry, p.material, transforms.length]}
                frustumCulled={false}
              />
            ))}
          </Detailed>
        );
      })}
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
