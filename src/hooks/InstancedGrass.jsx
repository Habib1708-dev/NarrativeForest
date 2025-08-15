import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/**
 * Loads a GLB of grass and returns an array of parts:
 *   [{ geometry, material, name, materialName }, ...]
 * Each mesh's world transform is baked into a cloned geometry so that
 * instancing uses the correct size/orientation without per-mesh transforms.
 *
 * Clean version: no console logging.
 */
export function useInstancedGrass(url) {
  const { scene } = useGLTF(url);

  return useMemo(() => {
    scene.updateMatrixWorld(true);

    const invRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const parts = [];

    scene.traverse((child) => {
      if (!child.isMesh) return;

      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const mat = mats[0];

      const geom = child.geometry.clone();
      const baked = new THREE.Matrix4()
        .copy(invRoot)
        .multiply(child.matrixWorld);
      geom.applyMatrix4(baked);
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      geom.computeBoundingBox(); // for bottom-align (optional)

      parts.push({
        geometry: geom,
        material: mat,
        name: child.name,
        materialName: mat?.name || "",
      });
    });

    return parts;
  }, [scene, url]);
}

// App loads from /public, not an absolute disk path:
useGLTF.preload("/models/plants/Grass.glb");
