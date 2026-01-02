// src/hooks/InstancedRocks.jsx
import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import performanceMonitor from "../utils/performanceMonitor";

/**
 * Loads a GLB of rocks and returns an array of parts:
 *   [{ geometry, material, name, materialName }, ...]
 * Each mesh's world transform is baked into a cloned geometry so that
 * instancing uses the correct size/orientation without per-mesh transforms.
 *
 * Clean version: no console logging.
 */
export function useInstancedRocks(url) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    if (scene) {
      performanceMonitor.endGLBLoad(url);
    }
  }, [scene, url]);

  return useMemo(() => {
    scene.updateMatrixWorld(true);

    const invRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const parts = [];

    scene.traverse((child) => {
      if (!child.isMesh) return;

      // InstancedMesh expects a single material
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const mat = mats[0];

      // Bake child world transform (relative to root) into a cloned geometry
      const geom = child.geometry.clone();
      // With (bake rotation + scale only):
      const bakedNoPos = new THREE.Matrix4()
        .copy(invRoot)
        .multiply(new THREE.Matrix4().extractRotation(child.matrixWorld));
      geom.applyMatrix4(bakedNoPos);
      geom.computeVertexNormals();
      geom.computeBoundingSphere();
      geom.computeBoundingBox(); // needed for bottom offsets

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

// Optionally preload your rocks model (paths are /public-relative)
useGLTF.preload("/models/rocks/MossRock.glb");
