// src/Experience.jsx
import { Perf } from "r3f-perf";
import { OrbitControls, Sky } from "@react-three/drei";
import Terrain from "./components/Terrain";
import Forest from "./components/Forest";
import { useControls, folder } from "leva";
import { useRef, useState } from "react";
import Tree from "./components/Tree";
import TreeTwo from "./components/TreeTwo";

export default function Experience() {
  const skyRef = useRef();
  const [terrainMesh, setTerrainMesh] = useState(null);

  const terrainRefCallback = (mesh) => {
    // mesh will be null on unmount; skip
    if (mesh) setTerrainMesh(mesh);
  };

  // Fog & sky controls
  const { sunPosition, fogColor, fogNear, fogFar } = useControls({
    Atmosphere: folder({
      sunPosition: { value: [1, 0.3, 2], step: 0.1 },
      fogColor: { value: "#ff9966" },
      fogNear: { value: 10, min: 1, max: 50, step: 1 },
      fogFar: { value: 100, min: 50, max: 300, step: 5 },
    }),
  });

  return (
    <>
      <Perf position="top-left" />

      {/* Atmosphere */}
      <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      <Sky
        ref={skyRef}
        sunPosition={sunPosition}
        inclination={0.1}
        azimuth={0.25}
        distance={450000}
        rayleigh={2}
        turbidity={10}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      {/* Controls & Lights */}
      <OrbitControls
        makeDefault
        minDistance={1}
        maxDistance={200}
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.05}
        enablePan
        panSpeed={0.5}
        screenSpacePanning
        rotateSpeed={0.5}
      />
      <ambientLight intensity={1} color="#ffe0cc" />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.2}
        color="#ff9966"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      {/* 1) Tell Terrain to hand us its sampler (wrapped so it becomes state) */}
      <Terrain ref={terrainRefCallback} />

      {/* 2) Once state is a function, mount Forest */}
      <Forest terrainMesh={terrainMesh} />
      <Tree scale={[0.04, 0.04, 0.04]} position={[0, 0, 0]} />
    </>
  );
}
