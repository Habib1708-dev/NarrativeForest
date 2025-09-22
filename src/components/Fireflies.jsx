// src/components/Fireflies.jsx
import React, {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useControls, button } from "leva";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Per-crystal interactive fireflies
 *
 * Updated to use the exact positions and scales from UnifiedCrystalClusters component:
 * - 15 Crystal A instances
 * - 34 Crystal B instances
 * - 16 Crystal C instances
 * Total: 65 firefly spawn locations matching crystal positions
 *
 * Controls:
 * - Mount checkbox: toggles mounting/unmounting of fireflies
 * - Activate on Hover/Click: checkboxes to control activation methods
 * - Hover Detection Radius: controls the size of the hover interaction area
 * - Test All button: manually activates all fireflies for testing
 *
 * API (via ref):
 * - activateFireflies(crystalIndex): start emitting fireflies at crystal location
 * - deactivateFireflies(crystalIndex): stop emitting at crystal location
 * - clickFireflies(crystalIndex): trigger click activation at crystal location
 *
 * Behavior:
 * - Nothing renders until "Mount" is checked.
 * - Fireflies are invisible until first activated by hover/click interaction.
 * - Each crystal area has an invisible hit box for interaction.
 * - Hover activates fireflies immediately, they linger after hover ends.
 * - Click activates fireflies for a duration.
 * - Each crystal area is fully independent.
 * - Firefly spawn area size scales with crystal's scale property and hover radius.
 */ /* ---------------- Shaders ---------------- */

// Fragment: soft circular glow, with a density ramp based on (time - startTime)
const firefliesFragmentShader = `
uniform vec3  uColor;
uniform float uTime;
uniform float uVisible;    // 0 => fully hidden until first activation
uniform float uRamp;       // [0..1] density ramp since activation (probabilistic spawn gate)

varying float vProgress;
varying float vSeed;
varying float vAllow;      // 1 if this particle is allowed (lifecycle gates)

void main() {
  if (uVisible < 0.5) discard;
  if (vAllow   < 0.5) discard;
  // "Start from empty": probabilistic density gate using the particle's seed
  if (vSeed > uRamp) discard;

  vec2 uv = gl_PointCoord - vec2(0.5);
  float r = length(uv);
  if (r > 0.5) discard;

  // Soft Gaussian blob
  float x = r / 0.5;
  float blob = exp(-4.0 * x * x);

  // Fade in near bottom, fade out near top
  float fadeIn  = smoothstep(0.00, 0.08, vProgress);
  float fadeOut = 1.0 - smoothstep(0.92, 1.0, vProgress);

  // Twinkle near the top
  float nearTop = smoothstep(0.85, 1.0, vProgress);
  float twBase  = 0.5 + 0.5 * sin(uTime * 30.0 + vSeed * 12.0);
  float twinkle = mix(1.0, twBase, nearTop);

  float alpha = blob * fadeIn * fadeOut * twinkle;
  gl_FragColor = vec4(uColor, alpha);
}
`;

