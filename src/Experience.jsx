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
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Scene pieces
import Terrain from "./components/Terrain";
import Forest from "./components/Forest";
import Cabin from "./components/Cabin";
import Man from "./components/Man";
import Cat from "./components/Cat";
import UnifiedForwardFog from "./fog/UnifiedForwardFog";
import FogParticleSystem from "./components/FogParticleSystem";
import RadioTower from "./components/RadioTower";

export default function Experience() {
  // Refs
  const skyRef = useRef(); // the <Sky> mesh (layer 1)
  const starsWrapRef = useRef(); // group for <Stars> (layer 1)
  const skyCamRef = useRef(null); // the background camera (renders layer 1)

  // Three handles
  const { gl, size } = useThree();
  const SKY_FAR = 5000;

  // One-time capture of the Terrain mesh to avoid setState loops
  const [terrainMesh, setTerrainMesh] = useState(null);
  const terrainCaptured = useRef(false);
  const handleTerrainRef = useCallback((m) => {
    if (!terrainCaptured.current && m) {
      terrainCaptured.current = true;
      setTerrainMesh(m);
    }
  }, []);

  // Collect important objects via callback refs (no re-renders after first set)
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

  // Controls (no Stars folder here — stars use defaults)
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
      fDistStart: { value: 0.0, min: 0.0, max: 500.0, step: 1.0 },
      fDistEnd: { value: 92.0, min: 0.0, max: 1000.0, step: 1.0 },
      fLightDirX: { value: -0.5, min: -1, max: 1, step: 0.01 },
      fLightDirY: { value: 0.8, min: -1, max: 1, step: 0.01 },
      fLightDirZ: { value: -0.4, min: -1, max: 1, step: 0.01 },
      fLightIntensity: { value: 0.0, min: 0.0, max: 2.0, step: 0.01 },
      fAnisotropy: { value: 0.0, min: -0.8, max: 0.8, step: 0.01 },
      fSkyRadius: { value: 100.0, min: 100, max: 4000, step: 10 },
    }),
  });

  // Minimal effects: exposure + manual clear once
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  useEffect(() => {
    // Manual background composition pattern
    gl.autoClear = false;
    // no cleanup; we keep this renderer setting
  }, [gl]);

  // Put sky/stars on layer 1 exactly once when they mount
  const setLayer1 = useCallback((obj) => {
    if (!obj) return;
    obj.layers.set(1);
    obj.traverse?.((c) => c.layers?.set(1));
  }, []);

  // Render background (layer 1) before the main scene (layer 0)
  useFrame((state) => {
    const skyCam = skyCamRef.current;
    if (!skyCam) return;

    // Match the main camera’s transform & optics
    const cam = state.camera;
    skyCam.position.copy(cam.position);
    skyCam.quaternion.copy(cam.quaternion);
    skyCam.fov = cam.fov;
    skyCam.aspect = cam.aspect;
    skyCam.near = cam.near;
    skyCam.far = SKY_FAR;
    skyCam.updateProjectionMatrix();

    // Clear frame, draw layer 1 background, then reset depth for the main pass
    state.gl.clear(true, true, true);
    // Render ONLY layer 1 (since sky/stars are on 1 and main camera won’t see them)
    skyCam.layers.set(1);
    state.gl.render(state.scene, skyCam);
    state.gl.clearDepth();
    // The default R3F pass will now render the world (layer 0) with depth reset
  }, -1);

  // Build occluder list once refs exist
  const occluders = useMemo(
    () =>
      [terrainMesh, cabinObj, manObj, catObj, forestObj, radioTowerObj].filter(
        Boolean
      ),
    [terrainMesh, cabinObj, manObj, catObj, forestObj, radioTowerObj]
  );

  return (
    <>
      <Perf position="top-left" />

      {/* Background camera used for sky/stars (layer 1) */}
      <perspectiveCamera
        ref={skyCamRef}
        args={[50, size.width / size.height, 0.1, SKY_FAR]}
      />

      {/* Scene fog (world) */}
      {fogMode === "exp2" ? (
        <fogExp2 attach="fog" args={[fogColor, fogDensity]} />
      ) : (
        <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      )}

      {/* Sky & Stars live on layer 1 and are rendered by skyCam in the prepass */}
      <Sky
        ref={skyRef}
        onUpdate={setLayer1}
        sunPosition={sunPosition}
        rayleigh={rayleigh}
        turbidity={turbidity}
        mieCoefficient={mieCoefficient}
        mieDirectionalG={mieDirectionalG}
      />
      <group ref={starsWrapRef} onUpdate={setLayer1}>
        <Stars
          // Defaults — no Leva controls; feel free to tweak constants if you like
          radius={360}
          depth={2}
          count={20000}
          factor={4}
          saturation={0}
          fade={false}
          speed={0}
        />
      </group>

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

      {/* World lights (layer 0 by default) */}
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
        {/* Terrain (capture mesh) */}
        <Terrain ref={handleTerrainRef} />

        {/* Scene actors (layer 0) */}
        <Forest ref={handleForestRef} terrainMesh={terrainMesh} />
        <Cabin ref={handleCabinRef} />
        <Man ref={handleManRef} />
        <Cat ref={handleCatRef} />
        <RadioTower ref={handleRadioTowerRef} />

        {/* Grid-based fog particle system with explicit occluders */}
        <FogParticleSystem
          terrainMesh={terrainMesh}
          cellSize={2}
          occluders={occluders}
        />
      </Suspense>

      {/* Forward fog that targets the background (set to layer 1 to match sky) */}
      <UnifiedForwardFog
        enabled={fEnabled}
        color={fColor}
        density={fDensity}
        extinction={fExtinction}
        fogHeight={fFogHeight}
        fadeStart={fFadeStart}
        fadeEnd={fFadeEnd}
        distFadeStart={fDistStart}
        distFadeEnd={fDistEnd}
        lightDir={[fLightDirX, fLightDirY, fLightDirZ]}
        lightIntensity={fLightIntensity}
        anisotropy={fAnisotropy}
        skyRadius={fSkyRadius}
        layer={1}
      />
    </>
  );
}
