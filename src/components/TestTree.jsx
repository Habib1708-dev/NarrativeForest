import React from "react";
import { useGLTF } from "@react-three/drei";
import { useControls } from "leva";

export default function TestTree() {
  // Load the tree model
  const { scene } = useGLTF("/models/tree/pine_tree (1)D5800E.glb");

  // Controls for testing different properties
  const { position, rotation, scale } = useControls("Test Tree", {
    position: { value: [0, 0, 0], step: 0.1 },
    rotation: { value: [0, 0, 0], step: 0.1 },
    scale: { value: 0.02, min: 0.01, max: 0.1, step: 0.001 },
  });

  return (
    <primitive
      object={scene.clone()}
      position={position}
      rotation={rotation}
      scale={[scale, scale, scale]}
    />
  );
}

// Preload the model for better performance
useGLTF.preload("/models/tree/pine_tree (1)D5800E.glb");
