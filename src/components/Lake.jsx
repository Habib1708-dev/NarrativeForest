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

const Lake = forwardRef(function Lake(
  {
    // initial transform
    position = [-2, 0.0, -2],
    rotation = [Math.PI * 0.5, 0, 0],
    resolution = 128,
    envMap = null, // optional THREE.CubeTexture
  },
  ref
) {
  const meshRef = useRef();
  const matRef = useRef();
  const { gl } = useThree();

  // === Controls ===
  // 1) Transform (X/Y/Z) via Leva
  const { lakePosX, lakePosY, lakePosZ } = useControls("Lake", {
    Transform: folder({
      lakePosX: { value: -1.8, min: -20, max: 20, step: 0.01 },
      lakePosY: { value: -4.82, min: -10, max: 10, step: 0.01 },
      lakePosZ: { value: -2.8, min: -20, max: 20, step: 0.01 },
    }),
  });

  // 2) Size — DOUBLE the visual size by default
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

  // 3) Waves, colors, thresholds, fresnel, bioluminescence, opacity
  const {
    // waves
    uWavesAmplitude,
    uWavesFrequency,
    uWavesPersistence,
    uWavesLacunarity,
    uWavesIterations,
    uWavesSpeed,
    // colors/thresholds (now relative to lake Y, i.e. small numbers around 0)
    uTroughColor,
    uSurfaceColor,
    uPeakColor,
    uPeakThreshold,
    uPeakTransition,
    uTroughThreshold,
    uTroughTransition,
    // fresnel
    uFresnelScale,
    uFresnelPower,
    // opacity
    lakeOpacity,
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
      uTroughColor: { value: "#767676" },
      uSurfaceColor: { value: "#b1b1b1" },
      uPeakColor: { value: "#bebebe" },
    }),
    // IMPORTANT: thresholds tuned for local elevation (± few centimeters)
    Thresholds: folder({
      uPeakThreshold: { value: 0.01, min: -0.1, max: 0.1, step: 0.001 },
      uPeakTransition: { value: 0.02, min: 0.001, max: 0.1, step: 0.001 },
      uTroughThreshold: { value: -0.005, min: -0.1, max: 0.1, step: 0.001 },
      uTroughTransition: { value: 0.06, min: 0.001, max: 0.3, step: 0.001 },
    }),
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
    Bioluminescence: folder({
      bioColorA: { value: "#2cc3ff" },
      bioColorB: { value: "#00ff88" },
      bioIntensity: { value: 3, min: 0, max: 4, step: 0.05 },
      bioAltFreq: { value: 6.28318, min: 0.0, max: 20.0, step: 0.05 },
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

  // Dispose TrailFluid on unmount (GPU RT leak guard)
  useEffect(() => {
    return () => {
      trail?.dispose?.();
    };
  }, [trail]);

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
  }, [trail, decay, diffusion, flowScale, flowFrequency, fadeWindow, splatRadius, splatStrength]);

  // === Shader material (opacity now controlled) ===
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lakeVertexShader,
      fragmentShader: lakeFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.9 }, // default; will be synced from leva
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

        // Thresholds (now relative to lake Y)
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

        // GLSL1-friendly texel size
        uTrailTexel: { value: new THREE.Vector2(1 / 128, 1 / 128) },

        // NEW: lake base Y so thresholds are local to the water surface
        uLakeBaseY: { value: lakePosY },
      },
      transparent: lakeOpacity < 1.0, // enable blending when needed
      depthTest: true,
      side: THREE.DoubleSide,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep uTrailTexel in sync with the TrailFluid size
  useEffect(() => {
    if (!material || !trail) return;
    const tex = 1 / (trail.size ?? 128);
    material.uniforms.uTrailTexel.value.set(tex, tex);
  }, [material, trail]);

  // Live-update uniforms from controls
  useEffect(() => {
    if (!material) return;

    // Opacity + transparent toggle
    material.uniforms.uOpacity.value = lakeOpacity;
    material.transparent = lakeOpacity < 1.0;

    // Waves
    material.uniforms.uWavesAmplitude.value = uWavesAmplitude;
    material.uniforms.uWavesFrequency.value = uWavesFrequency;
    material.uniforms.uWavesPersistence.value = uWavesPersistence;
    material.uniforms.uWavesLacunarity.value = uWavesLacunarity;
    material.uniforms.uWavesIterations.value = uWavesIterations;
    material.uniforms.uWavesSpeed.value = uWavesSpeed;

    // Colors & thresholds (relative)
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

    // Bio
    material.uniforms.uBioColorA.value.setStyle(bioColorA);
    material.uniforms.uBioColorB.value.setStyle(bioColorB);
    material.uniforms.uBioIntensity.value = bioIntensity;
    material.uniforms.uBioAltFreq.value = bioAltFreq;
    material.uniforms.uBioAltPhase.value = bioAltPhase;

    // Keep lake base Y up to date as you move the lake
    material.uniforms.uLakeBaseY.value = lakePosY;
  }, [material, lakeOpacity, uWavesAmplitude, uWavesFrequency, uWavesPersistence, uWavesLacunarity, uWavesIterations, uWavesSpeed, uTroughColor, uSurfaceColor, uPeakColor, uPeakThreshold, uPeakTransition, uTroughThreshold, uTroughTransition, uFresnelScale, uFresnelPower, bioColorA, bioColorB, bioIntensity, bioAltFreq, bioAltPhase, lakePosY]);

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
      const now = performance.now();
      if (now - lastSplatT.current < 12) return;
      lastSplatT.current = now;
      lastInteractT.current = now;
      if (!e.uv) return;
      trail.splat(e.uv, splatStrength, splatRadius);
    },
    [trail, splatStrength, splatRadius]
  );

  // === Idle-aware simulation tick ===
  useFrame((_, dt) => {
    const now = performance.now();
    const idleMs = now - lastInteractT.current;
    const maxDt = idleMs < 1000 ? 1 / 30 : 1 / 20;
    const step = Math.min(dt, maxDt);

    trail.update(step);

    if (material) {
      material.uniforms.uTrailMap.value = trail.texture;
      material.uniforms.uStampMap.value = trail.stampTexture;
      material.uniforms.uTime.value += dt;
    }
  });

  // === Expose world-space footprint via ref ===
  useImperativeHandle(ref, () => ({
    getFootprint: (extraMargin = 0.45) => {
      const m = meshRef.current;
      if (!m) return null;

      // PlaneGeometry(1,1) LOCAL corners (XY plane)
      const corners = [
        new THREE.Vector3(-0.5, -0.5, 0.0),
        new THREE.Vector3(0.5, -0.5, 0.0),
        new THREE.Vector3(0.5, 0.5, 0.0),
        new THREE.Vector3(-0.5, 0.5, 0.0),
      ];
      const w = corners.map((c) => c.clone().applyMatrix4(m.matrixWorld));

      let minX = +Infinity,
        maxX = -Infinity,
        minZ = +Infinity,
        maxZ = -Infinity;
      for (const p of w) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }

      // Actual world center
      const centerX = (minX + maxX) * 0.5;
      const centerZ = (minZ + maxZ) * 0.5;

      // Report a **scale-invariant** width/depth to keep the exclusion unchanged.
      const worldWidth = maxX - minX;
      const worldDepth = maxZ - minZ;

      const sx = Math.max(1e-6, lakeSizeX);
      const sz = Math.max(1e-6, lakeSizeZ);
      const reportedWidth = worldWidth / sx; // undo visual X scale
      const reportedDepth = worldDepth / sz; // undo visual Z scale

      return {
        centerX,
        centerZ,
        width: reportedWidth + 2 * extraMargin,
        depth: reportedDepth + 2 * extraMargin,
      };
    },
  }));

  return (
    <mesh
      ref={meshRef}
      position={[lakePosX, lakePosY, lakePosZ]}
      rotation={rotation}
      scale={[lakeSizeX, lakeSizeZ, 1]}
      geometry={geom}
      onPointerMove={handlePointerMove}
      frustumCulled={true}
    >
      <primitive object={material} attach="material" ref={matRef} />
    </mesh>
  );
});

export default Lake;
