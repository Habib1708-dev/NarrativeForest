// src/Experience.jsx
import { Perf } from "r3f-perf";
import { OrbitControls, Sky, Stars } from "@react-three/drei";
import { useControls, folder } from "leva";
import {
  useRef,
  useState,
  Suspense,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";

// Scene pieces
import Cabin from "./components/Cabin";
import Man from "./components/Man";
import Cat from "./components/Cat";
import UnifiedForwardFog from "./fog/UnifiedForwardFog";
import FogParticleSystem from "./components/FogParticleSystem";
import RadioTower from "./components/RadioTower";
import Lake from "./components/Lake";
import DistanceFade from "./fog/DistanceFade";

// Tiled terrain and heightfield
import TerrainTiled from "./components/TerrainTiled";
import { heightAt as sampleHeight } from "./proc/heightfield";

// NEW
import ForestDynamic from "./components/ForestDynamic";
import "./three-bvh-setup";

export default function Experience() {
  const { gl } = useThree();

  const [cabinObj, setCabinObj] = useState(null);
  const [manObj, setManObj] = useState(null);
  const [catObj, setCatObj] = useState(null);
  const [forestObj, setForestObj] = useState(null);
  const [radioTowerObj, setRadioTowerObj] = useState(null);

  const handleCabinRef = useCallback((obj) => obj && setCabinObj(obj), []);
  const handleManRef = useCallback((obj) => obj && setManObj(obj), []);
  const handleCatRef = useCallback((obj) => obj && setCatObj(obj), []);
  const handleForestRef = useCallback((obj) => obj && setForestObj(obj), []);
  const handleRadioTowerRef = useCallback(
    (obj) => obj && setRadioTowerObj(obj),
    []
  );

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

    // Unified fog params used by FogParticleSystem
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

  const occluders = useMemo(
    () => [cabinObj, manObj, catObj, forestObj, radioTowerObj].filter(Boolean),
    [cabinObj, manObj, catObj, forestObj, radioTowerObj]
  );

  // NEW: grab TerrainTiled group for raycasts (ForestDynamic / Fog can use it)
  const terrainRef = useRef(null);

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
        <Cabin ref={handleCabinRef} />
        <Man ref={handleManRef} />
        <Cat ref={handleCatRef} />
        <RadioTower ref={handleRadioTowerRef} />
        <Lake />

        {/* Fog particles */}
        <FogParticleSystem
          terrainMesh={terrainRef.current /* group */}
          cellSize={2}
          occluders={occluders}
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
        />

        {/* NEW: Size-less forest, tied to DistanceFade & tile extents */}
        <ForestDynamic
          terrainGroup={terrainRef.current}
          fadeDistStart={fDistStart}
          fadeDistEnd={fDistEnd}
          tileSize={TERRAIN_TILE_SIZE}
          terrainLoadRadius={TERRAIN_LOAD_RADIUS}
          // Optional exclusion to keep cabin clearing (example):
          exclusion={{ centerX: -1.4, centerZ: -2.7, width: 1.1, depth: 1.1 }}
        />
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
