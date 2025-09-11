// src/components/Lake.jsx
import React, {
  useMemo,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useControls, folder } from "leva";
import lakeVertexShader from "../shaders/lake/vertex.glsl?raw";
import lakeFragmentShader from "../shaders/lake/fragment.glsl?raw";
import { TrailFluid } from "../fx/TrailFluid";

// Emission-only fragment for additive overlay
const emissionFragmentShader = /* glsl */ `
precision highp float;
uniform float uTime;
uniform sampler2D uTrailMap;
uniform sampler2D uStampMap;
uniform vec2 uTrailTexel;

uniform vec3  uBioColorA;
uniform vec3  uBioColorB;
uniform float uBioIntensity;
uniform float uBioAltFreq;
uniform float uBioAltPhase;

uniform float uTrailGlow; // NEW: independent glow multiplier

varying vec3 vNormalW;
varying vec3 vWorldPosition;
varying vec2 vUv0;

void main(){
  // Soft gather for watercolor look
  vec2 texel = uTrailTexel;
  float d0 = texture2D(uTrailMap, vUv0).r * 0.36;
  float d1 = texture2D(uTrailMap, vUv0 + vec2( texel.x, 0.0)).r * 0.16;
  float d2 = texture2D(uTrailMap, vUv0 + vec2(-texel.x, 0.0)).r * 0.16;
  float d3 = texture2D(uTrailMap, vUv0 + vec2(0.0,  texel.y)).r * 0.16;
  float d4 = texture2D(uTrailMap, vUv0 + vec2(0.0, -texel.y)).r * 0.16;
  float dye = clamp(d0 + d1 + d2 + d3 + d4, 0.0, 1.0);

  // Color alternation over age
  float stamp = texture2D(uStampMap, vUv0).r;
  float ageSec = max(uTime - stamp, 0.0);
  float w = 0.5 + 0.5 * sin(ageSec * uBioAltFreq + uBioAltPhase);
  vec3 dyeColor = mix(uBioColorA, uBioColorB, w);

  // Emission only; alpha just a soft mask (not used by additive blend)
  vec3 emission = dyeColor * (dye * uBioIntensity * uTrailGlow);
  gl_FragColor = vec4(emission, dye);
}
`;

