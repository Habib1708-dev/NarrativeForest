import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/**
 * Loads a GLB of grass clumps and returns an array of parts:
 *   [{ geometry, material, name, materialName }, ...]
 * Bake rotation/scale (but not translation) relative to the root into
 * a cloned geometry so instancing works with per-instance matrices.
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
      // Bake rotation (and scale) relative to root, but not position
      const bakedNoPos = new THREE.Matrix4()
        .copy(invRoot)
        .multiply(new THREE.Matrix4().extractRotation(child.matrixWorld));
      geom.applyMatrix4(bakedNoPos);
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      geom.computeBoundingBox();

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

// Preload the model (paths are /public-relative)
useGLTF.preload("/models/plants/Grass.glb");
