// src/components/Cat.jsx
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useControls, folder } from "leva";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

export default function Cat() {
  // Load cat GLB (resides under /public)
  const { scene, animations } = useGLTF("/models/cat/bicolor_cat.glb");

  // Clone to preserve skinned meshes/animations when reusing
  const cloned = useMemo(() => (scene ? skeletonClone(scene) : null), [scene]);

  // Root group for animation binding
  const groupRef = useRef();
  const { actions, names, mixer } = useAnimations(animations || [], groupRef);

  // Pick the first clip and play it
  useEffect(() => {
    if (!actions || !names || names.length === 0) return;
    const action = actions[names[0]];
    if (!action) return;
    action.reset().fadeIn(0.2).play();
    return () => action.fadeOut(0.2);
  }, [actions, names]);

  // Leva transforms
  const { positionX, positionY, positionZ, rotationYDeg, scale } = useControls({
    Cat: folder({
      Transform: folder({
        positionX: { value: -1.305, min: -50, max: 50, step: 0.001 },
        positionY: { value: -4.41, min: -50, max: 50, step: 0.001 },
        positionZ: { value: -2.86, min: -50, max: 50, step: 0.001 },
        rotationYDeg: {
          value: 180,
          min: -180,
          max: 180,
          step: 0.1,
          label: "Rotation Y (deg)",
        },
        scale: {
          value: 0.06,
          min: 0.001,
          max: 1,
          step: 0.001,
          label: "Uniform Scale",
        },
      }),
    }),
  });

  // Shadow setup and basic hygiene
  useEffect(() => {
    if (!cloned) return;
    cloned.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Animated/skinned meshes should avoid frustum culling popping
        o.frustumCulled = false;
      }
    });
  }, [cloned]);

  // Ensure play speed default
  useEffect(() => {
    if (mixer) mixer.timeScale = 1;
  }, [mixer]);

  if (!cloned) return null;

  const rotationY = THREE.MathUtils.degToRad(rotationYDeg || 0);

  return (
    <group
      ref={groupRef}
      name="Cat"
      dispose={null}
      position={[positionX, positionY, positionZ]}
      rotation={[0, rotationY, 0]}
      scale={scale}
    >
      <primitive object={cloned} />
    </group>
  );
}

useGLTF.preload("/models/cat/bicolor_cat.glb");
