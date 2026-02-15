// src/components/IntroButterfly.jsx
import React, {
  forwardRef,
  useMemo,
  useRef,
  useImperativeHandle,
  useEffect,
} from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useControls, folder, button } from "leva";
import { useDebugStore } from "../../state/useDebugStore";

const UP = new THREE.Vector3(0, 1, 0);
const Y_FLIP = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI
);
const EPS = 1e-6;
const randPhase = () => Math.random() * Math.PI * 2.0;

// clamp a point to an oriented box
function clampPointToOrientedBox(
  pt,
  center,
  halfW,
  halfH,
  halfD,
  right,
  up,
  forward
) {
  // local coords relative to center
  const rel = pt.clone().sub(center);
  const lx = THREE.MathUtils.clamp(rel.dot(right), -halfW, halfW);
  const ly = THREE.MathUtils.clamp(rel.dot(up), -halfH, halfH);
  const lz = THREE.MathUtils.clamp(rel.dot(forward), -halfD, halfD);
  return center
    .clone()
    .addScaledVector(right, lx)
    .addScaledVector(up, ly)
    .addScaledVector(forward, lz);
}

export default forwardRef(function IntroButterfly(
  {
    // initial transform
    position = [-0.131, -3.934, -5.104],
    rotation,
    scale = 0.03,

    // wings / shading
    color = "#ffffff",
    flapFreq = 14.1,
    flapSpeed = 1.25,
    flapAmp = 1.04,
    noiseAmp = 0.3,
    noiseScale = 0.1,
    alphaCutoff = 0.02,
    doubleSide = true,
    depthWrite = false,
    texturePath = "/textures/butterfly/butterfly.png",

    // body tilt baseline
    verticalTiltDeg = 62.3,

    // glow
    enableGlow = true,
    glowIntensity = 1.0,
    glowSize = 1.15,
    glowColor = "#88ccff",

    // Leva
    enableControls = true,
    controlsFolder = "IntroButterfly",

    ...rest
  },
  ref
) {
  const { camera } = useThree();
  const isDebugMode = useDebugStore((state) => state.isDebugMode);

  // --- Texture ---
  const tex = useTexture(texturePath);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;

  // --- Refs & state ---
  const rootRef = useRef();
  const groupRef = useRef();
  const meshRef = useRef();
  const matRef = useRef();
  const glowRef = useRef();
  const glowMatRef = useRef();
  useImperativeHandle(ref, () => meshRef.current, []);

  const st = useRef({
    pos: new THREE.Vector3().fromArray(position),
    vel: new THREE.Vector3(),
    fwd: new THREE.Vector3(0, 0, 1),

    // roaming center (clamped to habitat)
    targetCenter: new THREE.Vector3().fromArray(position),

    lastCamPos: new THREE.Vector3(),
    phaseX: randPhase(),
    phaseY: randPhase(),
    phaseZ: randPhase(),

    // habitat basis
    center: new THREE.Vector3().fromArray(position),
    halfW: 0.22,
    halfH: 0.18,
    halfD: 0.42,
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    forward: new THREE.Vector3(0, 0, 1),

    // temps
    tmpVec: new THREE.Vector3(),
    qTarget: new THREE.Quaternion(),
    mLook: new THREE.Matrix4(),

    // smoothed camera forward/backward speed (projected on habitat forward)
    camSpeedSmooth: 0,

    // Pre-allocated temporaries for useFrame (eliminates per-frame GC pressure)
    tmpHabitatCenter: new THREE.Vector3(),
    tmpHabitatQuat: new THREE.Quaternion(),
    tmpCameraForward: new THREE.Vector3(),
    tmpCameraVel: new THREE.Vector3(),
    tmpDesiredPos: new THREE.Vector3(),
    tmpClampedDesired: new THREE.Vector3(),
    tmpToVector: new THREE.Vector3(),
    tmpDesiredVel: new THREE.Vector3(),
    tmpLookTarget: new THREE.Vector3(),
    tmpRelative: new THREE.Vector3(),
  });

  const rotationQ = useMemo(() => {
    if (!rotation) return null;
    const [rx = 0, ry = 0, rz = 0] = Array.isArray(rotation)
      ? rotation
      : [rotation.x, rotation.y, rotation.z];
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  }, [rotation]);

  // --- Controls (now with habitat) ---
  const knobs = useControls(
    isDebugMode && enableControls
      ? {
          [controlsFolder]: folder(
            {
              // Visual
              scale: { value: scale, min: 0.001, max: 1, step: 0.001 },
              color: { value: color },
              flapFreq: { value: flapFreq, min: 0.1, max: 20, step: 0.1 },
              flapSpeed: { value: flapSpeed, min: 0, max: 4, step: 0.05 },
              flapAmp: { value: flapAmp, min: 0, max: 1.5, step: 0.01 },
              verticalTiltDeg: {
                value: verticalTiltDeg,
                min: -90,
                max: 90,
                step: 0.1,
              },
              noiseAmp: { value: noiseAmp, min: 0, max: 0.5, step: 0.005 },
              noiseScale: { value: noiseScale, min: 0.05, max: 10, step: 0.05 },
              alphaCutoff: {
                value: alphaCutoff,
                min: 0,
                max: 0.2,
                step: 0.001,
              },

              // Glow
              enableGlow: { value: enableGlow },
              glowColor: { value: glowColor },
              glowIntensity: {
                value: glowIntensity,
                min: 0,
                max: 5,
                step: 0.05,
              },
              glowSize: { value: glowSize, min: 1, max: 2, step: 0.01 },

              // Camera tethering
              tieToCamera: { value: true, label: "Tie To Camera" },
              aheadDistance: {
                value: 1.4, //0.9,
                min: 0.1,
                max: 6,
                step: 0.01,
                label: "Ahead Distance",
              },
              centerFollow: {
                value: 8.0,
                min: 0.1,
                max: 20,
                step: 0.1,
                label: "Center Follow (1/s)",
              },
              heightOffset: { value: 0.15, min: -2, max: 2, step: 0.01 },

              // Roam (local to habitat basis)
              roamRadiusX: { value: 0.22, min: 0.01, max: 2, step: 0.01 },
              roamRadiusY: { value: 0.18, min: 0.01, max: 2, step: 0.01 },
              roamRadiusZ: { value: 0.42, min: 0.05, max: 3, step: 0.01 },
              roamFreqX: { value: 0.9, min: 0.05, max: 3, step: 0.01 },
              roamFreqY: { value: 1.3, min: 0.05, max: 3, step: 0.01 },
              roamFreqZ: { value: 0.7, min: 0.05, max: 3, step: 0.01 },
              roamJitter: { value: 0.35, min: 0, max: 1, step: 0.01 },
              camInfluence: {
                value: 0.1,
                min: 0,
                max: 2,
                step: 0.01,
                label: "Cam Motion Influence",
              },
              maxSpeed: { value: 1.5, min: 0.2, max: 4, step: 0.01 },
              orientationSmoothing: { value: 50.0, min: 0, max: 50, step: 0.1 },

              // Habitat
              showHabitat: { value: false, label: "Show Habitat" },
              habitatCenterX: {
                value: position[0],
                min: -10,
                max: 10,
                step: 0.001,
              },
              habitatCenterY: {
                value: position[1],
                min: -10,
                max: 10,
                step: 0.001,
              },
              habitatCenterZ: {
                value: position[2],
                min: -10,
                max: 10,
                step: 0.001,
              },
              habitatYawDeg: { value: -33.6, min: -180, max: 180, step: 0.1 },
              habitatWidth: { value: 0.439, min: 0.05, max: 10, step: 0.01 },
              habitatHeight: { value: 0.35, min: 0.05, max: 10, step: 0.01 },
              habitatDepth: { value: 5.0, min: 0.05, max: 20, step: 0.01 },
              habitatWireColor: { value: "#7fc7ff" },
              habitatWireOpacity: { value: 0.45, min: 0, max: 1, step: 0.01 },

              // Button
              Snap: button(() => {
                if (!camera || !groupRef.current) return;
                const k = get;
                // recompute habitat basis (for clamping)
                const hc = new THREE.Vector3(
                  k("habitatCenterX", position[0]),
                  k("habitatCenterY", position[1]),
                  k("habitatCenterZ", position[2])
                );
                const yaw = THREE.MathUtils.degToRad(k("habitatYawDeg", -33.6));
                const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
                const up = UP.clone();
                const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
                const halfW = Math.max(0.001, k("habitatWidth", 0.439) * 0.5);
                const halfH = Math.max(0.001, k("habitatHeight", 0.35) * 0.5);
                const halfD = Math.max(0.001, k("habitatDepth", 5.0) * 0.5);

                const ahead = k("aheadDistance", 0.9);
                const offY = k("heightOffset", -0.15);
                const dir = new THREE.Vector3();
                camera.getWorldDirection(dir).normalize();
                const desire = camera.position
                  .clone()
                  .addScaledVector(dir, ahead);
                desire.y += offY;

                const clamped = clampPointToOrientedBox(
                  desire,
                  hc,
                  halfW,
                  halfH,
                  halfD,
                  right,
                  up,
                  forward
                );
                st.current.targetCenter.copy(clamped);
                st.current.pos.copy(clamped);
                st.current.vel.set(0, 0, 0);
                groupRef.current.position.copy(st.current.pos);
              }),
            },
            { collapsed: true }
          ),
        }
      : {}
  );

  const get = (k, fb) => (enableControls ? knobs?.[k] ?? fb : fb);

  // --- Shaders ---
  const vertex = useMemo(
    () => /* glsl */ `
    vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
    vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
    vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }
    float snoise(vec3 v){
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
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
      m = m*m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    uniform float uTime, uFlapFreq, uFlapSpeed, uFlapAmp, uNoiseAmp, uNoiseScale, uTiltStatic;
    varying vec2 vUv;
    vec3 rotateY(vec3 p, float a){ float s=sin(a), c=cos(a); return vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c); }
    vec3 rotateX(vec3 p, float a){ float s=sin(a), c=cos(a); return vec3(p.x, p.y*c - p.z*s, p.y*s + p.z*c); }
    void main() {
      vUv = vec2(uv.x, 1.0 - uv.y);
      float phase = uTime * uFlapFreq * uFlapSpeed;
      float baseMag = abs(sin(phase)) * uFlapAmp;
      float flutter = snoise(vec3(position.xy * uNoiseScale, uTime * 0.5)) * uNoiseAmp;
      float angleMag = clamp(baseMag + flutter * 0.2, 0.0, uFlapAmp);
      float side = sign(position.x);
      vec3 p = position;
      p = rotateY(p, side * angleMag);
      p = rotateX(p, uTiltStatic);
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
    uniform float uVisibility; // 0..1 fade control
    varying vec2 vUv;
    void main(){
      vec4 texel = texture2D(uTexture, vUv);
      if (texel.a <= uAlphaCutoff) discard;
      float alpha = texel.a * uVisibility;
      if (alpha <= 0.0001) discard;
      gl_FragColor = vec4(texel.rgb * uColor, alpha);
    }`,
    []
  );

  const glowFragment = useMemo(
    () => /* glsl */ `
    uniform sampler2D uTexture;
    uniform vec3 uGlowColor;
    uniform float uGlowIntensity, uGlowBoost, uAlphaCutoff, uVisibility;
    varying vec2 vUv;
    void main(){
      vec4 texel = texture2D(uTexture, vUv);
      float base = smoothstep(uAlphaCutoff, 1.0, texel.a);
      float intensity = max(0.0, uGlowIntensity + uGlowBoost);
      float a = base * intensity * uVisibility;
      if (a <= 0.0001) discard;
      gl_FragColor = vec4(uGlowColor * a, a);
    }`,
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
      uVisibility: { value: 1.0 },
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
      uGlowBoost: { value: 0.0 },
      uVisibility: { value: 1.0 },
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

  // Shared geometry for both main and glow meshes (50% GPU memory savings)
  const sharedGeometry = useMemo(
    () => new THREE.PlaneGeometry(1, 1, 6, 6),
    []
  );

  // Cleanup shared geometry on unmount
  useEffect(() => {
    return () => {
      sharedGeometry.dispose();
    };
  }, [sharedGeometry]);

  // Init
  useEffect(() => {
    if (camera) st.current.lastCamPos.copy(camera.position);
    // init visibility
    st.current.visAlpha = 1.0;
    st.current.visTarget = 1.0;
  }, [camera]);

  useFrame((state, dt) => {
    const t = state.clock.getElapsedTime();
    const s = st.current;
    const dtSafe = Math.max(1e-4, dt);

    // ---- HABITAT BASIS (recomputed live from controls) ----
    const hc = s.tmpHabitatCenter.set(
      get("habitatCenterX", position[0]),
      get("habitatCenterY", position[1]),
      get("habitatCenterZ", position[2])
    );
    const yaw = THREE.MathUtils.degToRad(get("habitatYawDeg", -33.6));
    const q = s.tmpHabitatQuat.setFromAxisAngle(UP, yaw);
    const right = s.right.set(1, 0, 0).applyQuaternion(q);
    const up = s.up.copy(UP);
    const forward = s.forward.set(0, 0, 1).applyQuaternion(q);
    const halfW = (s.halfW = Math.max(0.001, get("habitatWidth", 0.439) * 0.5));
    const halfH = (s.halfH = Math.max(0.001, get("habitatHeight", 0.35) * 0.5));
    const halfD = (s.halfD = Math.max(0.001, get("habitatDepth", 5.0) * 0.5));
    s.center.copy(hc);

    // ---- CAMERA TETHER (ahead, then clamp to habitat) ----
    const tie = !!get("tieToCamera", true);
    const ahead = get("aheadDistance", 0.9);
    const follow = Math.max(0, get("centerFollow", 4.0));
    const offY = get("heightOffset", -0.15);

    // camera motion & forward in world
    const camF = s.tmpCameraForward;
    camera.getWorldDirection(camF).normalize();

    const camVel = s.tmpCameraVel.copy(camera.position).sub(s.lastCamPos);
    const camForwardSpeed = camVel.dot(camF) / dtSafe; // +fwd, -back
    s.lastCamPos.copy(camera.position);

    if (tie) {
      // desired center: ahead of camera
      const desired = s.tmpDesiredPos.copy(camera.position).addScaledVector(camF, ahead);
      desired.y += offY;

      // clamp desired to habitat OBB
      const clampedCenter = clampPointToOrientedBox(
        desired,
        hc,
        halfW,
        halfH,
        halfD,
        right,
        up,
        forward
      );

      // smooth follow
      const alpha = 1 - Math.exp(-follow * dtSafe);
      s.targetCenter.lerp(clampedCenter, alpha);
    } else {
      // ensure target center stays valid if user moves habitat
      s.targetCenter.copy(
        clampPointToOrientedBox(
          s.targetCenter,
          hc,
          halfW,
          halfH,
          halfD,
          right,
          up,
          forward
        )
      );
    }

    // ---- ROAM around targetCenter in HABITAT basis, with forward/back bias from camera projected onto habitat forward ----
    const rX = Math.max(0.001, get("roamRadiusX", 0.22));
    const rY = Math.max(0.001, get("roamRadiusY", 0.18));
    const rZ = Math.max(0.001, get("roamRadiusZ", 0.42));
    const fX = get("roamFreqX", 0.9);
    const fY = get("roamFreqY", 1.3);
    const fZ = get("roamFreqZ", 0.7);
    const jit = get("roamJitter", 0.35);
    const camInf = get("camInfluence", 0.6);
    const maxSpeed = Math.max(0.01, get("maxSpeed", 1.4));
    const orientSmooth = Math.max(0, get("orientationSmoothing", 18.0));
    // Edge fade controls
    const enableEdgeFade = true;
    const edgeFadeFraction = THREE.MathUtils.clamp(
      get("edgeFadeFraction", 0.12),
      0.0,
      0.49
    );
    const reappearFraction = THREE.MathUtils.clamp(
      get("reappearFraction", 0.2),
      0.0,
      0.49
    );
    const fadeRate = Math.max(0.1, get("fadeRate", 2.0)); // 1/s
    const glowUpMax = Math.max(0.0, get("glowUpMax", 1.5));

    // camera forward speed projected on habitat forward
    const camFwdAlongHabitat = camForwardSpeed * camF.dot(forward); // signed

    // advance phases (bias Z phase with movement)
    s.phaseX +=
      fX *
      dtSafe *
      (1.0 + 0.15 * Math.abs(camFwdAlongHabitat)) *
      (1.0 + 0.2 * jit);
    s.phaseY +=
      fY *
      dtSafe *
      (1.0 + 0.1 * Math.abs(camFwdAlongHabitat)) *
      (1.0 + 0.2 * jit);
    s.phaseZ +=
      fZ * dtSafe * (1.0 + 0.25 * camInf * Math.abs(camFwdAlongHabitat));

    const ox =
      (Math.sin(s.phaseX + 0.7) * 0.62 +
        Math.sin(2.13 * s.phaseX + 1.1) * 0.22 * jit) *
      rX;
    const oy =
      (Math.cos(s.phaseY + 1.9) * 0.58 +
        Math.sin(1.77 * s.phaseY + 0.3) * 0.24 * jit) *
      rY;

    const ozBase =
      (Math.sin(s.phaseZ + 2.3) * 0.55 +
        Math.sin(2.01 * s.phaseZ + 0.6) * 0.2 * jit) *
      rZ;

    // bias along habitat forward (+fwd, -back) but keep inside radius-ish
    // Smooth the forward/backward camera component to avoid jittery motion
    s.camSpeedSmooth = THREE.MathUtils.lerp(
      s.camSpeedSmooth,
      camFwdAlongHabitat,
      1 - Math.exp(-6.0 * dtSafe)
    );
    // Use a subtle gain so the butterfly nudges forward/back rather than darting
    const biasGain = 0.08 * camInf;
    const ozBias = THREE.MathUtils.clamp(
      s.camSpeedSmooth * biasGain,
      -rZ * 0.35,
      rZ * 0.35
    );
    const oz = ozBase + ozBias;

    // desired position from center using HABITAT basis
    const desiredPos = s.tmpDesiredPos
      .copy(s.targetCenter)
      .addScaledVector(right, ox)
      .addScaledVector(up, oy)
      .addScaledVector(forward, oz);

    // clamp desired to OBB to ensure it never escapes
    const clampedDesired = clampPointToOrientedBox(
      desiredPos,
      hc,
      halfW,
      halfH,
      halfD,
      right,
      up,
      forward
    );

    // target velocity (critically damped spring) with clamp
    const to = s.tmpToVector.copy(clampedDesired).sub(s.pos);
    const desiredVel = s.tmpDesiredVel.copy(to).multiplyScalar(5.0);
    if (desiredVel.length() > maxSpeed) desiredVel.setLength(maxSpeed);

    s.vel.lerp(desiredVel, 1 - Math.exp(-8.0 * dtSafe));
    s.pos.addScaledVector(s.vel, dtSafe);

    if (groupRef.current) groupRef.current.position.copy(s.pos);

    // orientation from velocity (fallback to habitat forward)
    const vLenSq = s.vel.lengthSq();
    if (vLenSq > EPS) s.fwd.copy(s.vel).normalize();
    else s.fwd.copy(forward);

    const lookTgt = s.tmpLookTarget.copy(s.pos).add(s.fwd);
    s.mLook.lookAt(s.pos, lookTgt, UP);
    s.qTarget.setFromRotationMatrix(s.mLook);
    s.qTarget.multiply(Y_FLIP);
    if (rotationQ) s.qTarget.multiply(rotationQ);

    if (groupRef.current) {
      if (orientSmooth <= 0) groupRef.current.quaternion.copy(s.qTarget);
      else {
        const a = 1 - Math.exp(-orientSmooth * dtSafe);
        groupRef.current.quaternion.slerp(
          s.qTarget,
          THREE.MathUtils.clamp(a, 0, 1)
        );
      }
    }

    // uniforms & sizing
    const baseColor = get("color", color);
    const baseFlapFreq = get("flapFreq", flapFreq);
    const flapSpeedV = get("flapSpeed", flapSpeed);
    const flapAmpV = get("flapAmp", flapAmp);
    const wingNoiseAmp = get("noiseAmp", noiseAmp);
    const wingNoiseScale = get("noiseScale", noiseScale);
    const alphaCut = get("alphaCutoff", alphaCutoff);
    const glowCol = get("glowColor", glowColor);
    const glowInt = get("glowIntensity", glowIntensity);
    const glowSz = get("glowSize", glowSize);
    const sc = get("scale", scale);

    const speed = Math.sqrt(vLenSq);
    const dynFreq = baseFlapFreq + speed * 0.8;
    const tiltRad = THREE.MathUtils.degToRad(
      get("verticalTiltDeg", verticalTiltDeg)
    );

    if (matRef.current) {
      const u = matRef.current.uniforms;
      u.uTime.value = t;
      if (typeof baseColor === "string") u.uColor.value.set(baseColor);
      u.uFlapFreq.value = dynFreq;
      u.uFlapSpeed.value = flapSpeedV;
      u.uFlapAmp.value = flapAmpV;
      u.uNoiseAmp.value = wingNoiseAmp;
      u.uNoiseScale.value = wingNoiseScale;
      u.uAlphaCutoff.value = alphaCut;
      u.uTiltStatic.value = tiltRad;
    }
    if (glowMatRef.current) {
      const u = glowMatRef.current.uniforms;
      u.uTime.value = t;
      u.uFlapFreq.value = dynFreq;
      u.uFlapSpeed.value = flapSpeedV;
      u.uFlapAmp.value = flapAmpV;
      u.uNoiseAmp.value = wingNoiseAmp;
      u.uNoiseScale.value = wingNoiseScale;
      u.uAlphaCutoff.value = alphaCut;
      if (typeof glowCol === "string") u.uGlowColor.value.set(glowCol);
      u.uGlowIntensity.value = glowInt;
      u.uTiltStatic.value = tiltRad;
    }

    // Distance-based culling (butterfly is subpixel beyond 50 units at 0.03 scale)
    const distToCam = camera.position.distanceTo(s.pos);
    const cullDistance = 50;
    const isTooFar = distToCam > cullDistance;

    // Visibility and glow-up handling near forward edge of habitat
    if (enableEdgeFade) {
      // local z within habitat basis
      const rel = s.tmpRelative.copy(s.pos).sub(s.center);
      const zLocal = rel.dot(forward);
      const nearEdgeZ = s.halfD * (1.0 - edgeFadeFraction);
      const reappearZ = s.halfD * (1.0 - reappearFraction);

      if ((s.visTarget ?? 1.0) > 0.5) {
        // visible target -> trigger fade-out when near forward edge
        if (zLocal >= nearEdgeZ) s.visTarget = 0.0;
      } else {
        // invisible target -> trigger fade-in when moved back enough
        if (zLocal <= reappearZ) s.visTarget = 1.0;
      }

      // update visibility alpha toward target
      s.visAlpha = s.visAlpha ?? 1.0;
      const dir =
        (s.visTarget ?? 1.0) > s.visAlpha + 1e-4
          ? 1.0
          : (s.visTarget ?? 1.0) < s.visAlpha - 1e-4
          ? -1.0
          : 0.0;
      if (dir !== 0.0) {
        s.visAlpha = THREE.MathUtils.clamp(
          s.visAlpha + dir * fadeRate * dtSafe,
          0.0,
          1.0
        );
      }
      // set object visibility with distance culling and edge fade
      if (groupRef.current) {
        const shouldBeVisible = !isTooFar &&
          (s.visTarget !== 0.0 || s.visAlpha > 0.001);
        groupRef.current.visible = shouldBeVisible;
      }

      // glow boost peaks while invisible and reduces as fully visible
      s.glowBoost = (1.0 - s.visAlpha) * glowUpMax;
    } else {
      s.visAlpha = 1.0;
      s.glowBoost = 0.0;
      if (groupRef.current) groupRef.current.visible = !isTooFar;
    }

    // apply uniforms for visibility and glow boost
    if (matRef.current) {
      matRef.current.uniforms.uVisibility.value = s.visAlpha;
    }
    if (glowMatRef.current) {
      glowMatRef.current.uniforms.uVisibility.value = s.visAlpha;
      glowMatRef.current.uniforms.uGlowBoost.value = s.glowBoost;
    }

    if (meshRef.current) meshRef.current.scale.set(sc, sc, sc);
    if (glowRef.current) {
      const g = sc * glowSz;
      glowRef.current.scale.set(g, g, g);
    }
  });

  const showGlow = enableControls
    ? knobs?.enableGlow ?? enableGlow
    : enableGlow;

  // Habitat wire
  const showHabitat = enableControls ? knobs?.showHabitat ?? false : false;
  const hw = enableControls ? knobs?.habitatWidth ?? 0.439 : 0.439;
  const hh = enableControls ? knobs?.habitatHeight ?? 0.35 : 0.35;
  const hd = enableControls ? knobs?.habitatDepth ?? 5.0 : 5.0;
  const hcx = enableControls
    ? knobs?.habitatCenterX ?? position[0]
    : position[0];
  const hcy = enableControls
    ? knobs?.habitatCenterY ?? position[1]
    : position[1];
  const hcz = enableControls
    ? knobs?.habitatCenterZ ?? position[2]
    : position[2];
  const hyaw = THREE.MathUtils.degToRad(
    enableControls ? knobs?.habitatYawDeg ?? -33.6 : -33.6
  );
  const hcol = enableControls
    ? knobs?.habitatWireColor ?? "#7fc7ff"
    : "#7fc7ff";
  const hop = enableControls ? knobs?.habitatWireOpacity ?? 0.45 : 0.45;

  return (
    <group ref={rootRef} {...rest}>
      {/* Controls for edge fade/glow-up (in Leva) */}
      {
        enableControls &&
          null /* UI already created in useControls; values pulled via get() */
      }
      {showHabitat && (
        <group position={[hcx, hcy, hcz]} rotation={[0, hyaw, 0]}>
          <mesh frustumCulled={false}>
            <boxGeometry args={[hw, hh, hd]} />
            <meshBasicMaterial
              color={hcol}
              wireframe
              transparent
              opacity={hop}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      <group ref={groupRef} position={position}>
        <mesh ref={meshRef} geometry={sharedGeometry}>
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
          <mesh ref={glowRef} geometry={sharedGeometry}>
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
