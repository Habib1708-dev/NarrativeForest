// src/components/InstancedTree.jsx
import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

export function useInstancedTree(url) {
  const { scene } = useGLTF(url);

  return useMemo(() => {
    // Ensure world matrices are valid
    scene.updateMatrixWorld(true);

    const invRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const parts = [];

    scene.traverse((child) => {
      if (!child.isMesh) return;

      // Cloning the geometry and bake the node's full transform relative to the GLTF root
      const geom = child.geometry.clone();
      const localFromRoot = new THREE.Matrix4()
        .copy(invRoot)
        .multiply(child.matrixWorld); // root^-1 * childWorld

      geom.applyMatrix4(localFromRoot);
      geom.computeVertexNormals(); // normals can change after baking
      geom.computeBoundingSphere();
      geom.computeBoundingBox();

      // Use the material as-is (OK for instancing);
      parts.push({
        geometry: geom,
        material: child.material,
      });
    });

    return parts;
  }, [scene]);
}

// Preload (public-relative paths)
useGLTF.preload("/models/tree/PineTrees2/PineTree1Decimated4589.glb"); // High
useGLTF.preload("/models/tree/PineTrees2/PineTree2MediumLODDecimated1668.glb"); // Medium
useGLTF.preload("/models/tree/PineTrees2/PineTree2LowLODDecimated89.glb"); // Low
