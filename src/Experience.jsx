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
import CombinedFog from "./fog/CombinedFog";

export default function Experience() {
  const skyRef = useRef();
  const starsRef = useRef(null);
  const starsBigRef = useRef(null);
  const [terrainMesh, setTerrainMesh] = useState(null);

  const {
    // Built-in scene fog (keep this so USE_FOG is defined)
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
    // Combined Fog controls
    cfEnabled,
    cfColor,
    cfDensity,
    cfExtinction,
    cfFogHeight,
    cfFadeStart,
    cfFadeEnd,
    cfDistStart,
    cfDistEnd,
    cfLightDirX,
    cfLightDirY,
    cfLightDirZ,
    cfLightIntensity,
    cfAnisotropy,
    cfSkyRadius,
    // Noise sub-controls
    cfNoiseEnabled,
    cfNoiseSpeed,
    cfNoiseDistortion,
    cfNoiseScale,
    cfNoisePosition,
    cfNoiseDirX,
    cfNoiseDirY,
    cfNoiseDirZ,
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
    "Combined Fog": folder({
      cfEnabled: { label: "Enable", value: true },
      cfColor: { label: "Color", value: "#c1c1c1" },
      cfDensity: {
        label: "Density",
        value: 1.96,
        min: 0.0,
        max: 3.0,
        step: 0.01,
      },
      cfExtinction: {
        label: "Extinction",
        value: 0.1,
        min: 0.01,
        max: 5.0,
        step: 0.01,
      },
      cfFogHeight: {
        label: "Fog Base Height",
        value: -3.9,
        min: -20,
        max: 40,
        step: 0.1,
      },
      cfFadeStart: {
        label: "Height Fade Start",
        value: 3.9,
        min: 0,
        max: 200,
        step: 0.1,
      },
      cfFadeEnd: {
        label: "Height Fade End",
        value: 41.3,
        min: 0,
        max: 300,
        step: 0.1,
      },
      cfDistStart: {
        label: "Force Fade Start",
        value: 0.0,
        min: 0,
        max: 500,
        step: 1.0,
      },
      cfDistEnd: {
        label: "Force Fade End",
        value: 92.0,
        min: 0,
        max: 1000,
        step: 1.0,
      },
      cfLightDirX: {
        label: "Light Dir X",
        value: -0.5,
        min: -1,
        max: 1,
        step: 0.01,
      },
      cfLightDirY: {
        label: "Light Dir Y",
        value: 0.8,
        min: -1,
        max: 1,
        step: 0.01,
      },
      cfLightDirZ: {
        label: "Light Dir Z",
        value: -0.4,
        min: -1,
        max: 1,
        step: 0.01,
      },
      cfLightIntensity: {
        label: "Light Intensity",
        value: 0.0,
        min: 0,
        max: 2,
        step: 0.01,
      },
      cfAnisotropy: {
        label: "Anisotropy",
        value: 0.0,
        min: -0.8,
        max: 0.8,
        step: 0.01,
      },
      cfSkyRadius: {
        label: "Sky Dome Radius",
        value: 100.0,
        min: 20,
        max: 4000,
        step: 10,
      },
      Noise: folder({
        cfNoiseEnabled: { label: "Enable Noise Fog", value: true },
        cfNoiseSpeed: {
          label: "Noise Speed",
          value: 2.75,
          min: 0,
          max: 5,
          step: 0.01,
        },
        cfNoiseDistortion: {
          label: "Noise Distortion",
          value: 0.66,
          min: 0,
          max: 2,
          step: 0.01,
        },
        cfNoiseScale: {
          label: "Noise Box Half-Extents",
          value: [20, 4, 20],
          step: 0.1,
        },
        cfNoisePosition: {
          label: "Noise Box Center",
          value: [0, 0, 0],
          step: 0.1,
        },
        cfNoiseDirX: {
          label: "Noise Dir X",
          value: -0.2,
          min: -1,
          max: 1,
          step: 0.01,
        },
        cfNoiseDirY: {
          label: "Noise Dir Y",
          value: -0.2,
          min: -1,
          max: 1,
          step: 0.01,
        },
        cfNoiseDirZ: {
          label: "Noise Dir Z",
          value: -0.69,
          min: -1,
          max: 1,
          step: 0.01,
        },
      }),
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

      {/* Keep built-in scene fog so USE_FOG is defined for materials */}
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

      {/* Camera controls */}
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

      {/* Combined fog: base extinction + optional local noise bank + sky dome */}
      <CombinedFog
        enabled={cfEnabled}
        color={cfColor}
        density={cfDensity}
        extinction={cfExtinction}
        fogHeight={cfFogHeight}
        fadeStart={cfFadeStart}
        fadeEnd={cfFadeEnd}
        distFadeStart={cfDistStart}
        distFadeEnd={cfDistEnd}
        lightDir={[cfLightDirX, cfLightDirY, cfLightDirZ]}
        lightIntensity={cfLightIntensity}
        anisotropy={cfAnisotropy}
        skyRadius={cfSkyRadius}
        enableNoiseFog={cfNoiseEnabled}
        noiseSpeed={cfNoiseSpeed}
        noiseDistortion={cfNoiseDistortion}
        noiseScale={cfNoiseScale}
        noisePosition={cfNoisePosition}
        noiseDirection={[cfNoiseDirX, cfNoiseDirY, cfNoiseDirZ]}
      />
    </>
  );
}
