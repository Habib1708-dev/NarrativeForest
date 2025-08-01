import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useControls } from "leva";

// Import shaders
import vertexShader from "../shaders/terrain/vertex.glsl";
import fragmentShader from "../shaders/terrain/fragment.glsl";

export default function Terrain() {
  const terrainRef = useRef();

  // Define terrain dimensions
  const width = 100;
  const height = 100;
  const widthSegments = 512;
  const heightSegments = 512;

  // Create a ref for storing uniforms
  const uniformsRef = useRef({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#3f3f3f") },
    uElevation: { value: 2.0 },
    uFrequency: { value: 1.0 },
    uSeed: { value: 0 },
  });

  // Add controls with Leva
  const { terrainColor, elevation, frequency, seed } = useControls("Terrain", {
    terrainColor: "#3f3f3f",
    elevation: { value: 2.0, min: 0, max: 10, step: 0.1 },
    frequency: { value: 1.0, min: 0.1, max: 3, step: 0.05 },
    seed: { value: 0, min: 0, max: 100, step: 1 },
  });

  // Update uniforms when controls change
  useEffect(() => {
    uniformsRef.current.uColor.value.set(terrainColor);
    uniformsRef.current.uElevation.value = elevation;
    uniformsRef.current.uFrequency.value = frequency;
    uniformsRef.current.uSeed.value = seed;
  }, [terrainColor, elevation, frequency, seed]);

  return (
    <mesh
      ref={terrainRef}
      rotation={[-Math.PI / 2, 0, 0]} // Rotate to be horizontal
      receiveShadow
      position={[0, -1, 0]} // Slightly below center
    >
      <planeGeometry args={[width, height, widthSegments, heightSegments]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniformsRef.current}
        side={THREE.DoubleSide}
        wireframe={false}
      />
    </mesh>
  );
}