const Lake = forwardRef(function Lake(
  {
    position = [-2, 0.0, -2],
    rotation = [Math.PI * 0.5, 0, 0],
    resolution = 140,
    envMap = null,
  },
  ref
) {
  const meshRef = useRef();
  const baseMatRef = useRef();
  const addMatRef = useRef();
  const { gl } = useThree();

  // === Controls ===
  const { lakePosX, lakePosY, lakePosZ } = useControls("Lake", {
    Transform: folder({
      lakePosX: { value: -1.8, min: -20, max: 20, step: 0.01 },
      lakePosY: { value: -4.82, min: -10, max: 10, step: 0.01 },
      lakePosZ: { value: -2.8, min: -20, max: 20, step: 0.01 },
    }),
  });

  const { lakeSizeX, lakeSizeZ } = useControls("Lake", {
    Size: folder({
      lakeSizeX: {
        value: 2.0,
        min: 0.25,
        max: 10,
        step: 0.01,
        label: "Size X",
      },
      lakeSizeZ: {
        value: 2.0,
        min: 0.25,
        max: 10,
        step: 0.01,
        label: "Size Z",
      },
    }),
  });

  const {
    uWavesAmplitude,
    uWavesFrequency,
    uWavesPersistence,
    uWavesLacunarity,
    uWavesIterations,
    uWavesSpeed,
  } = useControls("Lake", {
    Waves: folder({
      uWavesAmplitude: { value: 0.018, min: 0, max: 0.1, step: 0.001 },
      uWavesFrequency: { value: 3.0, min: 0.1, max: 3, step: 0.01 },
      uWavesPersistence: { value: 0.3, min: 0, max: 1, step: 0.01 },
      uWavesLacunarity: { value: 2.18, min: 1, max: 4, step: 0.01 },
      uWavesIterations: { value: 3, min: 1, max: 16, step: 1 },
      uWavesSpeed: { value: 0.3, min: 0, max: 2, step: 0.01 },
    }),
  });

  const {
    uTroughColor,
    uSurfaceColor,
    uPeakColor,
    uPeakThreshold,
    uPeakTransition,
    uTroughThreshold,
    uTroughTransition,
  } = useControls("Lake", {
    Colors: folder({
      uTroughColor: { value: "#767676" },
      uSurfaceColor: { value: "#b1b1b1" },
      uPeakColor: { value: "#bebebe" },
    }),
    Thresholds: folder({
      uPeakThreshold: { value: 0.01, min: -0.1, max: 0.1, step: 0.001 },
      uPeakTransition: { value: 0.02, min: 0.001, max: 0.1, step: 0.001 },
      uTroughThreshold: { value: -0.005, min: -0.1, max: 0.1, step: 0.001 },
      uTroughTransition: { value: 0.06, min: 0.001, max: 0.3, step: 0.001 },
    }),
  });

  const { uFresnelScale, uFresnelPower, lakeOpacity } = useControls("Lake", {
    Material: folder({
      uFresnelScale: { value: 0.8, min: 0, max: 2, step: 0.01 },
      uFresnelPower: { value: 1.0, min: 0.1, max: 2, step: 0.01 },
      lakeOpacity: {
        value: 0.2,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        label: "Opacity",
      },
    }),
  });

  const {
    bioColorA,
    bioColorB,
    bioIntensity,
    bioAltFreq,
    bioAltPhase,
    decay,
    diffusion,
    flowScale,
    flowFrequency,
    splatRadius,
    splatStrength,
    fadeWindow,
    trailGlow,
    enableAdditiveTrail,
  } = useControls("Lake", {
    Bioluminescence: folder({
      bioColorA: { value: "#daa3ffff" },
      bioColorB: { value: "#daa3ffff" },
      bioIntensity: { value: 3, min: 0, max: 4, step: 0.05 },
      bioAltFreq: { value: 6.28318, min: 0.0, max: 20.0, step: 0.05 },
      bioAltPhase: { value: 0.0, min: -6.28318, max: 6.28318, step: 0.01 },
      trailGlow: {
        value: 1.75,
        min: 0.0,
        max: 8.0,
        step: 0.05,
        label: "Trail Glow (additive)",
      },
      enableAdditiveTrail: { value: true, label: "Additive Trail Pass" },
    }),
    FluidSim: folder({
      decay: { value: 0.975, min: 0.9, max: 0.995, step: 0.001 },
      diffusion: { value: 0.15, min: 0.0, max: 0.5, step: 0.01 },
      flowScale: { value: 0.0035, min: 0.0, max: 0.01, step: 0.0001 },
      flowFrequency: { value: 3.0, min: 0.5, max: 6.0, step: 0.1 },
      splatRadius: { value: 0.02, min: 0.005, max: 0.15, step: 0.005 },
      splatStrength: { value: 3, min: 0.1, max: 3.0, step: 0.05 },
      fadeWindow: { value: 12, min: 0.2, max: 16.0, step: 0.05 },
    }),
  });

  // === Trail fluid ===
  const trail = useMemo(
    () =>
      new TrailFluid(gl, {
        size: 128,
        decay,
        diffusion,
        flowScale,
        flowFrequency,
        fadeWindow,
        splatRadius,
        splatStrength,
      }),
    [gl]
  ); // once

  useEffect(() => () => trail?.dispose?.(), [trail]);

  useEffect(() => {
    trail.setParams({
      decay,
      diffusion,
      flowScale,
      flowFrequency,
      fadeWindow,
      splatRadius,
      splatStrength,
    });
  }, [
    trail,
    decay,
    diffusion,
    flowScale,
    flowFrequency,
    fadeWindow,
    splatRadius,
    splatStrength,
  ]);

  // === Materials ===
  const baseMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: lakeVertexShader,
      fragmentShader: lakeFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.9 },
        uEnvironmentMap: { value: envMap },

        uWavesAmplitude: { value: uWavesAmplitude },
        uWavesFrequency: { value: uWavesFrequency },
        uWavesPersistence: { value: uWavesPersistence },
        uWavesLacunarity: { value: uWavesLacunarity },
        uWavesIterations: { value: uWavesIterations },
        uWavesSpeed: { value: uWavesSpeed },

        uTroughColor: { value: new THREE.Color(uTroughColor) },
        uSurfaceColor: { value: new THREE.Color(uSurfaceColor) },
        uPeakColor: { value: new THREE.Color(uPeakColor) },

        uPeakThreshold: { value: uPeakThreshold },
        uPeakTransition: { value: uPeakTransition },
        uTroughThreshold: { value: uTroughThreshold },
        uTroughTransition: { value: uTroughTransition },

        uFresnelScale: { value: uFresnelScale },
        uFresnelPower: { value: uFresnelPower },

        uTrailMap: { value: null },
        uStampMap: { value: null },
        uBioColorA: { value: new THREE.Color(bioColorA) },
        uBioColorB: { value: new THREE.Color(bioColorB) },
        uBioIntensity: { value: bioIntensity },
        uBioAltFreq: { value: bioAltFreq },
        uBioAltPhase: { value: bioAltPhase },

        uTrailTexel: { value: new THREE.Vector2(1 / 128, 1 / 128) },
        uLakeBaseY: { value: lakePosY },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: lakeVertexShader, // reuse same vertex (displacement)
      fragmentShader: emissionFragmentShader, // emission only
      uniforms: {
        uTime: { value: 0 },
        uTrailMap: { value: null },
        uStampMap: { value: null },
        uTrailTexel: { value: new THREE.Vector2(1 / 128, 1 / 128) },
        uBioColorA: { value: new THREE.Color(bioColorA) },
        uBioColorB: { value: new THREE.Color(bioColorB) },
        uBioIntensity: { value: bioIntensity },
        uBioAltFreq: { value: bioAltFreq },
        uBioAltPhase: { value: bioAltPhase },
        uTrailGlow: { value: 1.75 },
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, // key line
    });
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep texel in sync with sim size
  useEffect(() => {
    const tex = 1 / (trail.size ?? 128);
    baseMaterial.uniforms.uTrailTexel.value.set(tex, tex);
    addMaterial.uniforms.uTrailTexel.value.set(tex, tex);
  }, [trail, baseMaterial, addMaterial]);

  // Live updates
  useEffect(() => {
    // Base
    baseMaterial.uniforms.uOpacity.value = lakeOpacity;
    baseMaterial.transparent = lakeOpacity < 1.0;

    baseMaterial.uniforms.uWavesAmplitude.value = uWavesAmplitude;
    baseMaterial.uniforms.uWavesFrequency.value = uWavesFrequency;
    baseMaterial.uniforms.uWavesPersistence.value = uWavesPersistence;
    baseMaterial.uniforms.uWavesLacunarity.value = uWavesLacunarity;
    baseMaterial.uniforms.uWavesIterations.value = uWavesIterations;
    baseMaterial.uniforms.uWavesSpeed.value = uWavesSpeed;

    baseMaterial.uniforms.uTroughColor.value.setStyle(uTroughColor);
    baseMaterial.uniforms.uSurfaceColor.value.setStyle(uSurfaceColor);
    baseMaterial.uniforms.uPeakColor.value.setStyle(uPeakColor);
    baseMaterial.uniforms.uPeakThreshold.value = uPeakThreshold;
    baseMaterial.uniforms.uPeakTransition.value = uPeakTransition;
    baseMaterial.uniforms.uTroughThreshold.value = uTroughThreshold;
    baseMaterial.uniforms.uTroughTransition.value = uTroughTransition;

    baseMaterial.uniforms.uFresnelScale.value = uFresnelScale;
    baseMaterial.uniforms.uFresnelPower.value = uFresnelPower;

    baseMaterial.uniforms.uBioColorA.value.setStyle(bioColorA);
    baseMaterial.uniforms.uBioColorB.value.setStyle(bioColorB);
    baseMaterial.uniforms.uBioIntensity.value = bioIntensity;
    baseMaterial.uniforms.uBioAltFreq.value = bioAltFreq;
    baseMaterial.uniforms.uBioAltPhase.value = bioAltPhase;
    baseMaterial.uniforms.uLakeBaseY.value = lakePosY;

    // Additive overlay
    addMaterial.uniforms.uBioColorA.value.setStyle(bioColorA);
    addMaterial.uniforms.uBioColorB.value.setStyle(bioColorB);
    addMaterial.uniforms.uBioIntensity.value = bioIntensity;
    addMaterial.uniforms.uBioAltFreq.value = bioAltFreq;
    addMaterial.uniforms.uBioAltPhase.value = bioAltPhase;
    addMaterial.uniforms.uTrailGlow.value = trailGlow;

    // toggle visibility
    addMaterial.visible = !!enableAdditiveTrail;
  }, [
    baseMaterial,
    addMaterial,
    lakeOpacity,
    uWavesAmplitude,
    uWavesFrequency,
    uWavesPersistence,
    uWavesLacunarity,
    uWavesIterations,
    uWavesSpeed,
    uTroughColor,
    uSurfaceColor,
    uPeakColor,
    uPeakThreshold,
    uPeakTransition,
    uTroughThreshold,
    uTroughTransition,
    uFresnelScale,
    uFresnelPower,
    bioColorA,
    bioColorB,
    bioIntensity,
    bioAltFreq,
    bioAltPhase,
    lakePosY,
    trailGlow,
    enableAdditiveTrail,
  ]);

  // === Geometry ===
  const geom = useMemo(
    () => new THREE.PlaneGeometry(1, 1, resolution, resolution),
    [resolution]
  );

  // === Pointer → UV → splat ===
  const lastSplatT = useRef(0);
  const lastInteractT = useRef(performance.now());
  const handlePointerMove = useCallback(
    (e) => {
      const now = performance.now();
      if (now - lastSplatT.current < 12) return;
      lastSplatT.current = now;
      lastInteractT.current = now;
      if (!e.uv) return;
      trail.splat(e.uv, splatStrength, splatRadius);
    },
    [trail, splatStrength, splatRadius]
  );

  // === Tick ===
  useFrame((_, dt) => {
    const now = performance.now();
    const idleMs = now - lastInteractT.current;
    const maxDt = idleMs < 1000 ? 1 / 30 : 1 / 20;
    const step = Math.min(dt, maxDt);

    trail.update(step);

    const ink = trail.texture;
    const stamp = trail.stampTexture;

    // feed both passes
    baseMaterial.uniforms.uTrailMap.value = ink;
    baseMaterial.uniforms.uStampMap.value = stamp;
    baseMaterial.uniforms.uTime.value += dt;

    addMaterial.uniforms.uTrailMap.value = ink;
    addMaterial.uniforms.uStampMap.value = stamp;
    addMaterial.uniforms.uTime.value += dt;
  });

  // === Ref API: footprint ===
  useImperativeHandle(ref, () => ({
    getFootprint: (extraMargin = 0.45) => {
      const m = meshRef.current;
      if (!m) return null;

      const corners = [
        new THREE.Vector3(-0.5, -0.5, 0.0),
        new THREE.Vector3(0.5, -0.5, 0.0),
        new THREE.Vector3(0.5, 0.5, 0.0),
        new THREE.Vector3(-0.5, 0.5, 0.0),
      ].map((c) => c.clone().applyMatrix4(m.matrixWorld));

      let minX = +Infinity,
        maxX = -Infinity,
        minZ = +Infinity,
        maxZ = -Infinity;
      for (const p of corners) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const centerX = (minX + maxX) * 0.5,
        centerZ = (minZ + maxZ) * 0.5;
      const worldWidth = maxX - minX,
        worldDepth = maxZ - minZ;
      const sx = Math.max(1e-6, lakeSizeX),
        sz = Math.max(1e-6, lakeSizeZ);
      return {
        centerX,
        centerZ,
        width: worldWidth / sx + 2 * extraMargin,
        depth: worldDepth / sz + 2 * extraMargin,
      };
    },
  }));

  // Two meshes share transform/geom: base then additive overlay
  return (
    <group
      position={[lakePosX, lakePosY, lakePosZ]}
      rotation={rotation}
      scale={[lakeSizeX, lakeSizeZ, 1]}
    >
      <mesh
        ref={meshRef}
        geometry={geom}
        onPointerMove={handlePointerMove}
        frustumCulled
        renderOrder={10}
      >
        <primitive object={baseMaterial} attach="material" ref={baseMatRef} />
      </mesh>

      <mesh geometry={geom} frustumCulled renderOrder={11}>
        <primitive object={addMaterial} attach="material" ref={addMatRef} />
      </mesh>
    </group>
  );
});

export default Lake;
