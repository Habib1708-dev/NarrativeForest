import React from "react";
import { useGLTF } from "@react-three/drei";
import { useControls } from "leva";

export default function TestTree() {
  // Load the tree model
  const { scene } = useGLTF(
    "/models/tree/PineTrees2/PineTree2LowLODDecimated89.glb"
  );

  // Controls for testing different properties
  const { position, rotation, scale } = useControls("Test Tree", {
    position: { value: [0, 0, 0], step: 0.1 },
    rotation: { value: [0, 0, 0], step: 0.1 },
    scale: { value: 0.005, min: 0.005, max: 0.02, step: 0.001 },
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
useGLTF.preload("/models/tree/PineTrees/PineTreeLowLOD543.glb");
