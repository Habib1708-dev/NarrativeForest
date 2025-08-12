// src/Experience.jsx
import { Perf } from "r3f-perf";
import { OrbitControls, Sky } from "@react-three/drei";
import Terrain from "./components/Terrain";
import Forest from "./components/Forest";
import Cabin from "./components/Cabin";
import DebugTreeMaterials from "./debug/DebugTreeMaterials";
import { useControls, folder } from "leva";
import { useRef, useState, Suspense } from "react";

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
      fogColor: { value: "#ffffff" },
      fogNear: { value: 0.001, min: 0.001, max: 50, step: 1 },
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
      <ambientLight intensity={0.3} color="#ffffff" />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      <Suspense fallback={null}>
        {/* 1) Tell Terrain to hand us its sampler (wrapped so it becomes state) */}
        <Terrain
          ref={(m) => {
            console.log("[Experience] got terrainMesh:", m);
            setTerrainMesh(m);
          }}
        />
        {/* 2) Once state is a function, mount Forest */}
        <Forest terrainMesh={terrainMesh} />
        <Cabin />
      </Suspense>

      <DebugTreeMaterials url="/models/cabin/Cabin.glb" label="Cabin" />
    </>
  );
}
