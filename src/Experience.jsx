// src/Experience.jsx
// r3f-perf
import { Perf } from "r3f-perf";
import { OrbitControls, Sky } from "@react-three/drei";
import { useControls, folder, button } from "leva";
import { useRef, useState, Suspense, useEffect, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useDebugStore } from "./state/useDebugStore";

import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
} from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import { NoiseJitterEffect } from "./post/NoiseJitterEffect";
import { DistanceBlurEffect } from "./post/DistanceBlurEffect";

// Scene pieces
import Cabin from "./components/Cabin";
import Man from "./components/Man";
import Cat from "./components/Cat";
import FogParticleSystem from "./components/FogParticleSystem";
import RadioTower from "./components/RadioTower";
import Lake from "./components/Lake";
import DistanceFade from "./fog/DistanceFade";

// Preset system
import { PRESETS, PRESET_NAMES } from "./utils/presets";
import { usePresetTransition } from "./hooks/usePresetTransition";

// Tiled terrain and heightfield
import TerrainTiled from "./components/TerrainTiled";
import { heightAt as sampleHeight } from "./proc/heightfield";

// NEW
// import ForestDynamic from "./components/ForestDynamic";
import ForestDynamicSampled from "./components/ForestDynamicSampled";
import MagicMushrooms from "./components/MagicMushrooms";
import "./three-bvh-setup";
import Fireflies from "./components/Fireflies";
import UnifiedCrystalClusters from "./components/UnifiedCrystalClusters";
import Stars from "./components/Stars";
import CustomSky from "./components/CustomSky";
import Butterfly from "./components/Butterfly";
import IntroButterfly from "./components/IntroButterfly";
import CameraControllerR3F from "./components/CameraControllerR3F";
import { useCameraStore } from "./state/useCameraStore";

