// src/Experience.jsx
import { Perf } from "r3f-perf";
import { OrbitControls, Sky, Stars } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useRef, useState, Suspense, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import Terrain from "./components/Terrain";
import Forest from "./components/Forest";
import Cabin from "./components/Cabin";
import Man from "./components/Man";
import Cat from "./components/Cat";
import UnifiedForwardFog from "./fog/UnifiedForwardFog";
import FogParticles from "./components/FogParticles";

export default function Experience() {
  const skyRef = useRef();
  const starsRef = useRef(null);
  const starsWrapRef = useRef(null);
  const [terrainMesh, setTerrainMesh] = useState(null);

  // --- LAYERED RENDER SETUP ---
  const skyCamRef = useRef(null); // secondary camera for sky/stars
  const { gl, scene, camera, size } = useThree();
  const SKY_FAR = 5000; // big far for background pass

  useEffect(() => {
    // Ensure the world camera renders ONLY layer 0
    camera.layers.enable(0);
    camera.layers.disable(1);
    camera.updateProjectionMatrix();

    // We control clears manually
    gl.autoClear = false;
  }, [camera, gl]);

  // (moved below useControls to avoid TDZ on showStars)

  // Render SKY LAYER (1) first with skyCam, then let R3F do the world pass (layer 0)
  useFrame((state) => {
    const skyCam = skyCamRef.current;
    if (!skyCam) return;

    // Copy the world-camera pose & intrinsics
    skyCam.position.copy(state.camera.position);
    skyCam.quaternion.copy(state.camera.quaternion);
    skyCam.fov = state.camera.fov;
    skyCam.aspect = state.camera.aspect;
    skyCam.near = state.camera.near;
    skyCam.far = SKY_FAR;
    skyCam.updateProjectionMatrix();

    // Draw background (layer 1)
    skyCam.layers.set(1);
    state.gl.clear(true, true, true); // clear color+depth
    state.gl.render(state.scene, skyCam);

    // Clear only depth, keep color; default R3F world render will run next
    state.gl.clearDepth();

    // Make sure world cam is on layer 0 (just in case)
    state.camera.layers.set(0);
  }, -1);
  // ----------------------------

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
    showStars,
    starsRadius,
    starsDepth,
    starsCount,
    starsFactor,
    starsSaturation,
    starsFade,
    starsSpeed,
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
    Stars: folder({
      showStars: { value: true },
      starsRadius: { value: 360, min: 10, max: 1000, step: 1 },
      starsDepth: { value: 2, min: 1, max: 200, step: 1 },
      starsCount: { value: 20000, min: 0, max: 20000, step: 100 },
      starsFactor: { value: 4, min: 0.1, max: 20, step: 0.1 },
      starsSaturation: { value: 0, min: -1, max: 1, step: 0.01 },
      starsFade: { value: false },
      starsSpeed: { value: 0, min: 0, max: 10, step: 0.1 },
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

  // Imperatively set Stars (and optionally Sky) and any internal children to layer 1
  useEffect(() => {
    const setLayersRecursive = (obj, idx) => {
      if (!obj) return;
      obj.layers?.set(idx);
      if (obj.children) obj.children.forEach((c) => setLayersRecursive(c, idx));
    };
    if (showStars) {
      setLayersRecursive(starsRef.current, 1);
      setLayersRecursive(skyRef.current, 1); // optional: also move <Sky /> to layer 1
      setLayersRecursive(starsWrapRef.current, 1);
    }
  }, [showStars]);

  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  // Keep stars' material stable
  useEffect(() => {
    [starsRef.current].forEach((pts) => {
      const mat = pts?.material;
      if (!mat) return;
      mat.transparent = false;
      mat.blending = THREE.NormalBlending;
      mat.depthTest = true;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    });
  }, [showStars]);

  return (
    <>
      <Perf position="top-left" />

      {/* Secondary camera used only for the SKY pass (layer 1) */}
      <perspectiveCamera
        ref={skyCamRef}
        args={[50, size.width / size.height, 0.1, SKY_FAR]}
      />

      {/* Built-in scene fog just to define USE_FOG for standard materials */}
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

      {/* SKY LAYER (1): Stars go here so they render in the background pass */}
      {showStars && (
        <group ref={starsWrapRef}>
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
        </group>
      )}

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
            setTerrainMesh(m);
          }}
        />
        <Forest terrainMesh={terrainMesh} />
        <Cabin />
        <Man />
        <Cat />
        {/* Fog sprites stay on LAYER 0 so they respect the world far=8 */}
        <FogParticles
          count={5}
          occluder={terrainMesh}
          fogColor={fColor}
          fogDensity={fDensity}
        />
      </Suspense>

      {/* Unified forward fog: patch world materials (all layers), sky-dome on layer 1 */}
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
        layer={1} // <— sky dome draws in the sky pass
      />
    </>
  );
}
