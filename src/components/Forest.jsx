// src/components/Forest.jsx
import React, { useRef, useEffect, useState, useMemo } from "react";
import { Detailed } from "@react-three/drei";
import * as THREE from "three";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";

export default function Forest({ terrainMesh }) {
  // 1) Forest controls
  const { size, seed, count, lodDist } = useControls("Forest", {
    size: { value: 10, min: 10, max: 100, step: 5 },
    seed: { value: 1, min: 0, max: 100, step: 1 },
    count: { value: 50, min: 10, max: 2000, step: 10 },
    lodDist: { value: 20, min: 1, max: 100, step: 1, label: "LOD Dist" },
  });

  // 2) Load both LOD versions of the tree
  const highParts = useInstancedTree("/models/tree/tree_aML.glb");
  const lowParts = useInstancedTree("/models/tree/tree_aMLDecimated.glb");

  // 3) Compute transforms once terrainMesh is available
  const [transforms, setTransforms] = useState([]);
  useEffect(() => {
    if (!terrainMesh) return;

    terrainMesh.updateMatrixWorld(true);

    const prng = mulberry32(Math.floor(seed));
    const arr = [];

    for (let i = 0; i < count; i++) {
      const x = prng() * size - size / 2;
      const z = prng() * size - size / 2;
      const originY = 30;
      const origin = new THREE.Vector3(x, originY, z);
      const down = new THREE.Vector3(0, -1, 0);
      const maxDist = originY + 20;
      const ray = new THREE.Raycaster(origin, down, 0, maxDist);
      ray.firstHitOnly = true;

      const hit = ray.intersectObject(terrainMesh, false)[0] || null;
      const y = hit?.point.y ?? 0;

      console.log(
        `[Forest] #${i} @ (${x.toFixed(1)}, ${z.toFixed(1)}) → hitY=${y.toFixed(
          2
        )}`
      );

      arr.push({
        position: [x, y + 0.15, z],
        rotation: prng() * Math.PI * 2,
        scale: 0.02 + prng() * 0.02,
      });
    }

    setTransforms(arr);
  }, [terrainMesh, seed, size, count]);

  // 4) Create stable refs for each sub-mesh part
  const highRefs = useMemo(
    () => highParts.map(() => React.createRef()),
    [highParts]
  );
  const lowRefs = useMemo(
    () => lowParts.map(() => React.createRef()),
    [lowParts]
  );

  // 5) Bake instance matrices when transforms change
  useEffect(() => {
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    function fill(refs, parts) {
      refs.forEach((ref, pi) => {
        const mesh = ref.current;
        if (!mesh) return;
        transforms.forEach((t, i) => {
          p.fromArray(t.position);
          q.setFromEuler(new THREE.Euler(0, t.rotation, 0));
          s.setScalar(t.scale);
          m4.compose(p, q, s);
          mesh.setMatrixAt(i, m4);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
      });
    }

    fill(highRefs, highParts);
    fill(lowRefs, lowParts);
  }, [transforms, highParts, lowParts, highRefs, lowRefs]);

  // 6) Render instanced meshes under a Detailed (LOD) wrapper
  return (
    <Detailed distances={[lodDist]}>
      {highParts.map((p, i) => (
        <instancedMesh
          key={`h${i}`}
          ref={highRefs[i]}
          args={[p.geometry, p.material, transforms.length]}
        />
      ))}
      {lowParts.map((p, i) => (
        <instancedMesh
          key={`l${i}`}
          ref={lowRefs[i]}
          args={[p.geometry, p.material, transforms.length]}
        />
      ))}
    </Detailed>
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
