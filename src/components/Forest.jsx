// src/components/Forest.jsx`
import React, { useMemo, useEffect } from "react";
import * as THREE from "three";
import { useControls } from "leva";

// A tiny seedable PRNG (mulberry32)
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let z = Math.imul(t ^ (t >>> 15), 1 | t);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export default function Forest({ terrainMesh }) {
  // 1Controls for distribution
  const { size, seed, count } = useControls("Forest", {
    size: { value: 30, min: 10, max: 100, step: 5, label: "Field Width" },
    seed: { value: 1, min: 0, max: 100, step: 1, label: "Random Seed" },
    count: { value: 500, min: 10, max: 2000, step: 10, label: "Tree Count" },
  });

  // 2 Prepare a single Raycaster that stops at the first hit
  const raycaster = useMemo(() => {
    const r = new THREE.Raycaster();
    r.firstHitOnly = true;
    return r;
  }, []);

  // direction straight down
  const down = useMemo(() => new THREE.Vector3(0, -1, 0), []);

  // 3 Generate X,Z positions, raycast to get Y, collect in an array
  const treePositions = useMemo(() => {
    const prng = mulberry32(Math.floor(seed));
    const positions = [];

    for (let i = 0; i < count; i++) {
      // random X,Z in [-size/2, +size/2]
      const x = prng() * size - size / 2;
      const z = prng() * size - size / 2;

      // cast from high above
      const origin = new THREE.Vector3(x, 5000, z);
      raycaster.set(origin, down);

      // perform the intersection
      const hit = terrainMesh
        ? raycaster.intersectObject(terrainMesh, false)[0]
        : null;

      // world‐space elevation
      const y = hit ? hit.point.y : 0;

      positions.push({ x, y, z });
    }

    return positions;
  }, [seed, size, count, terrainMesh, raycaster, down]);

  useEffect(() => {
    console.log(
      "Forest.seeded positions:",
      treePositions.slice(0, 5),
      "... total",
      treePositions.length
    );
  }, [treePositions]);

  // 4
  return (
    <>
      {treePositions.slice(0, 3).map(({ x, y, z }, i) => (
        <mesh key={i} position={[x, y + 0.015, z]}>
          <boxGeometry args={[0.03, 0.03, 0.03]} />
          <meshStandardMaterial color="red" />
        </mesh>
      ))}
    </>
  );
}
