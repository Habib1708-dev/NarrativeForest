// src/components/MagicFlowers.jsx
import React, { useEffect, useMemo, useRef, forwardRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

const FLOWERS_GLB = "/models/magicPlantsAndCrystal/PurpleFlowers.glb";

export default forwardRef(function MagicFlowers(props, ref) {
  const { scene } = useGLTF(FLOWERS_GLB);

  const INSTANCES = useMemo(
    () => [
      {
        position: [-0.822, -4.14, -3.5],
        rotation: [-0.059, 0, -0.117],
        scale: 0.1,
      },
      {
        position: [-0.8, -4.15, -3.6],
        rotation: [-0.352, 0.477, 0],
        scale: 0.1,
      },
      {
        position: [-0.912, -4.15, -3.56],
        rotation: [-0.117, 1.527, 0],
        scale: 0.1,
      },
      {
        position: [-2.42, -4.57, -1.42],
        rotation: [0, 0, -0.117],
        scale: 0.09,
      },
      {
        position: [-2.39, -4.59, -1.53],
        rotation: [0, 0, -0.059],
        scale: 0.09,
      },
      { position: [-2.35, -4.6, -1.66], rotation: [-0.258, 0, 0], scale: 0.06 },
      { position: [-2.38, -4.59, -1.418], rotation: [0, 0, 0], scale: 0.09 },
      {
        position: [-2.55, -4.22, -3.44],
        rotation: [-0.235, 0, 0.059],
        scale: 0.11,
      },
      {
        position: [-0.96, -4.28, -2.84],
        rotation: [-0.18, 0, -0.12],
        scale: 0.11,
      },
      { position: [-0.96, -4.29, -2.96], rotation: [-0.235, 0, 0], scale: 0.1 },
    ],
    []
  );

  const sources = useMemo(() => {
    if (!scene) return [];
    const list = [];
    scene.updateMatrixWorld(true);

    scene.traverse((n) => {
      if (!n.isMesh) return;

      const g = n.geometry.clone();
      g.applyMatrix4(n.matrixWorld);
      g.computeBoundingBox();
      g.computeBoundingSphere();

      const srcMats = Array.isArray(n.material) ? n.material : [n.material];
      const clonedMats = srcMats.map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
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
    <group {...props} ref={ref} name="MagicFlowers">
      {sources.map((src, idx) => (
        <instancedMesh
          key={idx}
          ref={(el) => (meshRefs.current[idx] = el)}
          args={[src.geometry, src.material, INSTANCES.length]}
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          scale={[1, 1, 1]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
});

useGLTF.preload(FLOWERS_GLB);
