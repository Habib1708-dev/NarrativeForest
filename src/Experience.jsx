// src/Experience.jsx
import { Perf } from "r3f-perf";
import { OrbitControls, Sky, Stars } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useRef, useState, Suspense, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import Terrain from "./components/Terrain";
import Forest from "./components/Forest";
import Cabin from "./components/Cabin";
import DebugTreeMaterials from "./debug/DebugTreeMaterials";
import Man from "./components/Man";
import Cat from "./components/Cat";

export default function Experience() {
  const skyRef = useRef();
  const starsRef = useRef(null);
  const starsBigRef = useRef(null);
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
    // StarsBig (separate larger stars)
    showStarsBig,
    starsBigCount,
    starsBigFactor,
    // Render/Lights
    exposure,
    dirLightIntensity,
  } = useControls({
    Atmosphere: folder({
      fogColor: { value: "#ffffff" },
      fogNear: { value: 0.001, min: 0.001, max: 50, step: 1 },
      fogFar: { value: 100, min: 50, max: 300, step: 5 },
    }),
    Sky: folder({
      sunPosition: { value: [5.0, -1.0, 30.0], step: 0.1 },
      rayleigh: { value: 0.01, min: 0, max: 4, step: 0.01 },
      turbidity: { value: 1.1, min: 0, max: 20, step: 0.01 },
      mieCoefficient: { value: 0, min: 0, max: 0.1, step: 0.001 },
      mieDirectionalG: { value: 0, min: 0, max: 1, step: 0.01 },
    }),
    Stars: folder({
      showStars: { value: true },
      starsRadius: { value: 360, min: 10, max: 1000, step: 1 },
      starsDepth: { value: 2, min: 1, max: 200, step: 1 },
      starsCount: { value: 20000, min: 0, max: 20000, step: 100 },
      starsFactor: { value: 4, min: 0.1, max: 20, step: 0.1 },
      starsSaturation: { value: 0, min: -1, max: 1, step: 0.01 },
      starsFade: { value: false },
      starsSpeed: { value: 0.8, min: 0, max: 10, step: 0.1 },
    }),
    Render: folder({
      exposure: { value: 0.6, min: 0.1, max: 1.5, step: 0.01 },
    }),
    StarsBig: folder({
      showStarsBig: { value: true }, // was showTintedStars: true
      starsBigCount: { value: 3720, min: 0, max: 10000, step: 10 }, // was tintedCount
      starsBigFactor: { value: 6.2, min: 0.1, max: 20, step: 0.1 }, // was tintedFactor
    }),
    Lights: folder({
      dirLightIntensity: { value: 0.1, min: 0, max: 5, step: 0.01 },
    }),
  });

  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  // Keep both star sets non-additive to avoid leaf see-through glow
  useEffect(() => {
    [starsRef.current, starsBigRef.current].forEach((pts) => {
      const mat = pts?.material;
      if (!mat) return;
      mat.transparent = false;
      mat.blending = THREE.NormalBlending;
      mat.depthTest = true;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    });
  }, [showStars, showStarsBig]);

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
          ref={starsRef}
          radius={starsRadius}
          depth={starsDepth}
          count={starsCount}
          factor={starsFactor}
          saturation={starsSaturation}
          fade={starsFade}
          speed={starsSpeed}
        />
      )}
      {showStarsBig && (
        <Stars
          ref={starsBigRef}
          radius={starsRadius}
          depth={starsDepth}
          count={starsBigCount}
          factor={starsBigFactor}
          saturation={0} // keep white; just larger points
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
        intensity={dirLightIntensity}
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

      <DebugTreeMaterials
        url="/models/tree/Spruce/spruce.glb"
        label="SpruceTree"
      />
    </>
  );
}
