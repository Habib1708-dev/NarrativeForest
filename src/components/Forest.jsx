// src/components/Forest.jsx
import React, { useEffect } from "react";
import { useGLTF } from "@react-three/drei";

export default function Forest() {
  // 1) Load both models
  const highGltf = useGLTF("/models/tree/tree_aML.glb");
  const lowGltf = useGLTF("/models/tree/tree_aMLDecimated.glb");

  // 2) Log their contents once on mount
  useEffect(() => {
    console.log("🍃 high-detail GLTF:", highGltf);
    console.log("🍂 low-detail  GLTF:", lowGltf);

    // If you want just the node keys:
    console.log("high nodes:", Object.keys(highGltf.nodes || {}));
    console.log("high materials:", Object.keys(highGltf.materials || {}));
    console.log("low nodes:", Object.keys(lowGltf.nodes || {}));
    console.log("low materials:", Object.keys(lowGltf.materials || {}));
  }, [highGltf, lowGltf]);

  return null; // we’re just inspecting for now
}

// Preload for snappier dev
useGLTF.preload("/models/tree/tree_aML.glb");
useGLTF.preload("/models/tree/tree_aMLDecimated.glb");