// Vertex: looped rise, lateral drift, and lifecycle / start-stop gating
const firefliesVertexShader = `
uniform float uPixelRatio;
uniform float uSize;
uniform float uTime;
uniform float uSpeed;
uniform float uWidth;
uniform float uHeight;
uniform float uDrift;

uniform float uEmitState;     // 1=emitting, 0=not emitting
uniform float uStopTime;      // last time we transitioned to "not emitting"
uniform float uStartTime;     // time when we transitioned to "emitting"

attribute float aScale;
attribute float aSpeed;
attribute float aPhase;
attribute float aSeed;

varying float vProgress;
varying float vSeed;
varying float vAllow;

void main() {
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);

  float k    = uSpeed * aSpeed;
  float sNow = uTime * k + aPhase;
  float p    = fract(sNow);
  vProgress  = p;
  vSeed      = aSeed;

  // ---- Lifecycle gates ----
  // 1) "No new births" after stopping: block generations strictly newer than stop generation
  float sOff   = uStopTime * k + aPhase;
  float genNow = floor(sNow);
  float genOff = floor(sOff);
  float allowStop = (uEmitState > 0.5) ? 1.0 : (genNow <= genOff ? 1.0 : 0.0);

  // 2) "Start from empty": only allow generations >= start generation (no pre-start births)
  float sStart   = uStartTime * k + aPhase;
  float genStart = floor(sStart);
  float allowStart = (genNow >= genStart) ? 1.0 : 0.0;

  vAllow = allowStop * allowStart;

  // Vertical rise
  modelPosition.y += p * uHeight;

  // Subtle lateral drift
  float halfW = uWidth * 0.5;
  float jitterAmp = halfW * uDrift;
  modelPosition.x += sin(sNow * 1.7 + aSeed * 6.2831) * jitterAmp;
  modelPosition.z += cos(sNow * 1.3 + aSeed * 3.1415) * jitterAmp;

  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;

  gl_PointSize = uSize * aScale * uPixelRatio;
  gl_PointSize *= (1.0 / -viewPosition.z);
}
`;

/* --------------- Crystal positions from UnifiedCrystalClusters --------------- */
// Crystal A positions (15 instances)
const BAKED_A = [
  { px: -2.6, py: -4.55, pz: -2.02, s: 0.15 },
  { px: -2.6, py: -4.57, pz: -2.06, s: 0.1 },
  { px: -1.01, py: -4.54, pz: -2.52, s: 0.13 },
  { px: -2.46, py: -4.64, pz: -1.93, s: 0.12 },
  { px: -2.36, py: -4.64, pz: -1.72, s: 0.132 },
  { px: -2.44, py: -4.51, pz: -1.7, s: 0.114 },
  { px: -2.57, py: -4.59, pz: -2.05, s: 0.08 },
  { px: -2.4, py: -4.61, pz: -1.46, s: 0.15 },
  { px: -2.37, py: -4.6, pz: -1.65, s: 0.06 },
  { px: -2.37, py: -4.6, pz: -1.6, s: 0.09 },
  { px: -2.37, py: -4.6, pz: -1.54, s: 0.114 },
  { px: -2.28, py: -4.69, pz: -1.62, s: 0.09 },
  { px: -2.6, py: -4.5, pz: -2.99, s: 0.12 },
  { px: -2.64, py: -4.56, pz: -2.25, s: 0.16 },
  { px: -2.58, py: -4.23, pz: -3.47, s: 0.14 },
];

// Crystal B positions (34 instances)
const BAKED_B = [
  { px: -2.32, py: -4.66, pz: -1.52, s: 0.077 },
  { px: -2.48, py: -4.71, pz: -1.97, s: 0.041 },
  { px: -2.23, py: -4.8, pz: -1.69, s: 0.068 },
  { px: -2.52, py: -4.62, pz: -2.22, s: 0.07 },
  { px: -0.98, py: -4.31, pz: -3.0, s: 0.079 },
  { px: -0.99, py: -4.28, pz: -0.19, s: 0.128 },
  { px: -1.03, py: -4.54, pz: -2.33, s: 0.05 },
  { px: -2.51, py: -4.26, pz: -3.5, s: 0.097 },
  { px: -2.54, py: -4.22, pz: -3.39, s: 0.077 },
  { px: -2.84, py: -4.59, pz: -2.98, s: 0.047 },
  { px: -2.56, py: -4.59, pz: -2.98, s: 0.047 },
  { px: -1.02, py: -4.42, pz: -3.14, s: 0.072 },
  { px: -2.04, py: -4.47, pz: -3.47, s: 0.067 },
  { px: -2.0, py: -4.48, pz: -3.49, s: 0.052 },
  { px: -2.45, py: -4.7, pz: -2.28, s: 0.052 },
  { px: -1.383, py: -4.841, pz: -1.92, s: 0.065 },
  { px: -2.449, py: -4.542, pz: -1.766, s: 0.102 },
  { px: -1.34, py: -4.72, pz: -1.813, s: 0.09 },
  { px: -1.663, py: -4.76, pz: -1.813, s: 0.08 },
  { px: -1.215, py: -4.767, pz: -1.86, s: 0.084 },
  { px: -2.49, py: -4.73, pz: -2.953, s: 0.074 },
  { px: -1.046, py: -4.561, pz: -2.467, s: 0.084 },
  { px: -0.822, py: -4.348, pz: -2.49, s: 0.086 },
  { px: -1.012, py: -4.36, pz: -2.888, s: 0.112 },
  { px: -1.047, py: -4.416, pz: -3.0, s: 0.107 },
  { px: -1.944, py: -4.7, pz: -1.92, s: 0.07 },
  { px: -2.48, py: -4.62, pz: -2.18, s: 0.067 },
  { px: -0.991, py: -4.72, pz: -2.075, s: 0.086 },
  { px: -0.986, py: -4.35, pz: -3.058, s: 0.105 },
  { px: -1.014, py: -4.336, pz: -2.972, s: 0.099 },
  { px: -0.991, py: -4.353, pz: -3.271, s: 0.105 },
  { px: -1.608, py: -4.653, pz: -3.753, s: 0.123 },
  { px: -1.327, py: -4.598, pz: -1.627, s: 0.07 },
  { px: -1.048, py: -4.579, pz: -2.374, s: 0.079 },
];

