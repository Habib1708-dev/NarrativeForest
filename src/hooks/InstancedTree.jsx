import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/**
 * Loads a GLTF and returns an array of parts: [{ geometry, material }, ...]
 * We BAKE each mesh's transform (incl. root scale) into its geometry so instancing
 * uses the correct real-world size without relying on node transforms.
 */
export function useInstancedTree(url) {
  const { scene } = useGLTF(url);

  return useMemo(() => {
    scene.updateMatrixWorld(true);

    const invRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const parts = [];

    scene.traverse((child) => {
      if (!child.isMesh) return;

      // Bake transform relative to GLTF root into a cloned geometry
      const geom = child.geometry.clone();
      const baked = new THREE.Matrix4()
        .copy(invRoot)
        .multiply(child.matrixWorld);
      geom.applyMatrix4(baked);
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      geom.computeBoundingBox();

      parts.push({
        geometry: geom,
        material: child.material, // share material (okay for instancing)
        name: child.name,
        materialName: child.material?.name || "", // <-- optional
      });
    });

    return parts;
  }, [scene]);
}

// Preload so Suspense batches fetches (paths are /public-relative)
useGLTF.preload("/models/tree/PineTrees2/PineTreeHighLOD6065.glb"); // High
useGLTF.preload("/models/tree/PineTrees2/PineTree2MediumLODDecimated1668.glb"); // Medium
useGLTF.preload("/models/tree/PineTrees2/PineTree2LowLODDecimated89.glb"); // Low
