// src/components/IntroButterfly.jsx
import React, {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useControls, folder } from "leva";

const DEFAULT_AREA_CENTER = Object.freeze([-0.131, -3.934, -5.104]);
const DEFAULT_AREA_SIZE = Object.freeze([0.439, 0.35, 5.0]);
const ZERO_VECTOR = Object.freeze([0, 0, 0]);
const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_FORWARD = new THREE.Vector3(0, 0, 1);
const Y_FLIP = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI
);
const PI2 = Math.PI * 2;
const EPSILON = 1e-6;
const randomPhase = () => Math.random() * Math.PI * 2;
const ensurePositive = (value, fallback) =>
  value > EPSILON ? value : Math.max(fallback, EPSILON);

const extractComponents = (value, fallback) => {
  if (value instanceof THREE.Vector3) {
    return [value.x, value.y, value.z];
  }
  if (Array.isArray(value)) {
    return [
      value[0] ?? fallback[0],
      value[1] ?? fallback[1],
      value[2] ?? fallback[2],
    ];
  }
  if (value && typeof value === "object") {
    return [
      value.x ?? fallback[0],
      value.y ?? fallback[1],
      value.z ?? fallback[2],
    ];
  }
  return [...fallback];
};

export default forwardRef(function IntroButterfly(
  {
    position = DEFAULT_AREA_CENTER,
    rotation,
    // -------- single, uniform world scale --------
    scale = 0.02,

    // shader params
    color = "#ffffff",
    flapFreq = 14.1,
    flapSpeed = 1.25,
    flapAmp = 1.04, // radians (~60°) peak open (rear only)

    // subtle variance (no vertical swing)
    noiseAmp = 0.3,
    noiseScale = 0.1,

    alphaCutoff = 0.02,
    doubleSide = true,
    depthWrite = false,
    texturePath = "/textures/butterfly/butterfly.png",

    // static vertical tilt (degrees)
    verticalTiltDeg = 62.3,

    // Leva control
    enableControls = true,

    // navigation envelope
    enableNavigation = true,
    navigationSpeed = 0.12,
    navigationNoiseAmp = 0.36,
    navigationNoiseVerticalAmp = 0.19,
    navigationNoiseFrequency = 0.7,
    speedToFlapRatio = 0.0,
    movementTiltFactor = 0.0,
    movementTiltLimit = 0,
    orientationSmoothing = 20.0,

    // habitat bounds
    showHabitatBounds = true,
    habitatWidth = DEFAULT_AREA_SIZE[0],
    habitatHeight = DEFAULT_AREA_SIZE[1],
    habitatDepth = DEFAULT_AREA_SIZE[2],
    habitatWireColor = "#7fc7ff",
    habitatWireOpacity = 0.45,

    // NEW: habitat transform controls (position + yaw)
    // baked default yaw (degrees)
    habitatYawDeg = -30.6,

    // waveform motion
    waveFrequency = 0.7,
    horizontalWaveAmp = 0.27,
    verticalWaveAmp = 0.35,
    forwardWaveAmp = 0.18,
    rephaseOnTurn = false,

    // glow
    enableGlow = true,
    glowIntensity = 1.0,
    glowSize = 1.15,
    glowColor = "#88ccff",

    controlsFolder = "IntroButterfly",
    ...rest
  },
  ref
) {
  const tex = useTexture(texturePath);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // we flip v in the shader

  const rootRef = useRef();
  const butterflyGroupRef = useRef();
  const matRef = useRef();
  const meshRef = useRef();
  const glowMatRef = useRef();
  const glowMeshRef = useRef();
  const navigationRef = useRef({
    progress: 0,
    direction: 1,
    travelPhase: 0,
    currentPosition: new THREE.Vector3(),
    basePosition: new THREE.Vector3(),
    lastPosition: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    lateralAxis: new THREE.Vector3(),
    targetQuaternion: new THREE.Quaternion(),
    lookAtMatrix: new THREE.Matrix4(),
    phase: randomPhase(),
    offsets: { x: randomPhase(), y: randomPhase(), z: randomPhase() },
  });
  const noiseSeed = useMemo(() => Math.random() * 1000, []);
  useImperativeHandle(ref, () => meshRef.current, []);

  // Base center from prop
  const [propCX, propCY, propCZ] = extractComponents(
    position,
    DEFAULT_AREA_CENTER
  );

  const rotationQuaternion = useMemo(() => {
    if (rotation == null) return null;
    const [rx, ry, rz] = extractComponents(rotation, ZERO_VECTOR);
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  }, [rotation]);

  // Leva controls
  const leva = useControls(
    enableControls
      ? {
          [controlsFolder]: folder(
            {
              // ------ visual / wings ------
              scale: { value: scale, min: 0.001, max: 1.0, step: 0.001 },
              color: { value: color },
              flapFreq: { value: flapFreq, min: 0.1, max: 20, step: 0.1 },
              flapSpeed: { value: flapSpeed, min: 0.0, max: 4.0, step: 0.05 },
              flapAmp: { value: flapAmp, min: 0.0, max: 1.5, step: 0.01 },
              verticalTiltDeg: {
                value: verticalTiltDeg,
                min: -90,
                max: 90,
                step: 0.1,
                label: "Vertical Tilt (deg)",
              },
              noiseAmp: { value: noiseAmp, min: 0.0, max: 0.3, step: 0.005 },
              noiseScale: { value: noiseScale, min: 0.1, max: 10.0, step: 0.1 },
              alphaCutoff: {
                value: alphaCutoff,
                min: 0.0,
                max: 0.2,
                step: 0.001,
              },

              // ------ navigation ------
              enableNavigation: { value: enableNavigation },
              navigationSpeed: {
                value: navigationSpeed,
                min: 0.0,
                max: 0.5,
                step: 0.005,
                label: "Nav Speed (UI x0.25)",
              },
              navigationNoiseAmp: {
                value: navigationNoiseAmp,
                min: 0.0,
                max: 0.5,
                step: 0.005,
                label: "Nav Noise (lateral)",
              },
              navigationNoiseVerticalAmp: {
                value: navigationNoiseVerticalAmp,
                min: 0.0,
                max: 0.5,
                step: 0.005,
                label: "Nav Noise (vertical)",
              },
              navigationNoiseFrequency: {
                value: navigationNoiseFrequency,
                min: 0.0,
                max: 5.0,
                step: 0.01,
                label: "Nav Noise Freq",
              },
              speedToFlapRatio: {
                value: speedToFlapRatio,
                min: 0.0,
                max: 12.0,
                step: 0.1,
                label: "Speed → Flap Ratio",
              },
              movementTiltFactor: {
                value: movementTiltFactor,
                min: 0.0,
                max: 2.0,
                step: 0.05,
                label: "Tilt Follow",
              },
              movementTiltLimit: {
                value: movementTiltLimit,
                min: 0,
                max: 60,
                step: 1,
                label: "Tilt Limit (deg)",
              },
              orientationSmoothing: {
                value: orientationSmoothing,
                min: 0.0,
                max: 20.0,
                step: 0.1,
                label: "Orientation Smooth",
              },

              // ------ waveform motion ------
              waveFrequency: {
                value: waveFrequency,
                min: 0.05,
                max: 5.0,
                step: 0.01,
                label: "Wave Frequency",
              },
              horizontalWaveAmp: {
                value: horizontalWaveAmp,
                min: 0.0,
                max: 1.5,
                step: 0.01,
                label: "Horiz Wave Amp",
              },
              verticalWaveAmp: {
                value: verticalWaveAmp,
                min: 0.0,
                max: 1.5,
                step: 0.01,
                label: "Vert Wave Amp",
              },
              forwardWaveAmp: {
                value: forwardWaveAmp,
                min: 0.0,
                max: 1.0,
                step: 0.01,
                label: "Forward Wave",
              },
              rephaseOnTurn: { value: rephaseOnTurn, label: "Rephase On Turn" },

              // ------ habitat transform (NEW) ------
              showHabitatBounds: {
                value: showHabitatBounds,
                label: "Show Habitat",
              },
              habitatCenterX: { value: propCX, min: -10, max: 10, step: 0.001 },
              habitatCenterY: { value: propCY, min: -10, max: 10, step: 0.001 },
              habitatCenterZ: { value: propCZ, min: -10, max: 10, step: 0.001 },
              habitatYawDeg: {
                value: habitatYawDeg,
                min: -180,
                max: 180,
                step: 0.1,
                label: "Habitat Yaw (deg)",
              },

              // size + debug styling
              habitatWidth: {
                value: habitatWidth,
                min: 0.1,
                max: 5.0,
                step: 0.01,
                label: "Habitat Width",
              },
              habitatHeight: {
                value: habitatHeight,
                min: 0.1,
                max: 5.0,
                step: 0.01,
                label: "Habitat Height",
              },
              habitatDepth: {
                value: habitatDepth,
                min: 0.1,
                max: 5.0,
                step: 0.01,
                label: "Habitat Depth",
              },
              habitatWireColor: {
                value: habitatWireColor,
                label: "Wire Color",
              },
              habitatWireOpacity: {
                value: habitatWireOpacity,
                min: 0.0,
                max: 1.0,
                step: 0.01,
                label: "Wire Opacity",
              },

              // ------ glow ------
              enableGlow: { value: enableGlow },
              glowIntensity: {
                value: glowIntensity,
                min: 0.0,
                max: 5.0,
                step: 0.05,
              },
              glowSize: { value: glowSize, min: 1.0, max: 2.0, step: 0.01 },
              glowColor: { value: glowColor },
            },
            { collapsed: false }
          ),
        }
      : {}
  );

  const resolveControl = (key, fallback) =>
    enableControls ? leva?.[key] ?? fallback : fallback;

  // Live habitat transform (position + yaw)
  const centerX = resolveControl("habitatCenterX", propCX);
  const centerY = resolveControl("habitatCenterY", propCY);
  const centerZ = resolveControl("habitatCenterZ", propCZ);
  const center = useMemo(
    () => new THREE.Vector3(centerX, centerY, centerZ),
    [centerX, centerY, centerZ]
  );

  const yawDeg = resolveControl("habitatYawDeg", habitatYawDeg);
  const yawRad = THREE.MathUtils.degToRad(yawDeg);
  const yawQuat = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(UP, yawRad),
    [yawRad]
  );

  const currentHabitatWidth = ensurePositive(
    resolveControl("habitatWidth", habitatWidth),
    DEFAULT_AREA_SIZE[0]
  );
  const currentHabitatHeight = ensurePositive(
    resolveControl("habitatHeight", habitatHeight),
    DEFAULT_AREA_SIZE[1]
  );
  const currentHabitatDepth = ensurePositive(
    resolveControl("habitatDepth", habitatDepth),
    DEFAULT_AREA_SIZE[2]
  );
  const currentShowHabitat = !!resolveControl(
    "showHabitatBounds",
    showHabitatBounds
  );
  const currentWireColor = resolveControl("habitatWireColor", habitatWireColor);
  const currentWireOpacity = resolveControl(
    "habitatWireOpacity",
    habitatWireOpacity
  );

  const currentWaveFrequency = resolveControl("waveFrequency", waveFrequency);
  const currentHorizontalWaveAmp = resolveControl(
    "horizontalWaveAmp",
    horizontalWaveAmp
  );
  const currentVerticalWaveAmp = resolveControl(
    "verticalWaveAmp",
    verticalWaveAmp
  );
  const currentForwardWaveAmp = resolveControl(
    "forwardWaveAmp",
    forwardWaveAmp
  );
  const currentRephaseOnTurn = resolveControl("rephaseOnTurn", rephaseOnTurn);

  // Rotated habitat basis vectors
  const right = useMemo(
    () => new THREE.Vector3(1, 0, 0).applyQuaternion(yawQuat),
    [yawQuat]
  );
  const up = UP; // unchanged
  const forward = useMemo(
    () => DEFAULT_FORWARD.clone().applyQuaternion(yawQuat),
    [yawQuat]
  );

  // Derived habitat basis
  const navBasis = useMemo(() => {
    const halfWidth = currentHabitatWidth * 0.5;
    const halfHeight = currentHabitatHeight * 0.5;
    const halfDepth = currentHabitatDepth * 0.5;
    const start = center.clone().addScaledVector(forward, -halfDepth);
    const end = center.clone().addScaledVector(forward, halfDepth);
    return {
      center,
      halfWidth,
      halfHeight,
      halfDepth,
      distance: Math.max(currentHabitatDepth, EPSILON),
      start,
      end,
      right,
      up,
      forward,
      yawRad,
    };
  }, [
    center,
    currentHabitatWidth,
    currentHabitatHeight,
    currentHabitatDepth,
    right,
    up,
    forward,
  ]);

  // init nav state on basis change
  useEffect(() => {
    const nav = navigationRef.current;
    nav.progress = 0;
    nav.direction = 1;
    nav.travelPhase = 0;
    nav.currentPosition.copy(navBasis.start);
    nav.lastPosition.copy(navBasis.start);
    nav.basePosition.copy(navBasis.start);
    nav.forward.copy(navBasis.forward);
    nav.phase = randomPhase();
    nav.offsets = { x: randomPhase(), y: randomPhase(), z: randomPhase() };
    if (butterflyGroupRef.current) {
      butterflyGroupRef.current.position.copy(navBasis.start);
      butterflyGroupRef.current.quaternion.identity();
    }
  }, [navBasis]);

  // Plane geometry (world size controlled only by `scale`)
  const args = useMemo(() => [1, 1, 12, 12], []);

  // ----------------- SHADERS -----------------
  const vertex = useMemo(
    () => /* glsl */ `
    // Simplex noise (Ashima, 3D)
    vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
    vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
    vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v){
      const vec2  C = vec2(1.0/6.0, 1.0/3.0);
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute( permute( permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 1.0/7.0;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a1.xy,h.y);
      vec3 p2 = vec3(a0.zw,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,p3)));
    }

    uniform float uTime;
    uniform float uFlapFreq;
    uniform float uFlapSpeed;
    uniform float uFlapAmp;
    uniform float uNoiseAmp;
    uniform float uNoiseScale;
    uniform float uTiltStatic; // static vertical tilt (radians)

    varying vec2 vUv;

    vec3 rotateY(vec3 p, float a){
      float s = sin(a), c = cos(a);
      return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
    }
    vec3 rotateX(vec3 p, float a){
      float s = sin(a), c = cos(a);
      return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
    }

    void main() {
      vUv = vec2(uv.x, 1.0 - uv.y);
      float phase = uTime * uFlapFreq * uFlapSpeed;
      float baseMag = abs(sin(phase)) * uFlapAmp;
      float flutter = snoise(vec3(position.xy * uNoiseScale, uTime * 0.5)) * uNoiseAmp;
      float angleMag = clamp(baseMag + flutter * 0.2, 0.0, uFlapAmp);
      float side = sign(position.x);
      float angleY = side * angleMag;
      float angleX = uTiltStatic;

      vec3 p = position;
      p = rotateY(p, angleY);
      p = rotateX(p, angleX);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
    []
  );

  const fragment = useMemo(
    () => /* glsl */ `
    uniform sampler2D uTexture;
    uniform vec3 uColor;
    uniform float uAlphaCutoff;
    varying vec2 vUv;

    void main(){
      vec4 texel = texture2D(uTexture, vUv);
      if (texel.a <= uAlphaCutoff) discard;
      vec3 color = texel.rgb * uColor;
      gl_FragColor = vec4(color, texel.a);
    }
  `,
    []
  );

  const glowFragment = useMemo(
    () => /* glsl */ `
    uniform sampler2D uTexture;
    uniform vec3 uGlowColor;
    uniform float uGlowIntensity;
    uniform float uAlphaCutoff;
    varying vec2 vUv;

    void main(){
      vec4 texel = texture2D(uTexture, vUv);
      float a = smoothstep(uAlphaCutoff, 1.0, texel.a) * uGlowIntensity;
      gl_FragColor = vec4(uGlowColor * a, a);
    }
  `,
    []
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTexture: { value: tex },
      uColor: { value: new THREE.Color(color) },
      uFlapFreq: { value: flapFreq },
      uFlapSpeed: { value: flapSpeed },
      uFlapAmp: { value: flapAmp },
      uNoiseAmp: { value: noiseAmp },
      uNoiseScale: { value: noiseScale },
      uAlphaCutoff: { value: alphaCutoff },
      uTiltStatic: { value: THREE.MathUtils.degToRad(verticalTiltDeg) },
    }),
    [
      tex,
      color,
      flapFreq,
      flapSpeed,
      flapAmp,
      noiseAmp,
      noiseScale,
      alphaCutoff,
      verticalTiltDeg,
    ]
  );

  const glowUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTexture: { value: tex },
      uFlapFreq: { value: flapFreq },
      uFlapSpeed: { value: flapSpeed },
      uFlapAmp: { value: flapAmp },
      uNoiseAmp: { value: noiseAmp },
      uNoiseScale: { value: noiseScale },
      uAlphaCutoff: { value: alphaCutoff },
      uGlowColor: { value: new THREE.Color(glowColor) },
      uGlowIntensity: { value: glowIntensity },
      uTiltStatic: { value: THREE.MathUtils.degToRad(verticalTiltDeg) },
    }),
    [
      tex,
      flapFreq,
      flapSpeed,
      flapAmp,
      noiseAmp,
      noiseScale,
      alphaCutoff,
      glowColor,
      glowIntensity,
      verticalTiltDeg,
    ]
  );

  // helper to clamp inside rotated box using local coordinates (right/up/forward)
  const clampToHabitat = (p, basis) => {
    // vector from center
    const v = p.clone().sub(basis.center);
    // local coordinates
    const x = v.dot(basis.right);
    const y = v.dot(basis.up);
    const z = v.dot(basis.forward);

    const cx = THREE.MathUtils.clamp(x, -basis.halfWidth, basis.halfWidth);
    const cy = THREE.MathUtils.clamp(y, -basis.halfHeight, basis.halfHeight);
    const cz = THREE.MathUtils.clamp(z, -basis.halfDepth, basis.halfDepth);

    // reconstruct world position
    return basis.center
      .clone()
      .addScaledVector(basis.right, cx)
      .addScaledVector(basis.up, cy)
      .addScaledVector(basis.forward, cz);
  };

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const ctrl = enableControls ? leva : undefined;

    const navEnabled =
      (enableControls ? ctrl?.enableNavigation : enableNavigation) ??
      enableNavigation;

    const rawNavSpeed =
      (enableControls ? ctrl?.navigationSpeed : navigationSpeed) ??
      navigationSpeed;
    const navSpeedValue = rawNavSpeed * 0.25;

    const navNoiseLateral =
      (enableControls ? ctrl?.navigationNoiseAmp : navigationNoiseAmp) ??
      navigationNoiseAmp;
    const navNoiseVertical =
      (enableControls
        ? ctrl?.navigationNoiseVerticalAmp
        : navigationNoiseVerticalAmp) ?? navigationNoiseVerticalAmp;
    const navNoiseFreq =
      (enableControls
        ? ctrl?.navigationNoiseFrequency
        : navigationNoiseFrequency) ?? navigationNoiseFrequency;

    const flapRatio =
      (enableControls ? ctrl?.speedToFlapRatio : speedToFlapRatio) ??
      speedToFlapRatio;
    const tiltFollow =
      (enableControls ? ctrl?.movementTiltFactor : movementTiltFactor) ??
      movementTiltFactor;
    const tiltLimit =
      (enableControls ? ctrl?.movementTiltLimit : movementTiltLimit) ??
      movementTiltLimit;
    const orientSmooth =
      (enableControls ? ctrl?.orientationSmoothing : orientationSmoothing) ??
      orientationSmoothing;

    const nav = navigationRef.current;
    const distance = navBasis.distance;
    let speed = 0;

    if (navEnabled && distance > EPSILON) {
      const waveSpeed = Math.max(navSpeedValue, 0.02);
      const prevPhase = nav.travelPhase;
      nav.travelPhase += delta * waveSpeed;

      // depth motion (out and back) along rotated forward
      const depthCos = Math.cos(nav.travelPhase * Math.PI * 2.0);
      const normalized = -depthCos;

      // detect U-turns
      const derivBefore = Math.sin(prevPhase * Math.PI * 2.0);
      const derivAfter = Math.sin(nav.travelPhase * Math.PI * 2.0);
      const turning = derivBefore * derivAfter < 0;
      if (turning) {
        nav.direction *= -1;
        if (currentRephaseOnTurn) {
          nav.phase = randomPhase();
          nav.offsets.x = randomPhase();
          nav.offsets.y = randomPhase();
          nav.offsets.z = randomPhase();
        }
      }
      nav.progress = (normalized + 1) * 0.5;

      nav.phase += delta * currentWaveFrequency * waveSpeed * nav.direction;

      // base position on the rotated forward axis
      nav.basePosition
        .copy(navBasis.center)
        .addScaledVector(navBasis.forward, normalized * navBasis.halfDepth);

      const phase = nav.phase;
      const sinPhase = Math.sin(phase + nav.offsets.x);
      const cosPhase = Math.cos(phase * 1.3 + nav.offsets.y);
      const forwardPhase = Math.sin(phase * 0.7 + nav.offsets.z);

      const noisePhase = noiseSeed + t * navNoiseFreq;
      const lateralNoise =
        Math.sin(noisePhase + nav.offsets.x * 1.7) * navNoiseLateral;
      const verticalNoise =
        Math.cos(noisePhase * 1.9 + nav.offsets.y * 2.3) * navNoiseVertical;

      // compose in local basis (right/up/forward)
      nav.currentPosition
        .copy(navBasis.center)
        .addScaledVector(
          navBasis.right,
          sinPhase * navBasis.halfWidth * currentHorizontalWaveAmp +
            lateralNoise * navBasis.halfWidth
        )
        .addScaledVector(
          navBasis.up,
          cosPhase * navBasis.halfHeight * currentVerticalWaveAmp +
            verticalNoise * navBasis.halfHeight
        )
        .addScaledVector(
          navBasis.forward,
          normalized * navBasis.halfDepth +
            forwardPhase * navBasis.halfDepth * currentForwardWaveAmp
        );

      // clamp inside rotated box
      nav.currentPosition.copy(clampToHabitat(nav.currentPosition, navBasis));

      nav.velocity.copy(nav.currentPosition).sub(nav.lastPosition);
      if (delta > EPSILON) nav.velocity.divideScalar(delta);
      speed = nav.velocity.length();

      if (nav.velocity.lengthSq() > EPSILON) {
        nav.forward.copy(nav.velocity).normalize();
      } else {
        // fallback forward along habitat forward direction
        const d = Math.sin(nav.travelPhase * Math.PI * 2.0);
        nav.forward
          .copy(navBasis.forward)
          .multiplyScalar(Math.sign(d) || nav.direction);
      }

      nav.lastPosition.copy(nav.currentPosition);
    } else {
      nav.basePosition.copy(navBasis.center);
      nav.currentPosition.copy(navBasis.center);
      nav.velocity.set(0, 0, 0);
      nav.forward.copy(navBasis.forward);
      nav.lastPosition.copy(nav.currentPosition);
      nav.phase += delta * currentWaveFrequency * 0.1;
    }

    if (butterflyGroupRef.current) {
      butterflyGroupRef.current.position.copy(nav.currentPosition);
    }

    // look-at target one unit ahead along current forward
    nav.basePosition.copy(nav.currentPosition).add(nav.forward);
    nav.lookAtMatrix.lookAt(nav.currentPosition, nav.basePosition, UP);
    nav.targetQuaternion.setFromRotationMatrix(nav.lookAtMatrix);
    nav.targetQuaternion.multiply(Y_FLIP);
    if (rotationQuaternion) nav.targetQuaternion.multiply(rotationQuaternion);

    if (butterflyGroupRef.current) {
      if (orientSmooth <= 0) {
        butterflyGroupRef.current.quaternion.copy(nav.targetQuaternion);
      } else {
        const alpha = THREE.MathUtils.clamp(
          1 - Math.exp(-orientSmooth * delta),
          0,
          1
        );
        butterflyGroupRef.current.quaternion.slerp(nav.targetQuaternion, alpha);
      }
    }

    const baseColor = ctrl?.color ?? color;
    const baseFlapFreq = ctrl?.flapFreq ?? flapFreq;
    const flapSpeedValue = ctrl?.flapSpeed ?? flapSpeed;
    const flapAmpValue = ctrl?.flapAmp ?? flapAmp;
    const wingNoiseAmp = ctrl?.noiseAmp ?? noiseAmp;
    const wingNoiseScale = ctrl?.noiseScale ?? noiseScale;
    const alphaCut = ctrl?.alphaCutoff ?? alphaCutoff;
    const glowColorValue = ctrl?.glowColor ?? glowColor;
    const glowIntensityValue = ctrl?.glowIntensity ?? glowIntensity;
    const scaleValue = ctrl?.scale ?? scale;
    const glowSizeValue = ctrl?.glowSize ?? glowSize;

    const dynamicFlapFreq = baseFlapFreq + speed * flapRatio;

    const baseTiltDeg =
      (enableControls ? ctrl?.verticalTiltDeg : verticalTiltDeg) ??
      verticalTiltDeg;
    const horizontalMag = Math.sqrt(
      nav.forward.x * nav.forward.x + nav.forward.z * nav.forward.z
    );
    const slopeAngle = Math.atan2(nav.forward.y, horizontalMag || 1e-6);
    const motionTiltDeg = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(slopeAngle) * tiltFollow,
      -tiltLimit,
      tiltLimit
    );
    const tiltDeg = baseTiltDeg + motionTiltDeg;
    const tiltRad = THREE.MathUtils.degToRad(tiltDeg);

    if (matRef.current) {
      const u = matRef.current.uniforms;
      u.uTime.value = t;
      if (typeof baseColor === "string") u.uColor.value.set(baseColor);
      u.uFlapFreq.value = dynamicFlapFreq;
      u.uFlapSpeed.value = flapSpeedValue;
      u.uFlapAmp.value = flapAmpValue;
      u.uNoiseAmp.value = wingNoiseAmp;
      u.uNoiseScale.value = wingNoiseScale;
      u.uAlphaCutoff.value = alphaCut;
      u.uTiltStatic.value = tiltRad;
    }

    if (glowMatRef.current) {
      const u = glowMatRef.current.uniforms;
      u.uTime.value = t;
      u.uFlapFreq.value = dynamicFlapFreq;
      u.uFlapSpeed.value = flapSpeedValue;
      u.uFlapAmp.value = flapAmpValue;
      u.uNoiseAmp.value = wingNoiseAmp;
      u.uNoiseScale.value = wingNoiseScale;
      u.uAlphaCutoff.value = alphaCut;
      if (typeof glowColorValue === "string")
        u.uGlowColor.value.set(glowColorValue);
      u.uGlowIntensity.value = glowIntensityValue;
      u.uTiltStatic.value = tiltRad;
    }

    if (meshRef.current)
      meshRef.current.scale.set(scaleValue, scaleValue, scaleValue);
    if (glowMeshRef.current) {
      const gs = scaleValue * glowSizeValue;
      glowMeshRef.current.scale.set(gs, gs, gs);
    }
  });

  const showGlow = enableControls ? leva?.enableGlow ?? enableGlow : enableGlow;

  const habitatArgs = useMemo(
    () => [currentHabitatWidth, currentHabitatHeight, currentHabitatDepth],
    [currentHabitatWidth, currentHabitatHeight, currentHabitatDepth]
  );

  return (
    <group ref={rootRef} {...rest}>
      {currentShowHabitat && (
        <group position={navBasis.center} rotation={[0, navBasis.yawRad, 0]}>
          <mesh frustumCulled={false}>
            <boxGeometry args={habitatArgs} />
            <meshBasicMaterial
              color={currentWireColor}
              wireframe
              transparent
              opacity={currentWireOpacity}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      <group ref={butterflyGroupRef}>
        <mesh ref={meshRef}>
          <planeGeometry args={args} />
          <shaderMaterial
            ref={matRef}
            vertexShader={vertex}
            fragmentShader={fragment}
            uniforms={uniforms}
            transparent
            depthWrite={depthWrite}
            side={doubleSide ? THREE.DoubleSide : THREE.FrontSide}
            premultipliedAlpha={false}
          />
        </mesh>

        {showGlow && (
          <mesh ref={glowMeshRef}>
            <planeGeometry args={args} />
            <shaderMaterial
              ref={glowMatRef}
              vertexShader={vertex}
              fragmentShader={glowFragment}
              uniforms={glowUniforms}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={doubleSide ? THREE.DoubleSide : THREE.FrontSide}
            />
          </mesh>
        )}
      </group>
    </group>
  );
});
