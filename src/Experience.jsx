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
import VolumetricFogPass from "./post/VolumetricFogPass";

export default function Experience() {
  const skyRef = useRef();
  const starsRef = useRef(null);
  const starsBigRef = useRef(null);
  const [terrainMesh, setTerrainMesh] = useState(null);

  const terrainRefCallback = (mesh) => {
    if (mesh) setTerrainMesh(mesh);
  };

  // Fog, Sky, and Stars controls
  const {
    // Fog
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
    // StarsBig (separate larger stars)
    showStarsBig,
    starsBigCount,
    starsBigFactor,
    // Render/Lights
    exposure,
    dirLightIntensity,
    // Volumetric Fog (post)
    vEnabled,
    vColor,
    vDensity,
    vExtinction,
    vBaseHeight,
    vHeightFalloff,
    vNoiseScale,
    vNoiseIntensity,
    vOctaves,
    vPersistence,
    vWindX,
    vWindY,
    vWindZ,
    vSteps,
    vMaxDepthMul,
    vJitter,
    vLightDirX,
    vLightDirY,
    vLightDirZ,
    vLightIntensity,
    vAnisotropy,
    vAffectSky,
    // Sky-blend extras
    vSkyMaxDistanceMul,
    vSkyStart,
    vSkyEnd,
    vSkyUpFadePow,
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
    "Volumetric Fog": folder({
      vEnabled: { value: true },
      vColor: { value: "#98a0a5" },
      vDensity: { value: 0.45, min: 0.0, max: 2.0, step: 0.01 },
      vExtinction: { value: 1.2, min: 0.1, max: 4.0, step: 0.01 },
      vBaseHeight: { value: 0.0, min: -5.0, max: 10.0, step: 0.1 },
      vHeightFalloff: { value: 1.1, min: 0.1, max: 4.0, step: 0.01 },
      vNoiseScale: { value: 0.12, min: 0.02, max: 0.6, step: 0.005 },
      vNoiseIntensity: { value: 0.85, min: 0.0, max: 1.0, step: 0.01 },
      vOctaves: { value: 4, min: 1, max: 8, step: 1 },
      vPersistence: { value: 0.55, min: 0.2, max: 0.9, step: 0.01 },
      vWindX: { value: 0.03, min: -0.2, max: 0.2, step: 0.001 },
      vWindY: { value: 0.0, min: -0.2, max: 0.2, step: 0.001 },
      vWindZ: { value: 0.06, min: -0.2, max: 0.2, step: 0.001 },
      vSteps: { value: 48, min: 16, max: 160, step: 1 },
      vMaxDepthMul: { value: 1.0, min: 0.2, max: 2.0, step: 0.01 },
      // Jitter kept in UI for completeness, but shader ignores it now.
      vJitter: { value: 0.0, min: 0.0, max: 1.0, step: 0.01 },
      vLightDirX: { value: -0.5, min: -1, max: 1, step: 0.01 },
      vLightDirY: { value: 0.8, min: -1, max: 1, step: 0.01 },
      vLightDirZ: { value: -0.4, min: -1, max: 1, step: 0.01 },
      vLightIntensity: { value: 0.4, min: 0.0, max: 2.0, step: 0.01 },
      vAnisotropy: { value: 0.35, min: -0.8, max: 0.8, step: 0.01 },
      vAffectSky: { value: true },
      // New sky-blend controls (fog fades to fully-visible sky)
      vSkyMaxDistanceMul: { value: 0.1, min: 0.1, max: 2.0, step: 0.01 },
      vSkyStart: { value: 0.15, min: 0.0, max: 1.0, step: 0.01 },
      vSkyEnd: { value: 0.07, min: 0.0, max: 1.0, step: 0.01 },
      vSkyUpFadePow: { value: 6.0, min: 0.0, max: 6.0, step: 0.1 },
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

      {/* Scene fog (you can disable if you prefer post-only) */}
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

      <VolumetricFogPass
        enabled={vEnabled}
        color={vColor}
        globalDensity={vDensity}
        extinction={vExtinction}
        baseHeight={vBaseHeight}
        heightFalloff={vHeightFalloff}
        noiseScale={vNoiseScale}
        noiseIntensity={vNoiseIntensity}
        octaves={vOctaves}
        persistence={vPersistence}
        wind={[vWindX, vWindY, vWindZ]}
        steps={vSteps}
        maxDistanceMul={vMaxDepthMul}
        jitter={vJitter} // ignored internally; kept for compatibility
        lightDir={[vLightDirX, vLightDirY, vLightDirZ]}
        lightIntensity={vLightIntensity}
        anisotropy={vAnisotropy}
        affectSky={vAffectSky}
        // new sky-blend props
        skyMaxDistanceMul={vSkyMaxDistanceMul}
        skyStart={vSkyStart}
        skyEnd={vSkyEnd}
        skyUpFadePow={vSkyUpFadePow}
      />

      <DebugTreeMaterials
        url="/models/tree/Spruce/spruce.glb"
        label="SpruceTree"
      />
    </>
  );
}
