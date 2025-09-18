// src/components/Lake.jsx
import React, {
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useControls, folder } from "leva";
import lakeVertexShader from "../shaders/lake/vertex.glsl?raw";
import lakeFragmentShader from "../shaders/lake/fragment.glsl?raw";

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

  // 1×1 "empty" texture to feed into dye/stamp uniforms (no emission)
  const emptyTexture = useMemo(() => {
    const t = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat
    );
    t.needsUpdate = true;
    return t;
  }, []);

  // === Material ===
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

        // Trail-related uniforms are still present but neutralized
        uTrailMap: { value: null },
        uStampMap: { value: null },
        uTrailTexel: { value: new THREE.Vector2(1 / 128, 1 / 128) },

        // Bioluminescence uniforms kept for shader compatibility; intensity = 0
        uBioColorA: { value: new THREE.Color("#ffffff") },
        uBioColorB: { value: new THREE.Color("#ffffff") },
        uBioIntensity: { value: 0.0 },
        uBioAltFreq: { value: 0.0 },
        uBioAltPhase: { value: 0.0 },

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

  // Live updates (colors, waves, fresnel, opacity, pose)
  useEffect(() => {
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

    baseMaterial.uniforms.uLakeBaseY.value = lakePosY;
  }, [
    baseMaterial,
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
    lakePosY,
  ]);

  // Feed empty textures so shader paths referencing dye/stamp remain valid
  useEffect(() => {
    baseMaterial.uniforms.uTrailMap.value = emptyTexture;
    baseMaterial.uniforms.uStampMap.value = emptyTexture;
    // uTrailTexel can be any small value; 1/128 is fine and unused effectively
    baseMaterial.uniforms.uTrailTexel.value.set(1 / 128, 1 / 128);
  }, [baseMaterial, emptyTexture]);

  // === Geometry ===
  const geom = useMemo(
    () => new THREE.PlaneGeometry(1, 1, resolution, resolution),
    [resolution]
  );

  // === Tick (only wave time) ===
  useFrame((_, dt) => {
    baseMaterial.uniforms.uTime.value += dt;
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

  // Single mesh (no additive overlay)
  return (
    <group
      position={[lakePosX, lakePosY, lakePosZ]}
      rotation={rotation}
      scale={[lakeSizeX, lakeSizeZ, 1]}
    >
      <mesh ref={meshRef} geometry={geom} frustumCulled renderOrder={10}>
        <primitive object={baseMaterial} attach="material" ref={baseMatRef} />
      </mesh>
    </group>
  );
});

export default Lake;
