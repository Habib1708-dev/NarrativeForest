// src/components/MagicMushrooms.jsx
import React, { useMemo, useRef, useEffect, forwardRef } from "react";
import * as THREE from "three";
import { useGLTF, Clone } from "@react-three/drei";
import { useControls, folder } from "leva";

const MUSHROOM_GLB = "/models/magicPlantsAndCrystal/Mushroom.glb"; // public/

export default forwardRef(function MagicMushrooms(props, ref) {
  const { scene } = useGLTF(MUSHROOM_GLB);

  // Optional: global tint (kept from your version)
  const { tintColor, tintIntensity } = useControls({
    Tint: folder({
      tintColor: { value: "#ffffff", label: "Color" },
      tintIntensity: {
        value: 0.0,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Intensity",
      },
    }),
  });

  // Collect materials to reapply tint on change
  const materialsRef = useRef(new Set());

  // Clone hook — also applies transparent + depthWrite=false to prevent fog clipping
  const onCloneRegister = (root) => {
    root.traverse((n) => {
      if (!n.isMesh) return;
      n.castShadow = true;
      n.receiveShadow = true;

      const mats = Array.isArray(n.material) ? n.material : [n.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        if (c.color && !c.userData._origColor) {
          c.userData._origColor = c.color.clone();
        }
        c.transparent = true; // sort with translucents
        c.depthWrite = false; // <-- key fix to avoid harsh fog clipping
        c.needsUpdate = true;
        materialsRef.current.add(c);
        return c;
      });
      n.material = Array.isArray(n.material) ? cloned : cloned[0];
    });

    // Apply current tint immediately for this clone
    applyTint();
  };

  const applyTint = () => {
    const target = new THREE.Color(tintColor);
    materialsRef.current.forEach((m) => {
      if (!m || !m.color) return;
      if (!m.userData._origColor) m.userData._origColor = m.color.clone();
      m.color.copy(m.userData._origColor).lerp(target, tintIntensity);
      m.needsUpdate = true;
    });
  };

  useEffect(() => {
    applyTint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tintColor, tintIntensity]);

  // Hard-coded mushrooms (your values)
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
        position: [-1.31, -4.58, -1.81],
        rotation: [0, 0.0, 0.117],
        scale: 0.15,
      },
    ],
    []
  );

  if (!scene) return null;

  return (
    <group {...props} ref={ref} name="MagicMushrooms">
      {INSTANCES.map((cfg, i) => (
        <group
          key={i}
          position={cfg.position}
          rotation={cfg.rotation}
          scale={cfg.scale}
        >
          <Clone object={scene} onClone={onCloneRegister} />
        </group>
      ))}
    </group>
  );
});

useGLTF.preload(MUSHROOM_GLB);
