// src/components/Cabin.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useDebugStore } from "../../state/useDebugStore";

// ── Static defaults (used when debug panel is off) ──────────────────────────
const CABIN_DEFAULTS = Object.freeze({
  positionX: -2.4,
  positionY: -4.85,
  positionZ: -2.7,
  rotationYDeg: 180,
  scale: 0.07,
  tintColor: "#808080",
  tintIntensity: 0.75,
  bulbEnabled: true,
  bulbColor: "#ffdaad",
  bulbIntensity: 0.1,
  bulbSize: 0.01,
  bulbX: -1.71,
  bulbY: -4.56,
  bulbZ: -2.98,
  bulb2Enabled: true,
  bulb2Color: "#ffdaad",
  bulb2Intensity: 0.2,
  bulb2Size: 0.01,
  bulb2X: -1.75,
  bulb2Y: -4.58,
  bulb2Z: -2.27,
});

// ── Debug-only sub-component (mounts useControls only when debug is active) ─
function CabinDebugPanel({ onChange }) {
  const values = useControls({
    Cabin: folder({
      Transform: folder({
        positionX: { value: CABIN_DEFAULTS.positionX, min: -50, max: 50, step: 0.1 },
        positionY: { value: CABIN_DEFAULTS.positionY, min: -20, max: 20, step: 0.01 },
        positionZ: { value: CABIN_DEFAULTS.positionZ, min: -50, max: 50, step: 0.1 },
        rotationYDeg: {
          value: CABIN_DEFAULTS.rotationYDeg,
          min: -180,
          max: 180,
          step: 1,
          label: "Rotation Y (deg)",
        },
        scale: {
          value: CABIN_DEFAULTS.scale,
          min: 0.01,
          max: 5,
          step: 0.01,
          label: "Uniform Scale",
        },
      }),
      Tint: folder({
        tintColor: { value: CABIN_DEFAULTS.tintColor, label: "Tint Color" },
        tintIntensity: {
          value: CABIN_DEFAULTS.tintIntensity,
          min: 0,
          max: 1,
          step: 0.01,
          label: "Intensity",
        },
      }),

      // Bulb 1
      "Bulb Light": folder({
        bulbEnabled: { value: CABIN_DEFAULTS.bulbEnabled, label: "Enabled" },
        bulbColor: { value: CABIN_DEFAULTS.bulbColor, label: "Color" },
        bulbIntensity: {
          value: CABIN_DEFAULTS.bulbIntensity,
          min: 0,
          max: 2,
          step: 0.01,
          label: "Intensity",
        },
        bulbSize: {
          value: CABIN_DEFAULTS.bulbSize,
          min: 0.001,
          max: 0.1,
          step: 0.001,
          label: "Size",
        },
        bulbX: { value: CABIN_DEFAULTS.bulbX, min: -50, max: 50, step: 0.001, label: "X" },
        bulbY: { value: CABIN_DEFAULTS.bulbY, min: -50, max: 50, step: 0.01, label: "Y" },
        bulbZ: { value: CABIN_DEFAULTS.bulbZ, min: -50, max: 50, step: 0.01, label: "Z" },
      }),

      // Bulb 2
      "Bulb Light 2": folder({
        bulb2Enabled: { value: CABIN_DEFAULTS.bulb2Enabled, label: "Enabled" },
        bulb2Color: { value: CABIN_DEFAULTS.bulb2Color, label: "Color" },
        bulb2Intensity: {
          value: CABIN_DEFAULTS.bulb2Intensity,
          min: 0,
          max: 2,
          step: 0.01,
          label: "Intensity",
        },
        bulb2Size: {
          value: CABIN_DEFAULTS.bulb2Size,
          min: 0.001,
          max: 0.1,
          step: 0.001,
          label: "Size",
        },
        bulb2X: { value: CABIN_DEFAULTS.bulb2X, min: -50, max: 50, step: 0.001, label: "X" },
        bulb2Y: { value: CABIN_DEFAULTS.bulb2Y, min: -50, max: 50, step: 0.001, label: "Y" },
        bulb2Z: { value: CABIN_DEFAULTS.bulb2Z, min: -50, max: 50, step: 0.001, label: "Z" },
      }),
    }, { collapsed: true }),
  });

  useEffect(() => {
    onChange(values);
  }, [values, onChange]);

  return null;
}

export default forwardRef(function Cabin(_, ref) {
  const isDebugMode = useDebugStore((s) => s.isDebugMode);
  const [debugValues, setDebugValues] = useState(CABIN_DEFAULTS);

  // Resolve active values: debug panel overrides or static defaults
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
    bulb2Enabled,
    bulb2Color,
    bulb2Intensity,
    bulb2Size,
    bulb2X,
    bulb2Y,
    bulb2Z,
  } = isDebugMode ? debugValues : CABIN_DEFAULTS;

  // Load GLB from /public
  const { scene } = useGLTF("/models/cabin/Cabin2.glb");

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
        o.castShadow = false;
        o.receiveShadow = false;

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

  // Bulb positions
  const bulbPosition = useMemo(
    () => [bulbX, bulbY, bulbZ],
    [bulbX, bulbY, bulbZ]
  );
  const bulb2Position = useMemo(
    () => [bulb2X, bulb2Y, bulb2Z],
    [bulb2X, bulb2Y, bulb2Z]
  );

  // Helper to render a tiny emissive bulb + point light
  const Bulb = ({ position, color, size, intensity }) => (
    <group position={position}>
      <mesh scale={size} castShadow={false} receiveShadow={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1}
          metalness={0}
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        color={color}
        intensity={intensity}
        distance={2.5}
        decay={2}
        castShadow={false}
      />
    </group>
  );

  return (
    <group ref={rootRef} userData={{ noDistanceFade: true }}>
      {isDebugMode && <CabinDebugPanel onChange={setDebugValues} />}

      {/* Cabin model */}
      <group
        position={position}
        rotation={[0, rotationY, 0]}
        scale={scale}
        dispose={null}
      >
        <primitive object={clonedScene} />
      </group>

      {/* Bulb 1 */}
      {bulbEnabled && (
        <Bulb
          position={bulbPosition}
          color={bulbColor}
          size={bulbSize}
          intensity={bulbIntensity}
        />
      )}

      {/* Bulb 2 */}
      {bulb2Enabled && (
        <Bulb
          position={bulb2Position}
          color={bulb2Color}
          size={bulb2Size}
          intensity={bulb2Intensity}
        />
      )}
    </group>
  );
});

// Preload assets used here
useGLTF.preload("/models/cabin/Cabin2.glb");
