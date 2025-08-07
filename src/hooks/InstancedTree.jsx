// src/components/InstancedTree.jsx
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";

export function useInstancedTree(url) {
  const { scene } = useGLTF(url);

  // Extract all mesh parts only once per scene
  return useMemo(() => {
    const parts = [];
    scene.traverse((child) => {
      if (child.isMesh) {
        parts.push({
          geometry: child.geometry,
          material: child.material,
        });
      }
    });
    return parts;
  }, [scene]);
}

// preload so Suspense can batch‐fetch early
useGLTF.preload("/models/tree/tree_aML.glb");
useGLTF.preload("/models/tree/tree_aMLDecimated.glb");
