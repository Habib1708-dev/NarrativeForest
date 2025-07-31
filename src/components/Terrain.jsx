import React, { useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { useControls } from "leva";

export default function Terrain() {
  // Load heightmap texture
  const heightMap = useLoader(
    THREE.TextureLoader,
    "/textures/terrain-texture/Rolling Hills Height Map.png"
  );

  // Leva controls
  const { size, subdivisions, displacementScale, wireframe, color } =
    useControls("Terrain", {
      size: { value: 200, min: 50, max: 1000, step: 10 },
      subdivisions: { value: 256, min: 32, max: 512, step: 16 },
      displacementScale: { value: 20, min: 1, max: 100, step: 1 },
      color: "#808080",
      wireframe: false,
    });

  // Create material with displacement map
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        map: heightMap,
        displacementMap: heightMap,
        displacementScale,
        side: THREE.DoubleSide,
        wireframe,
      }),
    [heightMap, displacementScale, color, wireframe]
  );

  return (
    <mesh rotation-x={-Math.PI * 0.5} position-y={0} receiveShadow castShadow>
      {/* Plane size and subdivisions controlled by Leva */}
      <planeGeometry args={[size, size, subdivisions, subdivisions]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