// Crystal C positions (16 instances)
const BAKED_C = [
  { px: -2.47, py: -4.56, pz: -1.5, s: 0.18 },
  { px: -2.22, py: -4.67, pz: -1.62, s: 0.13 },
  { px: -2.8, py: -4.47, pz: -2.9, s: 0.18 },
  { px: -2.48, py: -4.46, pz: -3.6, s: 0.12 },
  { px: -2.8, py: -4.48, pz: -3.121, s: 0.14 },
  { px: -2.6, py: -4.5, pz: -1.47, s: 0.16 },
  { px: -2.7, py: -4.53, pz: -2.2, s: 0.17 },
  { px: -0.97, py: -4.28, pz: -2.8, s: 0.14 },
  { px: -1.271, py: -4.542, pz: -1.626, s: 0.15 },
  { px: -1.551, py: -4.8, pz: -1.766, s: 0.2 },
  { px: -1.16, py: -4.77, pz: -1.86, s: 0.18 },
  { px: -1.16, py: -4.69, pz: -3.73, s: 0.18 },
  { px: -1.1, py: -4.59, pz: -2.37, s: 0.18 },
  { px: -2.39, py: -4.75, pz: -3.5, s: 0.19 },
  { px: -1.5, py: -4.73, pz: -3.68, s: 0.15 },
  { px: -2.94, py: -4.22, pz: -3.26, s: 0.12 },
];

// Combine all crystal positions
const BAKED = [...BAKED_A, ...BAKED_B, ...BAKED_C];
const COUNT_BOXES = BAKED.length;

// Stable RNG helper
const seeded = (i, salt = 1) => {
  const x = Math.sin((i + 1) * 12.9898 * (salt + 1)) * 43758.5453;
  return x - Math.floor(x);
};