export default function Experience() {
  const { gl, camera } = useThree();
  const isDebugMode = useDebugStore((state) => state.isDebugMode);
  const enabled = useCameraStore((s) => s.enabled);
  const archConfig = useCameraStore((s) => s.archConfig);
  const setArchConfig = useCameraStore((s) => s.setArchConfig);
  const rebuildArch = useCameraStore((s) => s.rebuildArch);
  const setTerrainCollider = useCameraStore((s) => s.setTerrainCollider);

  useEffect(() => {
    const canvas = gl?.domElement;
    if (!canvas) return undefined;
    const previous = canvas.style.touchAction;
    canvas.style.touchAction = isDebugMode && !enabled ? "none" : "pan-y";
    return () => {
      canvas.style.touchAction = previous;
    };
  }, [gl, isDebugMode, enabled]);

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

  // Preset control (only visible in debug mode)
  const presetControl = useControls(
    "Presets",
    {
      preset: {
        value: "Default",
        options: PRESET_NAMES,
        label: "Select Preset",
      },
      transitionDuration: {
        value: 2.0,
        min: 0.1,
        max: 10.0,
        step: 0.1,
        label: "Transition Duration (s)",
      },
    },
    { hidden: !isDebugMode }
  );

  const controls = useControls(
    {
      Scene: folder(
        {
          globalDarken: {
            value: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: "Global Darken",
          },
        },
        { collapsed: true }
      ),
      "Post / Film Grain": folder({
        grainEnabled: {
          value: false,
          label: "Enable Film Grain",
        },
        grainStrength: {
          value: 0.02,
          min: 0.0,
          max: 0.5,
          step: 0.01,
          label: "Grain Strength",
        },
        grainSize: {
          value: 0.5,
          min: 0.5,
          max: 5.0,
          step: 0.1,
          label: "Grain Size",
        },
      }),
      "Post / Distance Blur": folder({
        blurEnabled: {
          value: false,
          label: "Enable Distance Blur",
        },
        blurFocusDistance: {
          value: 1.5,
          min: 0.1,
          max: 50.0,
          step: 0.1,
          label: "Focus Distance",
        },
        blurFocusRange: {
          value: 2.0,
          min: 0.5,
          max: 20.0,
          step: 0.1,
          label: "Focus Range",
        },
        blurStrength: {
          value: 5.0,
          min: 0.0,
          max: 20.0,
          step: 0.1,
          label: "Blur Strength",
        },
      }),
      Atmosphere: folder({
        fogColor: { value: "#585858" },
        fogMode: { value: "exp2", options: ["linear", "exp2"] },
        fogNear: { value: 4, min: 0, max: 50, step: 1 },
        fogFar: { value: 10, min: 3, max: 30, step: 3 },
        fogDensity: { value: 0.4, min: 0.0, max: 0.8, step: 0.001 },
      }),
      Lights: folder({
        dirLightIntensity: { value: 0.0, min: 0, max: 5, step: 0.01 },
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
      Sky: folder(
        {
          sunPosition: { value: [5.0, -1.0, 30.0], step: 0.1 },
          rayleigh: { value: 0.01, min: 0, max: 4, step: 0.01 },
          turbidity: { value: 1.1, min: 0, max: 20, step: 0.01 },
          mieCoefficient: { value: 0, min: 0, max: 0.1, step: 0.001 },
          mieDirectionalG: { value: 0, min: 0, max: 1, step: 0.01 },
          skyDarken: {
            value: 0.0,
            min: 0.0,
            max: 1.0,
            step: 0.01,
            label: "Darken",
          },
          // Lightning controls moved to "Sky / Lightning" folder inside CustomSky
        },
        { collapsed: true }
      ),
      "Sky / Haze": folder({
        hazeColor: { value: "#585858", label: "Haze Color" },
      }),
      "Sky / Color": folder({
        saturation: { value: 1.0, min: 0.0, max: 2.5, step: 0.01 },
        tintStrength: { value: 0.0, min: 0.0, max: 1.0, step: 0.01 },
        tintColor: { value: "#ffffff", label: "Tint Color" },
        hueShift: {
          value: 0,
          min: -180,
          max: 180,
          step: 0.5,
          label: "Hue Shift",
        },
      }),
      "Sky / Lightning": folder(
        {
          lightningEnabled: { value: false, label: "Enable Lightning" },
          flashPeakGain: {
            value: 4.5,
            min: 1.0,
            max: 30.0,
            step: 0.1,
            label: "Peak Gain",
          },
        },
        { collapsed: true }
      ),
    },
    { hidden: !isDebugMode }
  );

  // State for transition overrides
  const [transitionOverrides, setTransitionOverrides] = useState({});

  // Track when user manually changes controls to clear specific overrides
  const prevControlsRef = useRef(controls);
  useEffect(() => {
    const prev = prevControlsRef.current;
    const current = controls;

    // Check if any control was manually changed (not during transition)
    if (!transitionRef.current.isTransitioning) {
      const changedKeys = Object.keys(current).filter((key) => {
        const prevVal = prev[key];
        const currVal = current[key];
        if (Array.isArray(prevVal) && Array.isArray(currVal)) {
          return JSON.stringify(prevVal) !== JSON.stringify(currVal);
        }
        return prevVal !== currVal;
      });

      if (changedKeys.length > 0) {
        // User manually changed a control, clear those overrides
        setTransitionOverrides((prev) => {
          const newOverrides = { ...prev };
          changedKeys.forEach((key) => delete newOverrides[key]);
          return newOverrides;
        });
      }
    }

    prevControlsRef.current = current;
  }, [controls]);

  // Merge controls with transition overrides
  const activeValues = { ...controls, ...transitionOverrides };

  // Destructure for easier use (using activeValues instead of controls)
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
    skyDarken,
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
    globalDarken,
    grainEnabled,
    grainStrength,
    grainSize,
    blurEnabled,
    blurFocusDistance,
    blurFocusRange,
    blurStrength,
    // Sky / Haze & Sky / Color values (from presets)
    hazeColor,
    saturation,
    tintColor,
    tintStrength,
    hueShift,
    // Sky / Lightning values (from presets)
    lightningEnabled,
    flashPeakGain,
  } = activeValues;

  // Setup preset transition system with ref to track values
  const controlValuesRef = useRef(controls);
  useEffect(() => {
    controlValuesRef.current = controls;
  }, [controls]);

  // Transition state
  const transitionRef = useRef({
    isTransitioning: false,
    startValues: {},
    targetValues: {},
    startTime: 0,
    duration: 2.0,
  });

  // Interpolation helpers
  const lerpColor = (colorA, colorB, t) => {
    const c1 = new THREE.Color(colorA);
    const c2 = new THREE.Color(colorB);
    return "#" + c1.lerp(c2, t).getHexString();
  };

  const lerp = (a, b, t) => a + (b - a) * t;

  const lerpArray = (arrA, arrB, t) => {
    return arrA.map((val, idx) => lerp(val, arrB[idx], t));
  };

  const easeInOutCubic = (t) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Handle preset transition animation
  useFrame(() => {
    const transition = transitionRef.current;
    if (!transition.isTransitioning) return;

    const currentTime = performance.now() / 1000;
    const elapsed = currentTime - transition.startTime;
    const rawProgress = Math.min(elapsed / transition.duration, 1.0);
    const progress = easeInOutCubic(rawProgress);

    // Sun position moves 1/3 slower (needs 33% more time to complete)
    // Adjust its progress to be proportionally behind
    const sunRawProgress = Math.min(
      (elapsed / transition.duration) * 0.75,
      1.0
    );
    const sunProgress = easeInOutCubic(sunRawProgress);

    const { startValues, targetValues } = transition;

    const updates = {};

    // Interpolate each property
    Object.keys(targetValues).forEach((key) => {
      const startVal = startValues[key];
      const targetVal = targetValues[key];

      if (startVal === undefined || targetVal === undefined) return;

      // Use slower progress for sunPosition
      const currentProgress = key === "sunPosition" ? sunProgress : progress;

      let newValue;
      if (typeof startVal === "string" && startVal.startsWith("#")) {
        newValue = lerpColor(startVal, targetVal, currentProgress);
      } else if (Array.isArray(startVal)) {
        newValue = lerpArray(startVal, targetVal, currentProgress);
      } else if (typeof startVal === "number") {
        newValue = lerp(startVal, targetVal, currentProgress);
      } else {
        newValue = targetVal;
      }

      updates[key] = newValue;
    });

    // Apply all updates as overrides
    setTransitionOverrides(updates);

    // Complete transition - keep the overrides permanently as the new values
    if (rawProgress >= 1.0) {
      transition.isTransitioning = false;
      console.log("✅ Transition complete!");
      console.log("🎯 Final values actually applied:");
      console.table(updates);
      console.log("========================================\n");
      // Don't clear overrides - they become the permanent values
      // This way the scene stays at the preset values
    }
  });

  // Watch for preset changes and trigger transition
  const prevPresetRef = useRef(presetControl.preset);
  useEffect(() => {
    if (presetControl.preset !== prevPresetRef.current) {
      prevPresetRef.current = presetControl.preset;

      // Dispatch preset change event for external listeners (e.g., rain audio in App.jsx)
      window.dispatchEvent(
        new CustomEvent("presetChanged", {
          detail: { preset: presetControl.preset },
        })
      );

      const targetPreset = PRESETS[presetControl.preset];
      if (targetPreset) {
        console.log(`\n🎨 ======== PRESET: ${presetControl.preset} ========`);
        console.log("📋 Target values that will be applied:");
        console.table(targetPreset);
        console.log("🔄 Starting transition...\n");
        // Use activeValues (current displayed values) as start
        transitionRef.current = {
          isTransitioning: true,
          startValues: { ...activeValues },
          targetValues: targetPreset,
          startTime: performance.now() / 1000,
          duration: presetControl.transitionDuration,
        };
      }
    }
  }, [presetControl.preset, presetControl.transitionDuration, activeValues]);

  // Listen for user preset changes from PresetSelector
  useEffect(() => {
    const handleUserPresetChange = (event) => {
      const presetName = event.detail.preset;
      const targetPreset = PRESETS[presetName];

      if (targetPreset) {
        console.log(
          `\n🎨 ======== USER SELECTED PRESET: ${presetName} ========`
        );
        console.log("📋 Target values that will be applied:");
        console.table(targetPreset);
        console.log("🔄 Starting transition...\n");

        // Trigger transition
        transitionRef.current = {
          isTransitioning: true,
          startValues: { ...activeValues },
          targetValues: targetPreset,
          startTime: performance.now() / 1000,
          duration: presetControl.transitionDuration,
        };
      }
    };

    window.addEventListener("userPresetChange", handleUserPresetChange);
    return () =>
      window.removeEventListener("userPresetChange", handleUserPresetChange);
  }, [activeValues, presetControl.transitionDuration]);

  // Arch controls (only visible in debug mode)
  const archControls = useControls(
    "Post Ring Arch",
    {
      spacing: { value: archConfig.spacing, min: 0.2, max: 5, step: 0.05 },
      height: { value: archConfig.height, min: 0, max: 5, step: 0.01 },
      maxUpDeg: { value: archConfig.maxUpDeg, min: 0, max: 85, step: 1 },
      peakAtIndex: {
        value: archConfig.peakAtIndex,
        min: 0,
        max: Math.max(0, (archConfig.count ?? 5) - 1),
        step: 1,
      },
    },
    { collapsed: true, hidden: !isDebugMode }
  );

  useEffect(() => {
    setArchConfig(archControls);
    rebuildArch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    archControls.spacing,
    archControls.height,
    archControls.maxUpDeg,
    archControls.peakAtIndex,
  ]);

  useEffect(() => {
    let cancelled = false;
    const assign = () => {
      if (cancelled) return;
      const terrain = terrainRef.current;
      if (terrain) {
        setTerrainCollider(terrain);
        return;
      }
      requestAnimationFrame(assign);
    };
    assign();
    return () => {
      cancelled = true;
      setTerrainCollider(null);
    };
  }, [setTerrainCollider]);

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
      {/* Performance monitor - only visible in debug mode */}
      {isDebugMode && <Perf position="top-left" />}

      {fogMode === "exp2" ? (
        <fogExp2 attach="fog" args={[fogColor, fogDensity]} />
      ) : (
        <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
      )}

      <CustomSky
        sunPosition={sunPosition}
        rayleigh={rayleigh}
        turbidity={turbidity}
        mieCoefficient={mieCoefficient}
        mieDirectionalG={mieDirectionalG}
        darken={skyDarken}
        hazeColor={hazeColor}
        saturation={saturation}
        tintColor={tintColor}
        tintStrength={tintStrength}
        hueShift={hueShift}
        lightningEnabled={lightningEnabled}
        flashPeakGain={flashPeakGain}
      />
      <Stars />

      {/* OrbitControls - only active in debug mode when narrative camera is disabled */}
      {isDebugMode && !enabled && (
        <OrbitControls
          makeDefault
          minDistance={0.05}
          maxDistance={600}
          target={[-1.25, -4.45, -2.9]}
          enableDamping
          dampingFactor={0.05}
          enablePan
          panSpeed={1.0}
          enableZoom
          zoomSpeed={1.2}
          screenSpacePanning
          rotateSpeed={0.6}
        />
      )}

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
        <RadioTower ref={radioTowerRef} />
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
        {/* <ForestDynamic
          terrainGroup={terrainRef.current}
          tileSize={TERRAIN_TILE_SIZE}
          terrainLoadRadius={TERRAIN_LOAD_RADIUS}
          exclusion={lakeExclusion}
          onOccludersChange={setForestOccluders}
        /> */}
        <ForestDynamicSampled
          terrainGroup={terrainRef.current}
          tileSize={TERRAIN_TILE_SIZE}
          terrainLoadRadius={TERRAIN_LOAD_RADIUS}
          exclusion={lakeExclusion}
          onOccludersChange={setForestOccluders}
        />
        <MagicMushrooms ref={mushroomsRef} />
        <Fireflies />
        <UnifiedCrystalClusters />
        <Butterfly />
        <IntroButterfly />
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

      <EffectComposer
        multisampling={0}
        frameBufferType={THREE.HalfFloatType}
        depthBuffer={true}
      >
        <Bloom
          intensity={1.35}
          luminanceThreshold={0.7}
          luminanceSmoothing={0.08}
          kernelSize={KernelSize.LARGE}
          mipmapBlur
        />
        <BrightnessContrast brightness={-globalDarken} contrast={0} />
        {blurEnabled && (
          <DistanceBlurEffect
            focusDistance={blurFocusDistance}
            focusRange={blurFocusRange}
            blurStrength={blurStrength}
            cameraNear={camera.near}
            cameraFar={camera.far}
          />
        )}
        {grainEnabled && (
          <NoiseJitterEffect
            grainStrength={grainStrength}
            grainSize={grainSize}
          />
        )}
      </EffectComposer>

      {/* New camera waypoints controller (disabled by default; toggle via Leva) */}
      <CameraControllerR3F />
    </>
  );
}
