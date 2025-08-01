import { useRef, useEffect } from "react";
import * as THREE from "three";
import { useControls, folder } from "leva";

// Import shaders
import vertexShader from "../shaders/terrain/vertex.glsl";
import fragmentShader from "../shaders/terrain/fragment.glsl";

export default function Terrain() {
  const terrainRef = useRef();

  // Define terrain dimensions
  const width = 300;
  const height = 300;
  const widthSegments = 512;
  const heightSegments = 512;

  // Create a ref for storing uniforms
  const uniformsRef = useRef({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#3f3f3f") },
    uElevation: { value: 2.0 },
    uFrequency: { value: 1.0 },
    uSeed: { value: 0 },
    uZoomFactor: { value: 1.0 },
    uFocusX: { value: 0.0 },
    uFocusY: { value: 0.0 },
    uLightDirection: { value: new THREE.Vector3(0.5, 1.0, 0.3) },
    uAmbientIntensity: { value: 0.3 },
    uDiffuseIntensity: { value: 0.7 },
    uFlatThreshold: { value: 0.3 },
    uFlatStrength: { value: 0.7 },
  });

  // Add controls with Leva
  const {
    terrainColor,
    elevation,
    frequency,
    seed,
    zoomFactor,
    focusX,
    focusY,
    lightX,
    lightY,
    lightZ,
    ambientIntensity,
    diffuseIntensity,
    flatThreshold,
    flatStrength,
  } = useControls({
    Terrain: folder({
      terrainColor: "#969696",
      elevation: { value: 8.7, min: 0, max: 10, step: 0.1 },
      frequency: { value: 0.75, min: 0.1, max: 3, step: 0.05 },
      seed: { value: 0, min: 0, max: 100, step: 1 },
    }),
    FlatAreas: folder({
      flatThreshold: { value: 0.0, min: 0, max: 1, step: 0.01 },
      flatStrength: { value: 0.0, min: 0, max: 1, step: 0.01 },
    }),
    Navigation: folder({
      zoomFactor: { value: 10.0, min: 0.1, max: 10, step: 0.1 },
      focusX: { value: -240.0, min: -1000, max: 1000, step: 10 },
      focusY: { value: 0, min: -1000, max: 1000, step: 10 },
    }),
    Lighting: folder({
      lightX: { value: 0.95, min: -1, max: 1, step: 0.01 },
      lightY: { value: 2.0, min: 0, max: 2, step: 0.01 },
      lightZ: { value: 1.0, min: -1, max: 1, step: 0.01 },
      ambientIntensity: { value: 0.53, min: 0, max: 1, step: 0.01 },
      diffuseIntensity: { value: 0.08, min: 0, max: 1, step: 0.01 },
    }),
  });

  // Update uniforms when controls change
  useEffect(() => {
    uniformsRef.current.uColor.value.set(terrainColor);
    uniformsRef.current.uElevation.value = elevation;
    uniformsRef.current.uFrequency.value = frequency;
    uniformsRef.current.uSeed.value = seed;
    uniformsRef.current.uZoomFactor.value = zoomFactor;
    uniformsRef.current.uFocusX.value = focusX;
    uniformsRef.current.uFocusY.value = focusY;

    // Update light uniforms
    uniformsRef.current.uLightDirection.value.set(lightX, lightY, lightZ);
    uniformsRef.current.uAmbientIntensity.value = ambientIntensity;
    uniformsRef.current.uDiffuseIntensity.value = diffuseIntensity;

    // Update flat area uniforms
    uniformsRef.current.uFlatThreshold.value = flatThreshold;
    uniformsRef.current.uFlatStrength.value = flatStrength;
  }, [
    terrainColor,
    elevation,
    frequency,
    seed,
    zoomFactor,
    focusX,
    focusY,
    lightX,
    lightY,
    lightZ,
    ambientIntensity,
    diffuseIntensity,
    flatThreshold,
    flatStrength,
  ]);

  return (
    <mesh
      ref={terrainRef}
      rotation={[-Math.PI / 2, 0, 0]} // Rotate to be horizontal
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
