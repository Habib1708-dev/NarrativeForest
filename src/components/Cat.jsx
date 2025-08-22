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

  // Leva transforms + appearance
  const {
    positionX,
    positionY,
    positionZ,
    rotationYDeg,
    scale,
    tintColor,
    tintIntensity,
  } = useControls({
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
      Appearance: folder({
        tintColor: { value: "#ffffff", label: "Tint Color" },
        tintIntensity: {
          value: 0.0,
          min: 0.0,
          max: 1.0,
          step: 0.01,
          label: "Tint Intensity",
        },
      }),
    }),
  });

  // Shadow setup, clone materials once, and stash original colors
  const originalColors = useRef(new Map()); // key: material.uuid -> THREE.Color
  useEffect(() => {
    if (!cloned) return;

    cloned.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;

        // If this mesh has a material or a material array, clone and record original colors
        const recordColor = (mat) => {
          if (!mat || !mat.color) return;
          // Clone material so tinting this mesh doesn’t affect others
          if (!originalColors.current.has(mat.uuid)) {
            // Ensure the mesh owns its material instance
            const clonedMat = mat.clone();
            o.material = clonedMat;
            originalColors.current.set(clonedMat.uuid, clonedMat.color.clone());
          }
        };

        if (Array.isArray(o.material)) {
          o.material = o.material.map((m) => {
            if (!originalColors.current.has(m.uuid)) {
              const cm = m.clone();
              originalColors.current.set(cm.uuid, cm.color?.clone?.() ?? null);
              return cm;
            }
            return m;
          });
        } else if (o.material) {
          recordColor(o.material);
        }
      }
    });
  }, [cloned]);

  // Apply tint whenever color/intensity changes
  useEffect(() => {
    if (!cloned) return;

    const target = new THREE.Color(tintColor);

    cloned.traverse((o) => {
      if (!o.isMesh || !o.material) return;

      const applyToMat = (mat) => {
        if (!mat || !mat.color) return;
        const base = originalColors.current.get(mat.uuid);
        if (!base) return;
        // color = mix(base, target, intensity)
        const mixed = base.clone().lerp(target, tintIntensity);
        mat.color.copy(mixed);
        mat.needsUpdate = true; // be safe
      };

      if (Array.isArray(o.material)) {
        o.material.forEach(applyToMat);
      } else {
        applyToMat(o.material);
      }
    });
  }, [cloned, tintColor, tintIntensity]);

  // Ensure play speed default
  useEffect(() => {
    if (mixer) mixer.timeScale = 1;
  }, [mixer]);

  // Make the whole Cat subtree visible to the fog depth pass (layer 4)
  useEffect(() => {
    if (!cloned) return;
    const setLayersRecursive = (obj, layerIndex) => {
      obj.layers.enable(layerIndex);
      obj.children?.forEach((c) => setLayersRecursive(c, layerIndex));
    };
    setLayersRecursive(cloned, 4);
  }, [cloned]);

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
