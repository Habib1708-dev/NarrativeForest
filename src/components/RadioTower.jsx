//src/components/RadioTower.jsx
import React, {
  forwardRef,
  useMemo,
  useRef,
  useEffect,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

export default forwardRef(function RadioTower(_, ref) {
  // NOTE: path is relative to /public. Space is URL-encoded.
  const glbPath = "/models/radioTower/Radio%20tower.glb";
  const { scene } = useGLTF(glbPath);

  // Deep clone so we can safely mutate materials/colors per-instance
  const cloned = useMemo(() => (scene ? skeletonClone(scene) : null), [scene]);

  // Expose a single root for external systems (e.g., fog occluders)
  const rootRef = useRef(null);
  useImperativeHandle(ref, () => rootRef.current, []);

  // Gather unique materials, record original colors once
  const materialsRef = useRef([]);
  useEffect(() => {
    if (!cloned) return;
    const mats = new Map();

    cloned.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;

      const arr = Array.isArray(o.material) ? o.material : [o.material];
      arr.forEach((m) => {
        if (!m) return;
        if (m.color && !m.userData._origColor) {
          m.userData._origColor = m.color.clone();
        }
        mats.set(m.uuid, m);
      });
    });

    materialsRef.current = Array.from(mats.values());
  }, [cloned]);

  // Controls
  const {
    positionX,
    positionY,
    positionZ,
    rotationYDeg,
    scale,
    heightScale,
    tintColor,
    tintIntensity,
  } = useControls({
    "Radio Tower": folder({
      Transform: folder({
        positionX: { value: 0.0, min: -200, max: 200, step: 0.01 },
        positionY: { value: -4.7, min: -200, max: 200, step: 0.01 },
        positionZ: { value: -1.9, min: -200, max: 200, step: 0.01 },
        rotationYDeg: {
          value: 0,
          min: -180,
          max: 180,
          step: 0.1,
          label: "Rotation Y (deg)",
        },
        scale: {
          value: 0.03,
          min: 0.001,
          max: 5,
          step: 0.001,
          label: "Uniform Scale",
        },
        heightScale: {
          value: 1.8,
          min: 0.1,
          max: 10,
          step: 0.01,
          label: "Height Scale (Y)",
        },
      }),
      Appearance: folder({
        tintColor: { value: "#ffffff", label: "Tint Color" },
        tintIntensity: {
          value: 0.0,
          min: 0,
          max: 1,
          step: 0.01,
          label: "Tint Intensity",
        },
      }),
    }),
  });

  // Apply tint
  useEffect(() => {
    const target = new THREE.Color(tintColor);
    materialsRef.current.forEach((m) => {
      if (!m || !m.color) return;
      if (!m.userData._origColor) m.userData._origColor = m.color.clone();
      // Lerp original -> target by intensity
      m.color.copy(m.userData._origColor).lerp(target, tintIntensity);
      m.needsUpdate = true;
    });
  }, [tintColor, tintIntensity]);

  // Compose transforms
  const position = useMemo(
    () => [positionX, positionY, positionZ],
    [positionX, positionY, positionZ]
  );
  const rotationY = useMemo(
    () => THREE.MathUtils.degToRad(rotationYDeg || 0),
    [rotationYDeg]
  );
  const scaleVec = useMemo(
    () => [scale, scale * heightScale, scale],
    [scale, heightScale]
  );

  if (!cloned) return null;

  return (
    <group ref={rootRef} name="RadioTower" dispose={null}>
      <group position={position} rotation={[0, rotationY, 0]} scale={scaleVec}>
        <primitive object={cloned} />
      </group>
    </group>
  );
});

useGLTF.preload("/models/radioTower/Radio%20tower.glb");
