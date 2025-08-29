import React, { useMemo, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useControls, folder } from "leva";
import lakeVertexShader from "../shaders/lake/vertex.glsl?raw";
import lakeFragmentShader from "../shaders/lake/fragment.glsl?raw";
import { TrailFluid } from "../fx/TrailFluid";

export default function Lake({
  position = [-2, 0.0, -2], // <- keep above terrain a bit
  rotation = [Math.PI * 0.5, 0, 0],
  resolution = 64,
  envMap = null, // optional CubeTexture
}) {
  const meshRef = useRef();
  const matRef = useRef();
  const raycaster = useRef(new THREE.Raycaster());
  const mouseNDC = useRef(new THREE.Vector2());
  const { gl, camera } = useThree();

  // Controls
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
    uOpacity,
    uFresnelScale,
    uFresnelPower,
    // bioluminescence (fluid map)
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
      uTroughColor: { value: "#b1c9d6ff" },
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
      uOpacity: { value: 1.0, min: 0, max: 1, step: 0.01 },
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

  // Fluid trail buffer
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
  }, [gl]); // create once; params set below in an effect

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

  // Shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lakeVertexShader,
      fragmentShader: lakeFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: uOpacity },
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

        // bioluminescent dye + stamp maps
        uTrailMap: { value: null }, // filled per-frame
        uStampMap: { value: null }, // filled per-frame
        uBioColorA: { value: new THREE.Color(bioColorA) },
        uBioColorB: { value: new THREE.Color(bioColorB) },
        uBioIntensity: { value: bioIntensity },
        uBioAltFreq: { value: bioAltFreq },
        uBioAltPhase: { value: bioAltPhase },
      },
      transparent: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // build once; we'll live-update uniforms below

  // live-update uniforms on control changes
  useEffect(() => {
    if (!material) return;
    material.uniforms.uOpacity.value = uOpacity;

    material.uniforms.uWavesAmplitude.value = uWavesAmplitude;
    material.uniforms.uWavesFrequency.value = uWavesFrequency;
    material.uniforms.uWavesPersistence.value = uWavesPersistence;
    material.uniforms.uWavesLacunarity.value = uWavesLacunarity;
    material.uniforms.uWavesIterations.value = uWavesIterations;
    material.uniforms.uWavesSpeed.value = uWavesSpeed;

    material.uniforms.uTroughColor.value.setStyle(uTroughColor);
    material.uniforms.uSurfaceColor.value.setStyle(uSurfaceColor);
    material.uniforms.uPeakColor.value.setStyle(uPeakColor);

    material.uniforms.uPeakThreshold.value = uPeakThreshold;
    material.uniforms.uPeakTransition.value = uPeakTransition;
    material.uniforms.uTroughThreshold.value = uTroughThreshold;
    material.uniforms.uTroughTransition.value = uTroughTransition;

    material.uniforms.uFresnelScale.value = uFresnelScale;
    material.uniforms.uFresnelPower.value = uFresnelPower;

    material.uniforms.uBioColorA.value.setStyle(bioColorA);
    material.uniforms.uBioColorB.value.setStyle(bioColorB);
    material.uniforms.uBioIntensity.value = bioIntensity;
    material.uniforms.uBioAltFreq.value = bioAltFreq;
    material.uniforms.uBioAltPhase.value = bioAltPhase;
  }, [
    material,
    uOpacity,
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

  // geometry
  const geom = useMemo(
    () => new THREE.PlaneGeometry(1, 1, resolution, resolution),
    [resolution]
  );

  // pointer → UV → splat
  const onPointerMove = useCallback(
    (e) => {
      if (!meshRef.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      mouseNDC.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.current.setFromCamera(mouseNDC.current, camera);
      const hit = raycaster.current.intersectObject(meshRef.current, false)[0];
      if (hit && hit.uv) {
        trail.splat(hit.uv, splatStrength, splatRadius);
      }
    },
    [camera, gl, trail, splatStrength, splatRadius]
  );

  useEffect(() => {
    const el = gl.domElement;
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => el.removeEventListener("pointermove", onPointerMove);
  }, [gl, onPointerMove]);

  // frame loop
  useFrame((_, dt) => {
    if (trail) {
      trail.update(Math.min(dt, 1 / 30)); // clamp dt for stability
      if (material) {
        material.uniforms.uTrailMap.value = trail.texture;
        material.uniforms.uStampMap.value = trail.stampTexture; // NEW: pass age field
      }
    }
    if (material) material.uniforms.uTime.value += dt;
  });

  return (
    <mesh ref={meshRef} position={position} rotation={rotation} geometry={geom}>
      <primitive object={material} attach="material" ref={matRef} />
    </mesh>
  );
}
