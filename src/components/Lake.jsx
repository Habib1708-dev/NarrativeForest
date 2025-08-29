// src/components/Lake.jsx
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
  resolution = 52,
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
    bioColor,
    bioIntensity,
    decay,
    diffusion,
    flowScale,
    flowFrequency,
    splatRadius,
    splatStrength,
    //gradual decay
    fadeWindow,
  } = useControls("Lake", {
    Waves: folder({
      uWavesAmplitude: { value: 0.025, min: 0, max: 0.1, step: 0.001 },
      uWavesFrequency: { value: 1.07, min: 0.1, max: 3, step: 0.01 },
      uWavesPersistence: { value: 0.3, min: 0, max: 1, step: 0.01 },
      uWavesLacunarity: { value: 2.18, min: 1, max: 4, step: 0.01 },
      uWavesIterations: { value: 8, min: 1, max: 16, step: 1 },
      uWavesSpeed: { value: 0.4, min: 0, max: 2, step: 0.01 },
    }),
    Colors: folder({
      uTroughColor: { value: "#186691" },
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
      uOpacity: { value: 0.85, min: 0, max: 1, step: 0.01 },
      uFresnelScale: { value: 0.8, min: 0, max: 2, step: 0.01 },
      uFresnelPower: { value: 0.5, min: 0.1, max: 2, step: 0.01 },
    }),
    Bioluminescence: folder({
      bioColor: { value: "#2cc3ff" },
      bioIntensity: { value: 1.2, min: 0, max: 3, step: 0.05 },
      decay: { value: 0.975, min: 0.9, max: 0.995, step: 0.001 },
      diffusion: { value: 0.15, min: 0.0, max: 0.5, step: 0.01 },
      flowScale: { value: 0.0035, min: 0.0, max: 0.01, step: 0.0001 },
      flowFrequency: { value: 3.0, min: 0.5, max: 6.0, step: 0.1 },
      splatRadius: { value: 0.04, min: 0.005, max: 0.15, step: 0.005 },
      splatStrength: { value: 0.9, min: 0.1, max: 3.0, step: 0.05 },
    }),
    fadeWindow: { value: 1.25, min: 0.2, max: 4.0, step: 0.05 },
  });

  // Fluid trail buffer
  const trail = useMemo(() => {
    const t = new TrailFluid(gl, {
      size: 512,
      decay,
      diffusion,
      flowScale,
      flowFrequency,
    });
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]); // create once; params set below in an effect

  useEffect(() => {
    trail.setParams({ decay, diffusion, flowScale, flowFrequency, fadeWindow });
  }, [trail, decay, diffusion, flowScale, flowFrequency, fadeWindow]);

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

        // bioluminescent dye map
        uTrailMap: { value: trail.texture },
        uBioBlueColor: { value: new THREE.Color(bioColor) },
        uBioIntensity: { value: bioIntensity },
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

    material.uniforms.uBioBlueColor.value.setStyle(bioColor);
    material.uniforms.uBioIntensity.value = bioIntensity;
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
    bioColor,
    bioIntensity,
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
      if (material) material.uniforms.uTrailMap.value = trail.texture;
    }
    if (material) material.uniforms.uTime.value += dt;
  });

  return (
    <mesh ref={meshRef} position={position} rotation={rotation} geometry={geom}>
      <primitive object={material} attach="material" ref={matRef} />
    </mesh>
  );
}
