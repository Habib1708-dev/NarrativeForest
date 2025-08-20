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
import Man from "./components/Man";
import Cat from "./components/Cat";
import CombinedFog from "./fog/CombinedFog"; // ⬅️ has noiseBoost/near/far/animFar

export default function Experience() {
  const skyRef = useRef();
  const starsRef = useRef(null);
  const starsBigRef = useRef(null);
  const [terrainMesh, setTerrainMesh] = useState(null);

  const {
    // Built-in scene fog (kept so USE_FOG is defined)
    fogColor,
    fogNear,
    fogFar,
    fogMode,
    fogDensity,
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
    // Big stars
    showStarsBig,
    starsBigCount,
    starsBigFactor,
    // Render/Lights
    exposure,
    dirLightIntensity,
    // CombinedFog – base extinction fog
    cEnabled,
    cColor,
    cDensity,
    cExtinction,
    cFogHeight,
    cFadeStart,
    cFadeEnd,
    cDistStart,
    cDistEnd,
    cLightDir,
    cLightIntensity,
    cAnisotropy,
    cSkyRadius,
    // CombinedFog – culled noise layer (existing)
    nEnabled,
    nDir,
    nSpeed,
    nFrequency,
    nDistortion,
    nInfluence,
    nBoxCenter,
    nBoxHalf,
    nMaxDist,
    // CombinedFog – NEW: near-only shaping + far LOD + separate gain
    nBoost,
    nNear,
    nFar,
    nAnimFar,
  } = useControls({
    Atmosphere: folder({
      fogColor: { value: "#585858" },
      fogMode: { value: "exp2", options: ["linear", "exp2"] },
      fogNear: { value: 4, min: 0, max: 50, step: 1 },
      fogFar: { value: 10, min: 3, max: 30, step: 3 },
      fogDensity: { value: 0.3, min: 0.0, max: 0.8, step: 0.001 },
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
      showStarsBig: { value: true },
      starsBigCount: { value: 3720, min: 0, max: 10000, step: 10 },
      starsBigFactor: { value: 6.2, min: 0.1, max: 20, step: 0.1 },
    }),
    Lights: folder({
      dirLightIntensity: { value: 0.1, min: 0, max: 5, step: 0.01 },
    }),

    // ---- Combined Fog (base extinction fog) ----
    "Combined Fog": folder({
      cEnabled: { value: true },
      cColor: { value: "#c1c1c1" },
      cDensity: { value: 1.96, min: 0.0, max: 3.0, step: 0.01 },
      cExtinction: { value: 0.1, min: 0.01, max: 5.0, step: 0.01 },
      cFogHeight: { value: -3.9, min: -20.0, max: 40.0, step: 0.1 },
      cFadeStart: { value: 3.9, min: 0.0, max: 200.0, step: 0.1 },
      cFadeEnd: { value: 41.3, min: 0.0, max: 300.0, step: 0.1 },
      cDistStart: { value: 0.0, min: 0.0, max: 500.0, step: 1.0 },
      cDistEnd: { value: 92.0, min: 0.0, max: 1000.0, step: 1.0 },
      cLightDir: { value: [-0.5, 0.8, -0.4] },
      cLightIntensity: { value: 0.0, min: 0.0, max: 2.0, step: 0.01 },
      cAnisotropy: { value: 0.0, min: -0.8, max: 0.8, step: 0.01 },
      cSkyRadius: { value: 100.0, min: 50, max: 4000, step: 10 },
    }),

    // ---- Combined Fog (animated local noise, culled) ----
    "Combined Fog / Noise": folder({
      nEnabled: { value: true, label: "Enable Noise" },
      nDir: { value: [-2.19, -4.18, -2.69], label: "Direction" },
      nSpeed: { value: 0.2, min: 0, max: 5, step: 0.01, label: "Speed" },
      nFrequency: {
        value: 0.01,
        min: 0.01,
        max: 0.3,
        step: 0.001,
        label: "Frequency",
      },
      nDistortion: {
        value: 0.74,
        min: 0.0,
        max: 1.5,
        step: 0.01,
        label: "Distortion",
      },
      nInfluence: {
        value: 1.14,
        min: 0.0,
        max: 1.5,
        step: 0.01,
        label: "Influence",
      },
      nBoxCenter: { value: [0, -5, 0], label: "Box Center" },
      nBoxHalf: { value: [10, 2, 10], label: "Box Half-Size" },
      nMaxDist: {
        value: 10,
        min: 5,
        max: 80,
        step: 1,
        label: "Max Camera Dist",
      },

      // NEW: separate gain + near-only shaping + far LOD
      nBoost: {
        value: 2.25,
        min: 0.0,
        max: 6.0,
        step: 0.01,
        label: "Noise Boost",
      },
      nNear: {
        value: 0.0,
        min: 0.0,
        max: 50.0,
        step: 0.1,
        label: "Near Start",
      },
      nFar: {
        value: 16.0,
        min: 0.0,
        max: 100.0,
        step: 0.1,
        label: "Near End",
      },
      nAnimFar: {
        value: 10.0,
        min: 0.0,
        max: 200.0,
        step: 0.1,
        label: "Freeze Anim ≥",
      },
    }),
  });

  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

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

      {/* Built-in scene fog (kept to define USE_FOG in built-in materials) */}
      {fogMode === "exp2" ? (
        <fogExp2 attach="fog" args={[fogColor, fogDensity]} />
      ) : (
        <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      )}

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
          saturation={0}
          fade={starsFade}
          speed={starsSpeed}
        />
      )}

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
        <Terrain
          ref={(m) => {
            console.log("[Experience] got terrainMesh:", m);
            setTerrainMesh(m);
          }}
        />
        <Forest terrainMesh={terrainMesh} />
        <Cabin />
        <Man />
        <Cat />
      </Suspense>

      {/* Combined forward fog (base extinction + culled animated noise + skydome) */}
      <CombinedFog
        enabled={cEnabled}
        color={cColor}
        density={cDensity}
        extinction={cExtinction}
        fogHeight={cFogHeight}
        fadeStart={cFadeStart}
        fadeEnd={cFadeEnd}
        distFadeStart={cDistStart}
        distFadeEnd={cDistEnd}
        lightDir={cLightDir}
        lightIntensity={cLightIntensity}
        anisotropy={cAnisotropy}
        skyRadius={cSkyRadius}
        enableNoiseFog={nEnabled}
        noiseDirection={nDir}
        noiseSpeed={nSpeed}
        noiseFrequency={nFrequency}
        noiseDistortion={nDistortion}
        noiseInfluence={nInfluence}
        noiseBoxCenter={nBoxCenter}
        noiseBoxHalfSize={nBoxHalf}
        noiseMaxDistance={nMaxDist}
        // NEW props
        noiseBoost={nBoost}
        noiseNear={nNear}
        noiseFar={nFar}
        noiseAnimFar={nAnimFar}
      />
    </>
  );
}
