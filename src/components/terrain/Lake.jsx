// src/components/Lake.jsx
import React, {
  useMemo,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useControls, folder } from "leva";
import lakeVertexShader from "../../shaders/lake/vertex.glsl?raw";
import lakeFragmentShader from "../../shaders/lake/fragment.glsl?raw";

const Lake = forwardRef(function Lake(
  {
    position = [-2, 0.0, -2],
    rotation = [Math.PI * 0.5, 0, 0],
    resolution = 140,
    // envMap prop removed - environment maps not used in this project
  },
  ref
) {
  const meshRef = useRef();

  // === Controls ===
  const {
    lakePosX,
    lakePosY,
    lakePosZ,
    lakeSizeX,
    lakeSizeZ,
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
    lakeOpacity,
  } = useControls("Lake", {
    Transform: folder({
      lakePosX: { value: -1.8, min: -20, max: 20, step: 0.01 },
      lakePosY: { value: -4.79, min: -10, max: 10, step: 0.01 },
      lakePosZ: { value: -2.8, min: -20, max: 20, step: 0.01 },
    }),
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
    Waves: folder({
      uWavesAmplitude: { value: 0.018, min: 0, max: 0.1, step: 0.001 },
      uWavesFrequency: { value: 3.0, min: 0.1, max: 3, step: 0.01 },
      uWavesPersistence: { value: 0.3, min: 0, max: 1, step: 0.01 },
      uWavesLacunarity: { value: 2.18, min: 1, max: 4, step: 0.01 },
      uWavesIterations: { value: 3, min: 1, max: 16, step: 1 },
      uWavesSpeed: { value: 0.3, min: 0, max: 2, step: 0.01 },
    }),
    Colors: folder({
      uTroughColor: { value: "#303030" },
      uSurfaceColor: { value: "#afafaf" },
      uPeakColor: { value: "#bebebe" },
    }),
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
  }, { collapsed: true });

  // === Material ===
  const uniformsRef = useRef(null);
  if (!uniformsRef.current) {
    uniformsRef.current = {
      uTime: { value: 0 },
      uOpacity: { value: 0.9 },
      // uEnvironmentMap removed - environment maps not used
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
      // Dye system uniforms removed - not used in this project
      uLakeBaseY: { value: lakePosY },
    };
  }

  const updateUniform = useCallback((name, value) => {
    const uniform = uniformsRef.current?.[name];
    if (!uniform || uniform.value === value) return;
    uniform.value = value;
  }, []);

  const updateColorUniform = useCallback((name, colorHex) => {
    const uniform = uniformsRef.current?.[name];
    if (!uniform) return;
    uniform.value.setStyle(colorHex);
  }, []);

  const baseMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lakeVertexShader,
      fragmentShader: lakeFragmentShader,
      uniforms: uniformsRef.current,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Environment map effect removed - not used in this project

  useEffect(() => {
    updateUniform("uOpacity", lakeOpacity);
    baseMaterial.transparent = lakeOpacity < 1.0;
  }, [lakeOpacity, updateUniform, baseMaterial]);

  useEffect(() => {
    updateUniform("uWavesAmplitude", uWavesAmplitude);
    updateUniform("uWavesFrequency", uWavesFrequency);
    updateUniform("uWavesPersistence", uWavesPersistence);
    updateUniform("uWavesLacunarity", uWavesLacunarity);
    updateUniform("uWavesIterations", uWavesIterations);
    updateUniform("uWavesSpeed", uWavesSpeed);
  }, [updateUniform, uWavesAmplitude, uWavesFrequency, uWavesPersistence, uWavesLacunarity, uWavesIterations, uWavesSpeed]);

  useEffect(() => {
    updateColorUniform("uTroughColor", uTroughColor);
    updateColorUniform("uSurfaceColor", uSurfaceColor);
    updateColorUniform("uPeakColor", uPeakColor);

    updateUniform("uPeakThreshold", uPeakThreshold);
    updateUniform("uPeakTransition", uPeakTransition);
    updateUniform("uTroughThreshold", uTroughThreshold);
    updateUniform("uTroughTransition", uTroughTransition);
  }, [updateColorUniform, updateUniform, uPeakColor, uPeakThreshold, uPeakTransition, uSurfaceColor, uTroughColor, uTroughThreshold, uTroughTransition]);

  useEffect(() => {
    updateUniform("uFresnelScale", uFresnelScale);
    updateUniform("uFresnelPower", uFresnelPower);
  }, [updateUniform, uFresnelPower, uFresnelScale]);

  useEffect(() => {
    updateUniform("uLakeBaseY", lakePosY);
  }, [lakePosY, updateUniform]);

  // === Geometry ===
  const geom = useMemo(
    () => new THREE.PlaneGeometry(1, 1, resolution, resolution),
    [resolution]
  );

  // === Tick (only wave time) ===
  useFrame((_, dt) => {
    uniformsRef.current.uTime.value += dt;
  });

  const lakePosition = useMemo(
    () => [lakePosX, lakePosY, lakePosZ],
    [lakePosX, lakePosY, lakePosZ]
  );
  const lakeScale = useMemo(
    () => [lakeSizeX, lakeSizeZ, 1],
    [lakeSizeX, lakeSizeZ]
  );

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
    <group position={lakePosition} rotation={rotation} scale={lakeScale}>
      <mesh ref={meshRef} geometry={geom} frustumCulled renderOrder={10}>
        <primitive object={baseMaterial} attach="material" />
      </mesh>
    </group>
  );
});

export default Lake;
