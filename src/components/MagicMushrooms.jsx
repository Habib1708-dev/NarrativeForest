// src/components/MagicMushrooms.jsx
import React, { useEffect, useMemo, useRef, forwardRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

const MUSHROOM_GLB = "/models/magicPlantsAndCrystal/Mushroom.glb";

export default forwardRef(function MagicMushrooms(props, ref) {
  const { scene } = useGLTF(MUSHROOM_GLB);

  // Your original placements
  const INSTANCES = useMemo(
    () => [
      {
        position: [-2.487, -4.51, -1.836],
        rotation: [0, 0.0, 0.0],
        scale: 0.2,
      },
      {
        position: [-2.786, -4.394, -2.157],
        rotation: [0, Math.PI, 0.0],
        scale: 0.294,
      },
      {
        position: [-2.499, -4.449, -1.383],
        rotation: [0, 0.825, 0.062],
        scale: 0.16,
      },
      {
        position: [-2.69, -4.429, -3.001],
        rotation: [0, -Math.PI, 0.118],
        scale: 0.18,
      },
      {
        position: [-0.935, -4.167, -3.662],
        rotation: [0, 0.246, 0.117],
        scale: 0.15,
      },
      {
        position: [-1.888, -4.523, -3.583],
        rotation: [0, 1.71, -0.287],
        scale: 0.2,
      },
      {
        position: [-1.31, -4.78, -1.71],
        rotation: [0, 0.0, 0.117],
        scale: 0.19,
      },
    ],
    []
  );

  // Extract source meshes, bake world transform into cloned geometry,
  // and clone materials (transparent + no depthWrite).
  const sources = useMemo(() => {
    if (!scene) return [];
    const list = [];
    scene.updateMatrixWorld(true);

    scene.traverse((n) => {
      if (!n.isMesh) return;

      // Bake world matrix → geometry local space
      const g = n.geometry.clone();
      g.applyMatrix4(n.matrixWorld);
      g.computeBoundingBox();
      g.computeBoundingSphere();

      const srcMats = Array.isArray(n.material) ? n.material : [n.material];
      const clonedMats = srcMats.map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false; // soft intersections with fog/dither
        if (c.opacity === undefined) c.opacity = 1;
        c.needsUpdate = true;
        return c;
      });

      list.push({
        geometry: g,
        material: Array.isArray(n.material) ? clonedMats : clonedMats[0],
      });
    });

    return list;
  }, [scene]);

  const meshRefs = useRef([]);
  meshRefs.current = [];

  // Write per-instance transforms once
  useEffect(() => {
    if (!sources.length) return;
    const dummy = new THREE.Object3D();

    for (let s = 0; s < sources.length; s++) {
      const imesh = meshRefs.current[s];
      if (!imesh) continue;

      for (let i = 0; i < INSTANCES.length; i++) {
        const cfg = INSTANCES[i];
        dummy.position.set(cfg.position[0], cfg.position[1], cfg.position[2]);
        dummy.rotation.set(
          cfg.rotation[0] || 0,
          cfg.rotation[1] || 0,
          cfg.rotation[2] || 0
        );
        const sc = cfg.scale ?? 1;
        if (typeof sc === "number") dummy.scale.set(sc, sc, sc);
        else dummy.scale.set(sc[0], sc[1], sc[2]);
        dummy.updateMatrix();
        imesh.setMatrixAt(i, dummy.matrix);
      }
      imesh.instanceMatrix.needsUpdate = true;
    }
  }, [sources, INSTANCES]);

  if (!scene || sources.length === 0) return null;

  return (
    <group {...props} ref={ref} name="MagicMushrooms">
      {sources.map((src, idx) => (
        <instancedMesh
          key={idx}
          ref={(el) => (meshRefs.current[idx] = el)}
          args={[src.geometry, src.material, INSTANCES.length]}
          // Bake → identity; instances carry all placement
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          scale={[1, 1, 1]}
          castShadow
          receiveShadow
          frustumCulled={false} // important to avoid accidental culling
        />
      ))}
    </group>
  );
});

useGLTF.preload(MUSHROOM_GLB);
