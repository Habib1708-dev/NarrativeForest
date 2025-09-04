// src/components/MagicMushrooms.jsx
import React from "react";
import * as THREE from "three";
import { useGLTF, Clone } from "@react-three/drei";
import { useControls, folder } from "leva";

const MUSHROOM_GLB = "/models/magicPlantsAndCrystal/Mushroom.glb"; // public/

export default function MagicMushrooms(props) {
  const { scene } = useGLTF(MUSHROOM_GLB);

  // 7 instances, each with its own Leva folder
  const instances = Array.from({ length: 7 }, (_, i) => {
    const name = `Mushroom ${i + 1}`;
    return useControls(
      name,
      {
        positionX: { value: -2, min: -4, max: 2, step: 0.001 },
        positionY: { value: -4, min: -5, max: -3, step: 0.001 }, // updated range
        positionZ: { value: -2, min: -4, max: 2, step: 0.001 },
        rotationY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.001 },
        rotationZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.001 },
        scale: { value: 0.7, min: 0.01, max: 5, step: 0.001 },
      },
      { collapsed: true }
    );
  });

  return (
    <group {...props} name="MagicMushrooms">
      {instances.map((ctrl, i) => (
        <group
          key={i}
          position={[ctrl.positionX, ctrl.positionY, ctrl.positionZ]}
          rotation={[0, ctrl.rotationY, ctrl.rotationZ]}
          scale={ctrl.scale}
        >
          <Clone object={scene} onClone={(root) => tintClone(root)} />
        </group>
      ))}
    </group>
  );
}

function tintClone(root) {
  root.traverse((n) => {
    if (n.isMesh) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      n.material = mats.map((m) => {
        const c = m.clone();
        c.needsUpdate = true;
        return c;
      });
      if (!Array.isArray(n.material)) n.material = n.material[0];
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
}

useGLTF.preload(MUSHROOM_GLB);
