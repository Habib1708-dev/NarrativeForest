// src/Experience.jsx
import { Perf } from "r3f-perf";
import { OrbitControls, Sky, Stars } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useRef, useState, Suspense } from "react";
import Terrain from "./components/Terrain";
import Forest from "./components/Forest";
import Cabin from "./components/Cabin";
import DebugTreeMaterials from "./debug/DebugTreeMaterials";
import Man from "./components/Man";
import Cat from "./components/Cat";

export default function Experience() {
  const skyRef = useRef();
  const [terrainMesh, setTerrainMesh] = useState(null);

  const terrainRefCallback = (mesh) => {
    // mesh will be null on unmount; skip
    if (mesh) setTerrainMesh(mesh);
  };

  // Fog, Sky, and Stars controls
  const {
    // Fog
    fogColor,
    fogNear,
    fogFar,
    // Sky
    sunPosition,
    rayleigh,
    turbidity,
    mieCoefficient,
    mieDirectionalG,
    // Stars
    showStars,
    starsRadius,
    starsDepth,
    starsCount,
    starsFactor,
    starsSaturation,
    starsFade,
    starsSpeed,
  } = useControls({
    Atmosphere: folder({
      fogColor: { value: "#ffffff" },
      fogNear: { value: 0.001, min: 0.001, max: 50, step: 1 },
      fogFar: { value: 100, min: 50, max: 300, step: 5 },
    }),
    Sky: folder({
      sunPosition: { value: [0.0, -1.0, 0.0], step: 0.1 },
      rayleigh: { value: 0.01, min: 0, max: 4, step: 0.01 },
      turbidity: { value: 1.1, min: 0, max: 20, step: 0.1 },
      mieCoefficient: { value: 0, min: 0, max: 0.1, step: 0.001 },
      mieDirectionalG: { value: 0, min: 0, max: 1, step: 0.01 },
    }),
    Stars: folder({
      showStars: { value: false },
      starsRadius: { value: 100, min: 10, max: 1000, step: 1 },
      starsDepth: { value: 168, min: 1, max: 200, step: 1 },
      starsCount: { value: 20000, min: 0, max: 20000, step: 100 },
      starsFactor: { value: 4, min: 0.1, max: 20, step: 0.1 },
      starsSaturation: { value: 0, min: -1, max: 1, step: 0.01 },
      starsFade: { value: true },
      starsSpeed: { value: 0.8, min: 0, max: 10, step: 0.1 },
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
        rayleigh={rayleigh}
        turbidity={turbidity}
        mieCoefficient={mieCoefficient}
        mieDirectionalG={mieDirectionalG}
      />
      {showStars && (
        <Stars
          radius={starsRadius}
          depth={starsDepth}
          count={starsCount}
          factor={starsFactor}
          saturation={starsSaturation}
          fade={starsFade}
          speed={starsSpeed}
        />
      )}

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
      <ambientLight intensity={0} color="#ffffff" />
      <directionalLight
        position={[-10, 15, -10]}
        intensity={0.2}
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
        <Man />
        <Cat />
      </Suspense>

      <DebugTreeMaterials url="/models/man/man.glb" label="Man" />
    </>
  );
}
