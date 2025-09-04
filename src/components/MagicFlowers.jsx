// src/components/MagicFlowers.jsx
import React, { useMemo } from "react";
import { useGLTF, Clone } from "@react-three/drei";

// Model should be in: public/models/magicPlantsAndCrystal/PurpleFlowers.glb
const FLOWERS_GLB = "/models/magicPlantsAndCrystal/PurpleFlowers.glb";

export default function MagicFlowers(props) {
  const { scene } = useGLTF(FLOWERS_GLB);

  // Hard-coded transforms (radians for rotations), rounded to ≤ 3 decimals
  const INSTANCES = useMemo(
    () => [
      // 1
      {
        position: [-0.822, -4.14, -3.5],
        rotation: [-0.059, 0, -0.117],
        scale: 0.1,
      },
      // 2
      {
        position: [-0.8, -4.15, -3.6],
        rotation: [-0.352, 0.477, 0],
        scale: 0.1,
      },
      // 3
      {
        position: [-0.912, -4.15, -3.56],
        rotation: [-0.117, 1.527, 0],
        scale: 0.1,
      },
      // 4
      {
        position: [-2.42, -4.57, -1.42],
        rotation: [0, 0, -0.117],
        scale: 0.09,
      },
      // 5
      {
        position: [-2.39, -4.59, -1.53],
        rotation: [0, 0, -0.059],
        scale: 0.09,
      },
      // 6
      { position: [-2.35, -4.6, -1.66], rotation: [-0.258, 0, 0], scale: 0.06 },
      // 7
      { position: [-2.38, -4.59, -1.418], rotation: [0, 0, 0], scale: 0.09 },
      // 8
      {
        position: [-2.55, -4.22, -3.44],
        rotation: [-0.235, 0, 0.059],
        scale: 0.11,
      },
      // 9
      {
        position: [-0.96, -4.28, -2.84],
        rotation: [-0.18, 0, -0.12],
        scale: 0.11,
      },
      // 10
      { position: [-0.96, -4.29, -2.96], rotation: [-0.235, 0, 0], scale: 0.1 },
    ],
    []
  );

  if (!scene) return null;

  return (
    <group {...props} name="MagicFlowers">
      {INSTANCES.map((cfg, i) => (
        <group
          key={i}
          position={cfg.position}
          rotation={cfg.rotation}
          scale={cfg.scale}
        >
          <Clone object={scene} onClone={isolateMaterialsPerClone} />
        </group>
      ))}
    </group>
  );
}

/**
 * Ensure each clone has isolated materials so edits won't leak between instances.
 * Also enables cast/receive shadows.
 */
function isolateMaterialsPerClone(root) {
  root.traverse((n) => {
    if (!n.isMesh) return;
    n.castShadow = true;
    n.receiveShadow = true;

    const mats = Array.isArray(n.material) ? n.material : [n.material];
    const cloned = mats.map((m) => {
      const c = m.clone();
      c.needsUpdate = true;
      return c;
    });
    n.material = Array.isArray(n.material) ? cloned : cloned[0];
  });
}

useGLTF.preload(FLOWERS_GLB);
