// src/Experience.jsx
import { Perf } from "r3f-perf";
import { OrbitControls, Sky, Stars } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useRef, useState, Suspense, useEffect, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";

// Scene pieces
import Cabin from "./components/Cabin";
import Man from "./components/Man";
import Cat from "./components/Cat";
import FogParticleSystem from "./components/FogParticleSystem";
import RadioTower from "./components/RadioTower";
import Lake from "./components/Lake";
import DistanceFade from "./fog/DistanceFade";

// Tiled terrain and heightfield
import TerrainTiled from "./components/TerrainTiled";
import { heightAt as sampleHeight } from "./proc/heightfield";

// NEW
import ForestDynamic from "./components/ForestDynamic";
import MagicMushrooms from "./components/MagicMushrooms";
import "./three-bvh-setup";
import Fireflies from "./components/Fireflies";
import UnifiedCrystalClusters from "./components/UnifiedCrystalClusters";

export default function Experience() {
  const { gl } = useThree();

  // ==== REFS ====
  const cabinRef = useRef(null);
  const manRef = useRef(null);
  const catRef = useRef(null);
  const radioTowerRef = useRef(null);
  const lakeRef = useRef(null);
  const terrainRef = useRef(null);
  const mushroomsRef = useRef(null);

  // Forest occluders (instanced trees + rocks) — NEW
  const [forestOccluders, setForestOccluders] = useState([]);

  // Lake exclusion
  const [lakeExclusion, setLakeExclusion] = useState(null);
  const prevExclRef = useRef(null);

  const {
    fogColor,
    fogNear,
    fogFar,
    fogMode,
    fogDensity,

    sunPosition,
    rayleigh,
    turbidity,
    mieCoefficient,
    mieDirectionalG,

    exposure,

    dirLightIntensity,

    fEnabled,
    fColor,
    fDensity,
    fExtinction,
    fFogHeight,
    fFadeStart,
    fFadeEnd,
    fDistStart,
    fDistEnd,
    fLightDirX,
    fLightDirY,
    fLightDirZ,
    fLightIntensity,
    fAnisotropy,
    fSkyRadius,
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
    Render: folder({
      exposure: { value: 0.6, min: 0.1, max: 1.5, step: 0.01 },
    }),
    Lights: folder({
      dirLightIntensity: { value: 0.1, min: 0, max: 5, step: 0.01 },
    }),
    "Unified Fog": folder({
      fEnabled: { value: true },
      fColor: { value: "#98a0a5" },
      fDensity: { value: 1.96, min: 0.0, max: 3.0, step: 0.01 },
      fExtinction: { value: 0.1, min: 0.1, max: 5.0, step: 0.01 },
      fFogHeight: { value: -12.7, min: -20.0, max: 40.0, step: 0.1 },
      fFadeStart: { value: 0, min: 0.0, max: 200.0, step: 0.1 },
      fFadeEnd: { value: 51.8, min: 0.0, max: 300.0, step: 0.1 },
      fDistStart: { value: 6.0, min: 0.0, max: 500.0, step: 0.1 },
      fDistEnd: { value: 9.0, min: 0.0, max: 1000.0, step: 0.1 },
      fLightDirX: { value: -0.5, min: -1, max: 1, step: 0.01 },
      fLightDirY: { value: 0.8, min: -1, max: 1, step: 0.01 },
      fLightDirZ: { value: -0.4, min: -1, max: 1, step: 0.01 },
      fLightIntensity: { value: 0.0, min: 0.0, max: 2.0, step: 0.01 },
      fAnisotropy: { value: 0.0, min: -0.8, max: 0.8, step: 0.01 },
      fSkyRadius: { value: 100.0, min: 100, max: 4000, step: 10 },
    }),
  });

  useEffect(() => {
    gl.toneMappingExposure = exposure;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.autoClear = true;
  }, [gl, exposure]);

  // Build occluders list (don’t include the lake)
  const occluders = useMemo(
    () =>
      [
        terrainRef.current,
        cabinRef.current,
        manRef.current,
        catRef.current,
        radioTowerRef.current,
        mushroomsRef.current,
        ...forestOccluders,
      ].filter(Boolean),
    [
      terrainRef.current,
      cabinRef.current,
      manRef.current,
      catRef.current,
      radioTowerRef.current,
      mushroomsRef.current,
      forestOccluders, // updates when ForestDynamic publishes
    ]
  );

  // Lake exclusion tracking
  useFrame(() => {
    const fp = lakeRef.current?.getFootprint?.(0.45);
    if (!fp) return;

    const prev = prevExclRef.current;
    const eps = 0.02;
    const changed =
      !prev ||
      Math.abs(fp.centerX - prev.centerX) > eps ||
      Math.abs(fp.centerZ - prev.centerZ) > eps ||
      Math.abs(fp.width - prev.width) > eps ||
      Math.abs(fp.depth - prev.depth) > eps;

    if (changed) {
      prevExclRef.current = fp;
      setLakeExclusion(fp);
    }
  });

  const TERRAIN_TILE_SIZE = 4;
  const TERRAIN_LOAD_RADIUS = 2;

  return (
    <>
      <Perf position="top-left" />

      {fogMode === "exp2" ? (
        <fogExp2 attach="fog" args={[fogColor, fogDensity]} />
      ) : (
        <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      )}

      <Sky
        sunPosition={sunPosition}
        rayleigh={rayleigh}
        turbidity={turbidity}
        mieCoefficient={mieCoefficient}
        mieDirectionalG={mieDirectionalG}
      />
      <Stars
        radius={360}
        depth={2}
        count={2000}
        factor={4}
        saturation={0}
        fade={false}
        speed={0}
      />

      <OrbitControls
        makeDefault
        minDistance={1}
        maxDistance={200}
        target={[-1.25, -4.45, -2.9]}
        enableDamping
        dampingFactor={0.05}
        enablePan
        panSpeed={0.5}
        screenSpacePanning
        rotateSpeed={0.5}
      />

      <ambientLight intensity={0} />
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
        <TerrainTiled
          ref={terrainRef}
          sampleHeight={sampleHeight}
          tileSize={TERRAIN_TILE_SIZE}
          anchorMinX={-10}
          anchorMinZ={-10}
          loadRadius={TERRAIN_LOAD_RADIUS}
          dropRadius={3}
          prefetch={1}
          resolution={26}
        />

        {/* Actors */}
        <Cabin ref={cabinRef} />
        <Man ref={manRef} />
        <Cat ref={catRef} />
        {/* <RadioTower ref={radioTowerRef} /> */}
        <Lake ref={lakeRef} />

        {/* Fog particles (now include forest instanced meshes as occluders) */}
        {/* <FogParticleSystem
          terrainGroup={terrainRef.current}
          cellSize={2}
          occluders={occluders}
          exclusion={lakeExclusion}
          fogParams={{
            color: fColor,
            density: fDensity,
            extinction: fExtinction,
            fogHeight: fFogHeight,
            fadeStart: fFadeStart,
            fadeEnd: fFadeEnd,
            distFadeStart: fDistStart,
            distFadeEnd: fDistEnd,
            lightDir: [fLightDirX, fLightDirY, fLightDirZ],
            lightIntensity: fLightIntensity,
            anisotropy: fAnisotropy,
          }}
        /> */}

        {/* Forest — publish instanced meshes for fog occlusion */}
        <ForestDynamic
          terrainGroup={terrainRef.current}
          tileSize={TERRAIN_TILE_SIZE}
          terrainLoadRadius={TERRAIN_LOAD_RADIUS}
          exclusion={lakeExclusion}
          onOccludersChange={setForestOccluders}
        />
        <MagicMushrooms ref={mushroomsRef} />
        {/* <Fireflies /> */}
        <UnifiedCrystalClusters />
      </Suspense>

      <DistanceFade
        enabled
        distStart={fDistStart}
        distEnd={fDistEnd}
        clipStart={0.2}
        clipEnd={0.6}
        forceKill={false}
        debugTint={false}
      />

      <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
        <Bloom
          intensity={1.35}
          luminanceThreshold={0.7}
          luminanceSmoothing={0.08}
          kernelSize={KernelSize.LARGE}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}
