import React, {
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

export default forwardRef(function Cabin(_, ref) {
  // Load GLB from /public
  const { scene } = useGLTF("/models/cabin/Cabin.glb");

  // Clone so this instance has its own materials/props
  const clonedScene = useMemo(() => (scene ? clone(scene) : null), [scene]);

  // Expose a root ref (for fog occluder usage)
  const rootRef = useRef(null);
  useImperativeHandle(ref, () => rootRef.current, []);

  // Collect unique materials for tinting
  const materialsRef = useRef([]);
  useEffect(() => {
    if (!clonedScene) return;
    const mats = new Map();

    clonedScene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;

        const arr = Array.isArray(o.material) ? o.material : [o.material];
        arr.forEach((m) => {
          if (!m) return;
          if (!m.userData._origColor && m.color) {
            m.userData._origColor = m.color.clone();
          }
          mats.set(m.uuid, m);
        });
      }
    });

    materialsRef.current = Array.from(mats.values());
  }, [clonedScene]);

  // Leva controls (use your provided defaults)
  const {
    positionX,
    positionY,
    positionZ,
    rotationYDeg,
    scale,
    tintColor,
    tintIntensity,
    bulbEnabled,
    bulbColor,
    bulbIntensity,
    bulbSize,
    bulbX,
    bulbY,
    bulbZ,
  } = useControls({
    Cabin: folder({
      Transform: folder({
        positionX: { value: -1.8, min: -50, max: 50, step: 0.1 },
        positionY: { value: -4.8, min: -20, max: 20, step: 0.1 },
        positionZ: { value: -2.7, min: -50, max: 50, step: 0.1 },
        rotationYDeg: {
          value: 180,
          min: -180,
          max: 180,
          step: 1,
          label: "Rotation Y (deg)",
        },
        scale: {
          value: 0.05,
          min: 0.01,
          max: 5,
          step: 0.01,
          label: "Uniform Scale",
        },
      }),
      Tint: folder({
        tintColor: { value: "#808080", label: "Tint Color" },
        tintIntensity: {
          value: 0.75,
          min: 0,
          max: 1,
          step: 0.01,
          label: "Intensity",
        },
      }),
      "Bulb Light": folder({
        bulbEnabled: { value: true, label: "Enabled" },
        bulbColor: { value: "#ffd8a8", label: "Color" },
        bulbIntensity: {
          value: 0.1,
          min: 0,
          max: 2,
          step: 0.01,
          label: "Intensity",
        },
        bulbSize: {
          value: 0.005,
          min: 0.001,
          max: 0.1,
          step: 0.001,
          label: "Size",
        },
        bulbX: { value: -1.308, min: -50, max: 50, step: 0.001, label: "X" },
        bulbY: { value: -4.59, min: -50, max: 50, step: 0.01, label: "Y" },
        bulbZ: { value: -2.9, min: -50, max: 50, step: 0.01, label: "Z" },
      }),
    }),
  });

  // Apply tint (lerp from original to target color by intensity)
  useEffect(() => {
    const target = new THREE.Color(tintColor);
    materialsRef.current.forEach((m) => {
      if (!m || !m.color) return;
      if (!m.userData._origColor) m.userData._origColor = m.color.clone();
      m.color.copy(m.userData._origColor).lerp(target, tintIntensity);
      m.needsUpdate = true;
    });
  }, [tintColor, tintIntensity]);

  const position = useMemo(
    () => [positionX, positionY, positionZ],
    [positionX, positionY, positionZ]
  );
  const rotationY = useMemo(
    () => THREE.MathUtils.degToRad(rotationYDeg),
    [rotationYDeg]
  );

  if (!clonedScene) return null;

  // Bulb position controlled via Leva (defaults near Man): [-1.3, -4.3, -2.9]
  const bulbPosition = useMemo(
    () => [bulbX, bulbY, bulbZ],
    [bulbX, bulbY, bulbZ]
  );

  return (
    <group ref={rootRef}>
      {/* Cabin model */}
      <group
        position={position}
        rotation={[0, rotationY, 0]}
        scale={scale}
        dispose={null}
      >
        <primitive object={clonedScene} />
      </group>

      {/* Miniature light bulb near the Man (absolute/world position) */}
      {bulbEnabled && (
        <group position={bulbPosition}>
          {/* Visible tiny bulb */}
          <mesh scale={bulbSize} castShadow={false} receiveShadow={false}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial
              color={bulbColor}
              emissive={bulbColor}
              emissiveIntensity={1}
              metalness={0}
              roughness={0.3}
              toneMapped={false}
            />
          </mesh>
          {/* Actual light source */}
          <pointLight
            color={bulbColor}
            intensity={bulbIntensity}
            distance={2.5}
            decay={2}
            castShadow={false}
          />
        </group>
      )}
    </group>
  );
});

useGLTF.preload("/models/cabin/Cabin.glb");
