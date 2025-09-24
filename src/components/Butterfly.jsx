// src/components/Butterfly.jsx
import React, { forwardRef, useMemo, useRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useControls, folder } from "leva";

export default forwardRef(function Butterfly(
  {
    position,
    rotation,
    // -------- single, uniform world scale (default tiny particle) --------
    scale = 0.02,
    // shader params
    color = "#ffffff",
    flapFreq = 2.5,
    flapSpeed = 1.0,
    flapAmp = 1.12,
    tiltAmp = 0.1,
    noiseAmp = 0.05,
    noiseScale = 3.0,
    alphaCutoff = 0.02,
    doubleSide = true,
    depthWrite = false,
    billboard = false,
    texturePath = "/textures/butterfly/butterfly.png",
    // optional Leva control for the single scale
    enableControls = true,
    // glow
    enableGlow = true,
    glowIntensity = 1.0,
    glowSize = 1.15,
    glowColor = "#88ccff",
    controlsFolder = "Butterfly",
    ...rest
  },
  ref
) {
  const tex = useTexture(texturePath);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // keep; we flip v in the shader for consistency

  const matRef = useRef();
  const meshRef = useRef();
  const glowMatRef = useRef();
  const glowMeshRef = useRef();
  useImperativeHandle(ref, () => meshRef.current, []);

  // Optional Leva controls
  const leva = useControls(
    enableControls
      ? {
          [controlsFolder]: folder(
            {
              scale: { value: scale, min: 0.001, max: 1.0, step: 0.001 },
              color: { value: color },
              flapFreq: { value: flapFreq, min: 0.1, max: 20, step: 0.1 },
              flapSpeed: { value: flapSpeed, min: 0.0, max: 4.0, step: 0.05 },
              flapAmp: { value: flapAmp, min: 0.0, max: 1.5, step: 0.01 }, // radians
              tiltAmp: { value: tiltAmp, min: 0.0, max: 0.8, step: 0.01 },
              noiseAmp: { value: noiseAmp, min: 0.0, max: 0.3, step: 0.005 },
              noiseScale: { value: noiseScale, min: 0.1, max: 10.0, step: 0.1 },
              alphaCutoff: {
                value: alphaCutoff,
                min: 0.0,
                max: 0.2,
                step: 0.001,
              },
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

  // Geometry: unit plane (1x1). World size is controlled solely by `scale`.
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
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    uniform float uTime;
    uniform float uFlapFreq;
    uniform float uFlapSpeed;
    uniform float uFlapAmp;
    uniform float uTiltAmp;
    uniform float uNoiseAmp;
    uniform float uNoiseScale;
    varying vec2 vUv;

    // Rotation helpers
    vec3 rotateY(vec3 p, float a){
      float s = sin(a), c = cos(a);
      return vec3(
        p.x * c + p.z * s,
        p.y,
        -p.x * s + p.z * c
      );
    }
    vec3 rotateX(vec3 p, float a){
      float s = sin(a), c = cos(a);
      return vec3(
        p.x,
        p.y * c - p.z * s,
        p.y * s + p.z * c
      );
    }

    void main() {
      // Provide flipped UV for sampling in fragment, once.
      vUv = vec2(uv.x, 1.0 - uv.y);
      
      // Phase and base angles
      float phase = uTime * uFlapFreq * uFlapSpeed;
      float baseFlap = sin(phase) * uFlapAmp;       // open/close around hinge (Y-axis)
      float baseTilt = sin(phase + 1.5707963) * uTiltAmp; // up/down tilt (X-axis), 90deg phase shift

      // Mild procedural flutter, subtle randomization
      float flutter = snoise(vec3(position.xy * uNoiseScale, uTime * 0.5)) * uNoiseAmp;

      // Determine side of the wing relative to the body centerline (x=0)
      float side = sign(position.x);
      // Avoid zero at center so both halves rotate robustly; this keeps axis at x=0 naturally
      // Compose angles: opposing around Y for left/right (opening/closing) + global tilt around X
      float angleY = baseFlap * side + flutter * 0.2;
      float angleX = baseTilt + flutter * 0.05;

      // Apply rotations around hinge at x=0 (Y-axis) then add a touch of X tilt
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

  // Glow fragment shader (uses same vertex shader to follow flap)
  const glowFragment = useMemo(
    () => /* glsl */ `
    uniform sampler2D uTexture;
    uniform vec3 uGlowColor;
    uniform float uGlowIntensity;
    uniform float uAlphaCutoff;
    varying vec2 vUv;

    void main(){
      vec4 texel = texture2D(uTexture, vUv);
      // soft alpha so glow fades nicely at edges
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
      uTiltAmp: { value: tiltAmp },
      uNoiseAmp: { value: noiseAmp },
      uNoiseScale: { value: noiseScale },
      uAlphaCutoff: { value: alphaCutoff },
    }),
    [
      tex,
      color,
      flapFreq,
      flapSpeed,
      flapAmp,
      tiltAmp,
      noiseAmp,
      noiseScale,
      alphaCutoff,
    ]
  );

  // Glow uniforms (share timing/flap so glow follows wings)
  const glowUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTexture: { value: tex },
      uFlapFreq: { value: flapFreq },
      uFlapSpeed: { value: flapSpeed },
      uFlapAmp: { value: flapAmp },
      uTiltAmp: { value: tiltAmp },
      uNoiseAmp: { value: noiseAmp },
      uNoiseScale: { value: noiseScale },
      uAlphaCutoff: { value: alphaCutoff },
      uGlowColor: { value: new THREE.Color(glowColor) },
      uGlowIntensity: { value: glowIntensity },
    }),
    [
      tex,
      flapFreq,
      flapSpeed,
      flapAmp,
      tiltAmp,
      noiseAmp,
      noiseScale,
      alphaCutoff,
      glowColor,
      glowIntensity,
    ]
  );

  useFrame(({ clock, camera }) => {
    if (matRef.current) {
      const t = clock.getElapsedTime();
      const ctrl = enableControls ? leva : undefined;
      matRef.current.uniforms.uTime.value = t;
      // live-update uniforms from controls (if enabled) or props
      // color tint
      const nextColor = ctrl?.color ?? color;
      if (typeof nextColor === "string") {
        matRef.current.uniforms.uColor.value.set(nextColor);
      }
      matRef.current.uniforms.uFlapFreq.value = ctrl?.flapFreq ?? flapFreq;
      matRef.current.uniforms.uFlapSpeed.value = ctrl?.flapSpeed ?? flapSpeed;
      matRef.current.uniforms.uFlapAmp.value = ctrl?.flapAmp ?? flapAmp;
      matRef.current.uniforms.uTiltAmp.value = ctrl?.tiltAmp ?? tiltAmp;
      matRef.current.uniforms.uNoiseAmp.value = ctrl?.noiseAmp ?? noiseAmp;
      matRef.current.uniforms.uNoiseScale.value =
        ctrl?.noiseScale ?? noiseScale;
      matRef.current.uniforms.uAlphaCutoff.value =
        ctrl?.alphaCutoff ?? alphaCutoff;
    }
    // Glow uniforms + scale updates
    if (glowMatRef.current) {
      const t = clock.getElapsedTime();
      const ctrl = enableControls ? leva : undefined;
      glowMatRef.current.uniforms.uTime.value = t;
      glowMatRef.current.uniforms.uFlapFreq.value = ctrl?.flapFreq ?? flapFreq;
      glowMatRef.current.uniforms.uFlapSpeed.value =
        ctrl?.flapSpeed ?? flapSpeed;
      glowMatRef.current.uniforms.uFlapAmp.value = ctrl?.flapAmp ?? flapAmp;
      glowMatRef.current.uniforms.uTiltAmp.value = ctrl?.tiltAmp ?? tiltAmp;
      glowMatRef.current.uniforms.uNoiseAmp.value = ctrl?.noiseAmp ?? noiseAmp;
      glowMatRef.current.uniforms.uNoiseScale.value =
        ctrl?.noiseScale ?? noiseScale;
      glowMatRef.current.uniforms.uAlphaCutoff.value =
        ctrl?.alphaCutoff ?? alphaCutoff;
      const nextGlowColor =
        (enableControls ? leva?.glowColor : glowColor) ?? glowColor;
      if (typeof nextGlowColor === "string") {
        glowMatRef.current.uniforms.uGlowColor.value.set(nextGlowColor);
      }
      glowMatRef.current.uniforms.uGlowIntensity.value = enableControls
        ? leva?.glowIntensity ?? glowIntensity
        : glowIntensity;
    }
    if (billboard && meshRef.current) {
      meshRef.current.quaternion.copy(camera.quaternion);
    }
    if (billboard && glowMeshRef.current) {
      glowMeshRef.current.quaternion.copy(camera.quaternion);
    }
    // keep world scale strictly uniform
    if (meshRef.current) {
      const s = enableControls ? leva?.scale ?? scale : scale;
      meshRef.current.scale.set(s, s, s);
    }
    if (glowMeshRef.current) {
      const s = enableControls ? leva?.scale ?? scale : scale;
      const gs = enableControls ? leva?.glowSize ?? glowSize : glowSize;
      glowMeshRef.current.scale.set(s * gs, s * gs, s * gs);
    }
  });

  return (
    <group>
      <mesh ref={meshRef} position={position} rotation={rotation} {...rest}>
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
      {(enableControls ? leva?.enableGlow ?? enableGlow : enableGlow) && (
        <mesh ref={glowMeshRef} position={position} rotation={rotation}>
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
  );
});
