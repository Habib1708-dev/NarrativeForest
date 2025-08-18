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
import UnifiedForwardFog from "./fog/UnifiedForwardFog";

export default function Experience() {
  const skyRef = useRef();
  const starsRef = useRef(null);
  const starsBigRef = useRef(null);
  const [terrainMesh, setTerrainMesh] = useState(null);

  const {
    // Built-in scene fog (kept just to enable USE_FOG in built-in materials)
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
    // Unified fog controls
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
      fogMode: { value: "linear", options: ["linear", "exp2"] },
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
    "Unified Fog": folder({
      fEnabled: { value: true },
      fColor: { value: "#98a0a5" },
      fDensity: { value: 0.45, min: 0.0, max: 3.0, step: 0.01 },
      fExtinction: { value: 1.2, min: 0.1, max: 5.0, step: 0.01 },
      fFogHeight: { value: 0.0, min: -20.0, max: 40.0, step: 0.1 },
      fFadeStart: { value: 8.0, min: 0.0, max: 200.0, step: 0.1 },
      fFadeEnd: { value: 20.0, min: 0.0, max: 300.0, step: 0.1 },
      // Distance fade: force objects to vanish into fog
      fDistStart: { value: 60.0, min: 0.0, max: 500.0, step: 1.0 },
      fDistEnd: { value: 120.0, min: 0.0, max: 1000.0, step: 1.0 },
      fLightDirX: { value: -0.5, min: -1, max: 1, step: 0.01 },
      fLightDirY: { value: 0.8, min: -1, max: 1, step: 0.01 },
      fLightDirZ: { value: -0.4, min: -1, max: 1, step: 0.01 },
      fLightIntensity: { value: 0.35, min: 0.0, max: 2.0, step: 0.01 },
      fAnisotropy: { value: 0.3, min: -0.8, max: 0.8, step: 0.01 },
      fSkyRadius: { value: 800, min: 100, max: 4000, step: 10 },
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

      {/* Keep built-in fog so USE_FOG is defined (Forward injection relies on it) */}
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

      {/* Camera controls & lights */}
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

      {/* Unified fog (patch geometry + sky volume) */}
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
      />

      <DebugTreeMaterials
        url="/models/tree/Spruce/spruce.glb"
        label="SpruceTree"
      />
    </>
  );
}
