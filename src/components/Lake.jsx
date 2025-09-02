import React, { useMemo, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useControls, folder } from "leva";
import lakeVertexShader from "../shaders/lake/vertex.glsl?raw";
import lakeFragmentShader from "../shaders/lake/fragment.glsl?raw";
import { TrailFluid } from "../fx/TrailFluid";

export default function Lake({
  position = [-2, 0.0, -2], // initial position
  rotation = [Math.PI * 0.5, 0, 0],
  resolution = 128,
  envMap = null, // optional THREE.CubeTexture
}) {
  const meshRef = useRef();
  const matRef = useRef();
  const { gl } = useThree();

  // === Controls ===
  // 1) Transform (X/Y/Z) via Leva
  const { lakePosX, lakePosY, lakePosZ } = useControls("Lake", {
    Transform: folder({
      lakePosX: { value: -1.3, min: -20, max: 20, step: 0.01 },
      lakePosY: { value: -4.89, min: -5, max: 5, step: 0.01 },
      lakePosZ: { value: -3.87, min: -20, max: 20, step: 0.01 },
    }),
  });

  // 2) Waves, colors, thresholds, fresnel, bioluminescence
  const {
    // waves
    uWavesAmplitude,
    uWavesFrequency,
    uWavesPersistence,
    uWavesLacunarity,
    uWavesIterations,
    uWavesSpeed,
    // colors/thresholds
    uTroughColor,
    uSurfaceColor,
    uPeakColor,
    uPeakThreshold,
    uPeakTransition,
    uTroughThreshold,
    uTroughTransition,
    // fresnel (opacity is hard-coded to 1.0 now)
    uFresnelScale,
    uFresnelPower,
    // bioluminescence (fluid)
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
    // gradual decay
    fadeWindow,
  } = useControls("Lake", {
    Waves: folder({
      uWavesAmplitude: { value: 0.018, min: 0, max: 0.1, step: 0.001 },
      uWavesFrequency: { value: 3.0, min: 0.1, max: 3, step: 0.01 },
      uWavesPersistence: { value: 0.3, min: 0, max: 1, step: 0.01 },
      uWavesLacunarity: { value: 2.18, min: 1, max: 4, step: 0.01 },
      uWavesIterations: { value: 3, min: 1, max: 16, step: 1 },
      uWavesSpeed: { value: 0.3, min: 0, max: 2, step: 0.01 },
    }),
    Colors: folder({
      uTroughColor: { value: "#8a9094ff" },
      uSurfaceColor: { value: "#9bd8c0" },
      uPeakColor: { value: "#bbd8e0" },
    }),
    Thresholds: folder({
      uPeakThreshold: { value: 0.08, min: -0.1, max: 0.2, step: 0.001 },
      uPeakTransition: { value: 0.05, min: 0.001, max: 0.1, step: 0.001 },
      uTroughThreshold: { value: -0.01, min: -0.1, max: 0.1, step: 0.001 },
      uTroughTransition: { value: 0.15, min: 0.001, max: 0.3, step: 0.001 },
    }),
    Material: folder({
      // uOpacity removed — always opaque for perf
      uFresnelScale: { value: 0.8, min: 0, max: 2, step: 0.01 },
      uFresnelPower: { value: 1.0, min: 0.1, max: 2, step: 0.01 },
    }),
    Bioluminescence: folder({
      bioColorA: { value: "#2cc3ff" }, // cyan-ish
      bioColorB: { value: "#00ff88" }, // green-ish
      bioIntensity: { value: 3, min: 0, max: 4, step: 0.05 },
      bioAltFreq: { value: 6.28318, min: 0.0, max: 20.0, step: 0.05 }, // 2π rad/s by age
      bioAltPhase: { value: 0.0, min: -6.28318, max: 6.28318, step: 0.01 },
      decay: { value: 0.975, min: 0.9, max: 0.995, step: 0.001 },
      diffusion: { value: 0.15, min: 0.0, max: 0.5, step: 0.01 },
      flowScale: { value: 0.0035, min: 0.0, max: 0.01, step: 0.0001 },
      flowFrequency: { value: 3.0, min: 0.5, max: 6.0, step: 0.1 },
      splatRadius: { value: 0.02, min: 0.005, max: 0.15, step: 0.005 },
      splatStrength: { value: 3, min: 0.1, max: 3.0, step: 0.05 },
    }),
    fadeWindow: { value: 12, min: 0.2, max: 16.0, step: 0.05 },
  });

  // === Trail fluid buffer ===
  const trail = useMemo(() => {
    const t = new TrailFluid(gl, {
      size: 128,
      decay,
      diffusion,
      flowScale,
      flowFrequency,
      fadeWindow,
      splatRadius,
      splatStrength,
    });
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]); // created once

  // Push runtime params to the fluid when controls change
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

  // === Shader material (always opaque: uOpacity=1.0, transparent=false) ===
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lakeVertexShader,
      fragmentShader: lakeFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 1.0 }, // hard-coded opacity
        uEnvironmentMap: { value: envMap },

        // Waves
        uWavesAmplitude: { value: uWavesAmplitude },
        uWavesFrequency: { value: uWavesFrequency },
        uWavesPersistence: { value: uWavesPersistence },
        uWavesLacunarity: { value: uWavesLacunarity },
        uWavesIterations: { value: uWavesIterations },
        uWavesSpeed: { value: uWavesSpeed },

        // Base colors
        uTroughColor: { value: new THREE.Color(uTroughColor) },
        uSurfaceColor: { value: new THREE.Color(uSurfaceColor) },
        uPeakColor: { value: new THREE.Color(uPeakColor) },

        // Thresholds
        uPeakThreshold: { value: uPeakThreshold },
        uPeakTransition: { value: uPeakTransition },
        uTroughThreshold: { value: uTroughThreshold },
        uTroughTransition: { value: uTroughTransition },

        // Fresnel
        uFresnelScale: { value: uFresnelScale },
        uFresnelPower: { value: uFresnelPower },

        // Bioluminescent maps/colors
        uTrailMap: { value: null },
        uStampMap: { value: null },
        uBioColorA: { value: new THREE.Color(bioColorA) },
        uBioColorB: { value: new THREE.Color(bioColorB) },
        uBioIntensity: { value: bioIntensity },
        uBioAltFreq: { value: bioAltFreq },
        uBioAltPhase: { value: bioAltPhase },
      },
      transparent: false, // never use blending path
      depthTest: true,
      side: THREE.DoubleSide, // your choice to keep double-sided
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-update uniforms from controls (skip uOpacity — fixed to 1.0)
  useEffect(() => {
    if (!material) return;

    // Waves
    material.uniforms.uWavesAmplitude.value = uWavesAmplitude;
    material.uniforms.uWavesFrequency.value = uWavesFrequency;
    material.uniforms.uWavesPersistence.value = uWavesPersistence;
    material.uniforms.uWavesLacunarity.value = uWavesLacunarity;
    material.uniforms.uWavesIterations.value = uWavesIterations;
    material.uniforms.uWavesSpeed.value = uWavesSpeed;

    // Colors/thresholds
    material.uniforms.uTroughColor.value.setStyle(uTroughColor);
    material.uniforms.uSurfaceColor.value.setStyle(uSurfaceColor);
    material.uniforms.uPeakColor.value.setStyle(uPeakColor);
    material.uniforms.uPeakThreshold.value = uPeakThreshold;
    material.uniforms.uPeakTransition.value = uPeakTransition;
    material.uniforms.uTroughThreshold.value = uTroughThreshold;
    material.uniforms.uTroughTransition.value = uTroughTransition;

    // Fresnel
    material.uniforms.uFresnelScale.value = uFresnelScale;
    material.uniforms.uFresnelPower.value = uFresnelPower;

    // Bio alt
    material.uniforms.uBioColorA.value.setStyle(bioColorA);
    material.uniforms.uBioColorB.value.setStyle(bioColorB);
    material.uniforms.uBioIntensity.value = bioIntensity;
    material.uniforms.uBioAltFreq.value = bioAltFreq;
    material.uniforms.uBioAltPhase.value = bioAltPhase;
  }, [
    material,
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
  ]);

  // === Geometry ===
  const geom = useMemo(
    () => new THREE.PlaneGeometry(1, 1, resolution, resolution),
    [resolution]
  );

  // === Mesh-scoped, throttled pointer → UV → splat ===
  const lastSplatT = useRef(0);
  const lastInteractT = useRef(performance.now());

  const handlePointerMove = useCallback(
    (e) => {
      // Throttle to ~83 Hz to prevent oversplats & overdraw
      const now = performance.now();
      if (now - lastSplatT.current < 12) return;
      lastSplatT.current = now;
      lastInteractT.current = now;

      // R3F provides UV on the intersection event for the mesh
      if (!e.uv) return;
      trail.splat(e.uv, splatStrength, splatRadius);
    },
    [trail, splatStrength, splatRadius]
  );

  // === Idle-aware simulation tick ===
  useFrame((_, dt) => {
    const now = performance.now();
    const idleMs = now - lastInteractT.current;

    // Full fidelity while interacting; cheaper when idle
    const maxDt = idleMs < 1000 ? 1 / 30 : 1 / 20;
    const step = Math.min(dt, maxDt);

    trail.update(step);

    if (material) {
      material.uniforms.uTrailMap.value = trail.texture;
      if (material.uniforms.uStampMap) {
        material.uniforms.uStampMap.value =
          trail.stampTexture || material.uniforms.uStampMap.value;
      }
      material.uniforms.uTime.value += dt;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[lakePosX, lakePosY, lakePosZ]} // controlled via Leva
      rotation={rotation}
      geometry={geom}
      onPointerMove={handlePointerMove}
      frustumCulled={true}
    >
      <primitive object={material} attach="material" ref={matRef} />
    </mesh>
  );
}
