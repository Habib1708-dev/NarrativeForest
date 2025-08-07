// src/components/Forest.jsx
import React, { useMemo, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Detailed } from "@react-three/drei";
import * as THREE from "three";
import { useControls } from "leva";
import { useInstancedTree } from "../hooks/InstancedTree";

export default function Forest({ terrainMesh }) {
  // 1) Forest + culling controls
  const { size, seed, count, viewRadius, lodDist } = useControls("Forest", {
    size: { value: 30, min: 10, max: 100, step: 5 },
    seed: { value: 1, min: 0, max: 100, step: 1 },
    count: { value: 7000, min: 10, max: 10000, step: 10 },
    viewRadius: { value: 1, min: 5, max: 100, step: 5, label: "Cull Radius" },
    lodDist: { value: 20, min: 1, max: 100, step: 1, label: "LOD Dist" },
  });

  // 2) Load both LOD versions of the tree (once)
  const highParts = useInstancedTree("/models/tree/tree_aML.glb");
  const lowParts = useInstancedTree("/models/tree/tree_aMLDecimated.glb");

  // 3) Bake FULL transforms array just once
  const allTransforms = useMemo(() => {
    if (!terrainMesh) return [];
    terrainMesh.updateMatrixWorld();
    const prng = mulberry32(Math.floor(seed));
    const down = new THREE.Vector3(0, -1, 0);
    const originY = size;
    const arr = [];

    for (let i = 0; i < count; i++) {
      const x = prng() * size - size / 2;
      const z = prng() * size - size / 2;
      const scale = 0.02 + prng() * 0.02;

      // sample terrain height
      const origin = new THREE.Vector3(x, originY, z);
      const ray = new THREE.Raycaster(origin, down, 0, originY * 2);
      ray.firstHitOnly = true;
      const hit = ray.intersectObject(terrainMesh, false)[0] || null;
      const terrainY = hit?.point.y ?? 0;

      // subtract tree height
      const adjustedY = terrainY + 0.15 - scale * 4.5;

      arr.push({
        position: [x, adjustedY, z],
        rotation: prng() * Math.PI * 2,
        scale,
      });
    }

    console.log(`Baked ${arr.length} total tree transforms`);
    return arr;
  }, [terrainMesh, seed, size, count]);

  // 4) Refs for instanced meshes (one ref per sub-mesh part)
  const highRefs = useRef(highParts.map(() => React.createRef()));
  const lowRefs = useRef(lowParts.map(() => React.createRef()));

  // 5) Get camera from the scene
  const { camera } = useThree();

  // 6) Every frame, compute which transforms are within viewRadius
  const visibleTransforms = useMemo(() => {
    const r2 = viewRadius * viewRadius;
    const cx = camera.position.x;
    const cz = camera.position.z;
    return allTransforms.filter(({ position: [x, , z] }) => {
      const dx = cx - x,
        dz = cz - z;
      return dx * dx + dz * dz <= r2;
    });
  }, [allTransforms, camera.position.x, camera.position.z, viewRadius]);

  // 7) Whenever the visible slice changes, bake those matrices
  useEffect(() => {
    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    function bake(refs) {
      refs.current.forEach((ref, pi) => {
        const mesh = ref.current;
        if (!mesh) return;
        visibleTransforms.forEach((t, i) => {
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

    bake(highRefs);
    bake(lowRefs);
  }, [visibleTransforms]);

  // 8) Render just the “visibleTransforms.length” instances per sub-mesh
  return (
    <Detailed distances={[lodDist]}>
      {highParts.map((p, i) => (
        <instancedMesh
          key={`h${i}`}
          ref={highRefs.current[i]}
          args={[p.geometry, p.material, visibleTransforms.length]}
        />
      ))}
      {lowParts.map((p, i) => (
        <instancedMesh
          key={`l${i}`}
          ref={lowRefs.current[i]}
          args={[p.geometry, p.material, visibleTransforms.length]}
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
