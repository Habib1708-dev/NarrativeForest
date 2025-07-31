// Terraion Component
// This component renders a terrain mesh using custom shaders and Leva controls for parameters like size,
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";

// Import shaders
import vertexShader from "../shaders/terrain/vertex.glsl";
import fragmentShader from "../shaders/terrain/fragment.glsl";

export default function Terrain() {
  const meshRef = useRef();

  // Leva controls for terrain parameters
  const { size, subdivisions, elevation, frequency, seed, wireframe } =
    useControls("Terrain", {
      size: { value: 700, min: 50, max: 1000, step: 10 },
      subdivisions: { value: 1024, min: 32, max: 1024, step: 16 },
      elevation: { value: 68, min: 1, max: 100, step: 1 },
      frequency: { value: 1, min: 0.1, max: 5, step: 0.1 },
      seed: { value: 1.42, min: 0.1, max: 10, step: 0.01 }, // Fixed seed value
      wireframe: false,
    });

  // No color vector needed as we're using a gray gradient in the shader

  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uElevation: { value: elevation },
        uFrequency: { value: frequency },
        uSeed: { value: seed }, // Fixed seed instead of time
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      wireframe,
    });
  }, [elevation, frequency, seed, wireframe]);

  // Update uniforms when control values change
  useFrame(() => {
    if (meshRef.current) {
      // Update uniforms if they've changed via controls
      meshRef.current.material.uniforms.uElevation.value = elevation;
      meshRef.current.material.uniforms.uFrequency.value = frequency;
      meshRef.current.material.uniforms.uSeed.value = seed;
    }
  });

  return (
    <mesh
      ref={meshRef}
      rotation-x={-Math.PI * 0.5}
      position-y={0}
      receiveShadow
      castShadow
    >
      {/* Plane size and subdivisions controlled by Leva */}
      <planeGeometry args={[size, size, subdivisions, subdivisions]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