export default forwardRef(function Fireflies(props, ref) {
  const { gl, clock } = useThree();

  /* ---------------------- Controls ---------------------- */
  const [mounted, setMounted] = useState(false); // nothing until Mount is checked
  // Local tick to force a re-render after async ref-based builds (geos/mats)
  const [buildVersion, setBuildVersion] = useState(0);

  const emissionPanel = useControls("Fireflies • Emission", {
    Mount: {
      value: false,
      label: "Mount Fireflies",
    },
    activateOnHover: {
      value: true,
      label: "Activate on Hover",
    },
    activateOnClick: {
      value: true,
      label: "Activate on Click",
    },
    hoverRadius: {
      value: 0.3,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      label: "Hover Detection Radius",
    },
    lingerSeconds: {
      value: 2.0,
      min: 0.2,
      max: 10.0,
      step: 0.1,
      label: "Tail after leave/click (s)",
    },
    birthRampSeconds: {
      value: 1.25,
      min: 0.0,
      max: 10.0,
      step: 0.05,
      label: "Fill-in time from empty (s)",
    },
    "Test All": button(() => {
      if (!mounted) return;
      const now = clock.getElapsedTime();
      for (let i = 0; i < COUNT_BOXES; i++) {
        hoverCountRef.current[i] = 1;
        everVisibleRef.current[i] = true;
        if (!emitOnRef.current[i]) startTimeRef.current[i] = now;
      }
    }),
  });
  const {
    Mount,
    lingerSeconds,
    birthRampSeconds,
    activateOnHover,
    activateOnClick,
    hoverRadius,
  } = emissionPanel;

  // Handle mounting logic
  useEffect(() => {
    setMounted(Mount);
    if (Mount) {
      const now = clock.getElapsedTime();
      // Reset all per-box state when mounting - start hidden, activate only on interaction
      hoverCountRef.current.fill(0);
      emitOnRef.current.fill(false);
      everVisibleRef.current.fill(false); // Hidden by default
      pulseUntilRef.current.fill(0);
      stopTimeRef.current.fill(0);
      startTimeRef.current.fill(now + 1e6); // Far future until first activation
      // Kick a frame so refs and uniforms propagate immediately
      try {
        gl?.invalidate?.();
      } catch {}
    }
  }, [Mount]);

  const lookPanel = useControls("Fireflies • Global", {
    perBoxCount: {
      value: 8, // Reduced from 40 since we now have 65 boxes instead of 8
      min: 0,
      max: 200,
      step: 1,
      label: "Particles per Box",
    },
    pointSizePx: {
      value: 8,
      min: 1,
      max: 200,
      step: 1,
      label: "Point Size (px)",
    },
    scaleMin: {
      value: 0.32,
      min: 0.01,
      max: 1.0,
      step: 0.01,
      label: "Per-Particle Scale Min",
    },
    scaleMax: {
      value: 1.0,
      min: 0.05,
      max: 2.0,
      step: 0.01,
      label: "Per-Particle Scale Max",
    },
    speed: { value: 0.2, min: 0.0, max: 5.0, step: 0.01, label: "Rise Speed" },
    width: {
      value: 0.15, // Adjusted to better match crystal scales
      min: 0.02,
      max: 10.0,
      step: 0.001,
      label: "Box Width (full, X=Z)",
    },
    height: {
      value: 0.3, // Slightly increased height for better visual effect
      min: 0.02,
      max: 10.0,
      step: 0.001,
      label: "Box Height (full)",
    },
    elevation: {
      value: 0.0,
      min: -5.0,
      max: 5.0,
      step: 0.001,
      label: "Elevation from Base",
    },
    drift: {
      value: 0.08,
      min: 0.0,
      max: 0.5,
      step: 0.001,
      label: "Lateral Drift (× half-width)",
    },
    color: { value: "#ffd79aff", label: "Particle Color" },
  });

  const {
    perBoxCount,
    pointSizePx,
    scaleMin,
    scaleMax,
    speed,
    width,
    height,
    elevation,
    drift,
    color,
  } = lookPanel;

  /* ------------------ Shared helpers ------------------ */
  const pixelRatioRef = useRef(1);
  useEffect(() => {
    pixelRatioRef.current = Math.min(
      gl.getPixelRatio ? gl.getPixelRatio() : 1,
      2
    );
  }, [gl]);

  const nPerBox = useMemo(
    () => Math.max(0, Math.floor(perBoxCount)),
    [perBoxCount]
  );

  /* ---------------- Per-box state & refs ---------------- */

  // Per-box interactivity state
  const hoverCountRef = useRef(Array(COUNT_BOXES).fill(0));
  const pulseUntilRef = useRef(Array(COUNT_BOXES).fill(0)); // absolute time until which we keep emitting
  const emitOnRef = useRef(Array(COUNT_BOXES).fill(false));
  const everVisibleRef = useRef(Array(COUNT_BOXES).fill(false));
  const stopTimeRef = useRef(Array(COUNT_BOXES).fill(0));
  const startTimeRef = useRef(
    Array(COUNT_BOXES).fill(clock.getElapsedTime() + 1e6)
  ); // big number until first start

  // Per-box geometry/material refs
  const geoRefs = useRef(Array(COUNT_BOXES).fill(null));
  const matRefs = useRef(Array(COUNT_BOXES).fill(null));
  const ptsRefs = useRef(Array(COUNT_BOXES).fill(null));

  // Build or rebuild geometry for a specific box
  const buildBoxGeometry = (boxIndex) => {
    const { px, py, pz, s } = BAKED[boxIndex];

    // Scale the firefly area based on the crystal's scale and hover radius
    const scaleMultiplier = Math.max(0.5, s / 0.1); // Normalize around 0.1 scale
    const half = Math.max(0.001, width * 0.5 * scaleMultiplier * hoverRadius);

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(nPerBox * 3);
    const aScale = new Float32Array(nPerBox);
    const aSpeed = new Float32Array(nPerBox);
    const aPhase = new Float32Array(nPerBox);
    const aSeed = new Float32Array(nPerBox);

    for (let k = 0; k < nPerBox; k++) {
      const rx = (Math.random() * 2 - 1) * half;
      const rz = (Math.random() * 2 - 1) * half;

      positions[k * 3 + 0] = px + rx;
      positions[k * 3 + 1] = py + elevation;
      positions[k * 3 + 2] = pz + rz;

      const rS = seeded(boxIndex * 100000 + k, 11);
      aScale[k] = THREE.MathUtils.lerp(scaleMin, scaleMax, rS);

      const rV = seeded(boxIndex * 100000 + k, 5);
      aSpeed[k] = THREE.MathUtils.lerp(0.75, 1.25, rV);

      aPhase[k] = seeded(boxIndex * 100000 + k, 7);
      aSeed[k] = seeded(boxIndex * 100000 + k, 13);
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aScale", new THREE.BufferAttribute(aScale, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeed, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    return geo;
  };

  // Rebuild all geometries on key changes
  useEffect(() => {
    if (!mounted) return;
    for (let i = 0; i < COUNT_BOXES; i++) {
      geoRefs.current[i]?.dispose?.();
      geoRefs.current[i] = buildBoxGeometry(i);
    }
    // Re-render so newly created geometries are attached in JSX
    setBuildVersion((v) => v + 1);
  }, [mounted, nPerBox, width, elevation, scaleMin, scaleMax, hoverRadius]);

  // (Re)create materials when mounted or when look changes
  useEffect(() => {
    if (!mounted) return;
    // dispose old
    for (let i = 0; i < COUNT_BOXES; i++) {
      matRefs.current[i]?.dispose?.();
      matRefs.current[i] = null;
    }
    for (let i = 0; i < COUNT_BOXES; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: firefliesVertexShader,
        fragmentShader: firefliesFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        uniforms: {
          uPixelRatio: { value: pixelRatioRef.current },
          uSize: { value: pointSizePx },
          uTime: { value: 0 },
          uSpeed: { value: speed },
          uWidth: { value: width },
          uHeight: { value: height },
          uDrift: { value: drift },
          uColor: { value: new THREE.Color(color) },

          uEmitState: { value: 0.0 },
          uStopTime: { value: 0.0 },
          uStartTime: { value: clock.getElapsedTime() + 1e6 },
          uVisible: { value: 0.0 },

          uRamp: { value: 0.0 }, // density ramp
        },
      });
      matRefs.current[i] = mat;
    }
    // Re-render so materials are present when JSX maps over refs
    setBuildVersion((v) => v + 1);
  }, [mounted, pointSizePx, speed, width, height, drift, color]);

  // Live uniforms sync across boxes
  useEffect(() => {
    for (let i = 0; i < COUNT_BOXES; i++) {
      const mat = matRefs.current[i];
      if (!mat) continue;
      mat.uniforms.uPixelRatio.value = Math.min(
        gl.getPixelRatio ? gl.getPixelRatio() : 1,
        2
      );
      mat.uniforms.uSize.value = pointSizePx;
      mat.uniforms.uSpeed.value = speed;
      mat.uniforms.uWidth.value = width;
      mat.uniforms.uHeight.value = height;
      mat.uniforms.uDrift.value = drift;
      mat.uniforms.uColor.value.set(color);
    }
  }, [gl, pointSizePx, speed, width, height, drift, color]);

  // Resize → DPR
  useEffect(() => {
    const onResize = () => {
      const pr = Math.min(gl.getPixelRatio ? gl.getPixelRatio() : 1, 2);
      pixelRatioRef.current = pr;
      for (let i = 0; i < COUNT_BOXES; i++) {
        const mat = matRefs.current[i];
        if (mat) mat.uniforms.uPixelRatio.value = pr;
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [gl]);

  // Animate time + per-box emission FSM
  useFrame(() => {
    if (!mounted) return;
    const now = clock.getElapsedTime();

    for (let i = 0; i < COUNT_BOXES; i++) {
      const mat = matRefs.current[i];
      if (!mat) continue;

      // update time
      mat.uniforms.uTime.value = now;

      const hovering = hoverCountRef.current[i] > 0;
      const pulsing = now < pulseUntilRef.current[i];
      const nextEmit = hovering || pulsing;
      const wasEmitting = emitOnRef.current[i];

      // Transition: off → on
      if (!wasEmitting && nextEmit) {
        emitOnRef.current[i] = true;
        everVisibleRef.current[i] = true;
        startTimeRef.current[i] = now; // record the start for "empty → fill" and start gate
      }

      // Transition: on → off
      if (wasEmitting && !nextEmit) {
        emitOnRef.current[i] = false;
        stopTimeRef.current[i] = now; // freeze "generation cutoff"
      }

      // Push uniforms
      const nextEmitState = emitOnRef.current[i] ? 1.0 : 0.0;
      const prevEmitState = mat.uniforms.uEmitState.value;
      mat.uniforms.uEmitState.value = nextEmitState;
      mat.uniforms.uStopTime.value = stopTimeRef.current[i];
      mat.uniforms.uStartTime.value = startTimeRef.current[i];
      mat.uniforms.uVisible.value = everVisibleRef.current[i] ? 1.0 : 0.0;

      // Density ramp since (per-box) start
      const dt = Math.max(0, now - startTimeRef.current[i]);
      const ramp =
        birthRampSeconds <= 0 ? 1.0 : Math.min(1.0, dt / birthRampSeconds);
      mat.uniforms.uRamp.value = ramp;

      // If emission state toggled this frame, ensure material sees the change
      if (prevEmitState !== nextEmitState) {
        mat.needsUpdate = true;
      }
    }
  });

  /* ------------------ Interaction System ------------------ */

  // Box transforms for invisible hit detection
  const boxWorlds = useMemo(() => {
    const fullW = Math.max(0.001, width);
    const fullH = Math.max(0.001, height);
    const halfH = fullH * 0.5;
    return BAKED.map(({ px, py, pz, s }) => {
      // Scale the interaction area based on crystal scale and hover radius
      const scaleMultiplier = Math.max(0.5, s / 0.1);
      const scaledW = fullW * scaleMultiplier * hoverRadius;
      const scaledH = fullH * scaleMultiplier;
      return {
        pos: [px, py + elevation + halfH * scaleMultiplier, pz],
        scl: [scaledW, scaledH, scaledW],
      };
    });
  }, [width, height, elevation, hoverRadius, buildVersion]);

  // Event handlers
  const handleOver = (i) => {
    if (!mounted || !activateOnHover) return;
    hoverCountRef.current[i] += 1;
  };

  const handleOut = (i) => {
    if (!mounted || !activateOnHover) return;
    hoverCountRef.current[i] = Math.max(0, hoverCountRef.current[i] - 1);
    if (hoverCountRef.current[i] === 0) {
      const now = clock.getElapsedTime();
      pulseUntilRef.current[i] = Math.max(
        pulseUntilRef.current[i],
        now + lingerSeconds
      );
    }
  };

  const handleClick = (i) => {
    if (!mounted || !activateOnClick) return;
    const now = clock.getElapsedTime();
    pulseUntilRef.current[i] = Math.max(
      pulseUntilRef.current[i],
      now + lingerSeconds
    );
    everVisibleRef.current[i] = true;
    if (!emitOnRef.current[i]) startTimeRef.current[i] = now;
  };

  /* ------------------ API for external activation ------------------ */

  // Expose methods to activate fireflies from external components
  useImperativeHandle(
    ref,
    () => ({
      activateFireflies: (crystalIndex) => {
        if (!mounted) return;
        const now = clock.getElapsedTime();
        hoverCountRef.current[crystalIndex] += 1;
        everVisibleRef.current[crystalIndex] = true;
        if (!emitOnRef.current[crystalIndex])
          startTimeRef.current[crystalIndex] = now;
      },
      deactivateFireflies: (crystalIndex) => {
        if (!mounted) return;
        hoverCountRef.current[crystalIndex] = Math.max(
          0,
          hoverCountRef.current[crystalIndex] - 1
        );
        if (hoverCountRef.current[crystalIndex] === 0) {
          const now = clock.getElapsedTime();
          pulseUntilRef.current[crystalIndex] = Math.max(
            pulseUntilRef.current[crystalIndex],
            now + lingerSeconds
          );
        }
      },
      clickFireflies: (crystalIndex) => {
        if (!mounted || !activateOnClick) return;
        const now = clock.getElapsedTime();
        pulseUntilRef.current[crystalIndex] = Math.max(
          pulseUntilRef.current[crystalIndex],
          now + lingerSeconds
        );
        everVisibleRef.current[crystalIndex] = true;
        if (!emitOnRef.current[crystalIndex])
          startTimeRef.current[crystalIndex] = now;
      },
    }),
    [mounted, activateOnClick, lingerSeconds]
  );

  /* --------------------------- Render --------------------------- */

  if (!mounted) return null;

  return (
    <group ref={ref} name="Fireflies" {...props}>
      {/* Per-crystal fireflies: A (0-14), B (15-48), C (49-64) */}
      {BAKED.map((crystal, i) => {
        const geo = geoRefs.current[i];
        const mat = matRefs.current[i];
        if (!geo || !mat) return null;

        // Determine crystal type for debugging
        const crystalType = i < 15 ? "A" : i < 49 ? "B" : "C";
        const typeIndex = i < 15 ? i : i < 49 ? i - 15 : i - 49;

        return (
          <points
            key={`pts-${crystalType}-${typeIndex}`}
            ref={(el) => (ptsRefs.current[i] = el)}
            geometry={geo}
            material={mat}
            frustumCulled={false}
          />
        );
      })}

      {/* Invisible hit boxes for interaction */}
      {boxWorlds.map(({ pos, scl }, i) => {
        const crystalType = i < 15 ? "A" : i < 49 ? "B" : "C";
        const typeIndex = i < 15 ? i : i < 49 ? i - 15 : i - 49;

        return (
          <mesh
            key={`hit-${crystalType}-${typeIndex}`}
            position={pos}
            scale={scl}
            onPointerOver={() => handleOver(i)}
            onPointerOut={() => handleOut(i)}
            onClick={() => handleClick(i)}
            frustumCulled={false}
            raycast={THREE.Mesh.prototype.raycast}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              transparent={true}
              opacity={0.0} // Completely invisible
              depthWrite={false}
              side={THREE.DoubleSide}
              color={"#000000"}
            />
          </mesh>
        );
      })}
    </group>
  );
});
