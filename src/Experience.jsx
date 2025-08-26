import { Perf } from "r3f-perf";
import { OrbitControls, Sky, Stars, Billboard } from "@react-three/drei";
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
import Terrain from "./components/Terrain";
import Forest from "./components/Forest";
import Cabin from "./components/Cabin";
import Man from "./components/Man";
import Cat from "./components/Cat";
import UnifiedForwardFog from "./fog/UnifiedForwardFog";
import FogParticleSystem from "./components/FogParticleSystem";
import RadioTower from "./components/RadioTower";

// --- small additive, soft-edged disk that fakes local bloom ---
function TowerHalo({ color = "#ffb97d", radius = 3, intensity = 1 }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uIntensity: { value: intensity },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform vec3 uColor;
          uniform float uIntensity;
          void main(){
            // circular falloff (soft edge)
            vec2 d = vUv - 0.5;
            float r = length(d) * 2.0;
            float alpha = smoothstep(1.0, 0.0, r); // 1 at center -> 0 at edge
            gl_FragColor = vec4(uColor * uIntensity * alpha, alpha);
          }
        `,
      }),
    [color, intensity]
  );

  // billboard facing camera, horizontal disk on ground (rotate -90° around X)
  return (
    <Billboard follow={true} lockX={false} lockY={true} lockZ={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[radius * 2, radius * 2, 1, 1]} />
        <primitive attach="material" object={mat} />
      </mesh>
    </Billboard>
  );
}

export default function Experience() {
  const skyRef = useRef();
  const starsRef = useRef(null);
  const starsWrapRef = useRef(null);

  // One-time capture of the Terrain mesh to avoid setState loops
  const [terrainMesh, setTerrainMesh] = useState(null);
  const terrainCaptured = useRef(false);
  const handleTerrainRef = useCallback((m) => {
    if (!terrainCaptured.current && m) {
      terrainCaptured.current = true;
      setTerrainMesh(m);
    }
  }, []);

  // Capture Cabin/Man/Cat root objects via callback refs (once each)
  const [cabinObj, setCabinObj] = useState(null);
  const [manObj, setManObj] = useState(null);
  const [catObj, setCatObj] = useState(null);
  const [forestObj, setForestObj] = useState(null);
  const [radioTowerObj, setRadioTowerObj] = useState(null);

  const handleCabinRef = useCallback((obj) => {
    if (obj) setCabinObj(obj);
  }, []);
  const handleManRef = useCallback((obj) => {
    if (obj) setManObj(obj);
  }, []);
  const handleCatRef = useCallback((obj) => {
    if (obj) setCatObj(obj);
  }, []);
  const handleForestRef = useCallback((obj) => {
    if (obj) setForestObj(obj);
  }, []);
  const handleRadioTowerRef = useCallback((obj) => {
    if (obj) setRadioTowerObj(obj);
  }, []);

  // --- two-camera layered background pass ---
  const skyCamRef = useRef(null);
  const { gl, camera, size } = useThree();
  const SKY_FAR = 5000;

  useEffect(() => {
    camera.layers.enable(0);
    camera.layers.disable(1);
    camera.updateProjectionMatrix();
    gl.autoClear = false;
  }, [camera, gl]);

  useFrame((state) => {
    const skyCam = skyCamRef.current;
    if (!skyCam) return;

    skyCam.position.copy(state.camera.position);
    skyCam.quaternion.copy(state.camera.quaternion);
    skyCam.fov = state.camera.fov;
    skyCam.aspect = state.camera.aspect;
    skyCam.near = state.camera.near;
    skyCam.far = SKY_FAR;
    skyCam.updateProjectionMatrix();

    skyCam.layers.set(1);
    state.gl.clear(true, true, true);
    state.gl.render(state.scene, skyCam);
    state.gl.clearDepth();
    state.camera.layers.set(0);
  }, -1);
  // -------------------------------------------

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

    // Local glow controls (instead of SelectiveBloom)
    towerGlow,
    towerGlowRadius,
    towerGlowIntensity,
    towerLightIntensity,
    towerLightDistance,
    towerLightHeight,
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
    "Tower FX (Local Glow)": folder({
      towerGlow: { value: true, label: "Enable Local Glow" },
      towerGlowRadius: { value: 3, min: 0.5, max: 10, step: 0.1 },
      towerGlowIntensity: { value: 1.2, min: 0, max: 5, step: 0.05 },
      towerLightIntensity: { value: 0.25, min: 0, max: 3, step: 0.01 },
      towerLightDistance: { value: 6, min: 0.1, max: 30, step: 0.1 },
      towerLightHeight: { value: 1.2, min: -2, max: 5, step: 0.05 },
    }),
  });

  const kernelMap = {}; // (kept only to avoid removing your import accidentally)

  useEffect(() => {
    const setLayersRecursive = (obj, idx) => {
      if (!obj) return;
      obj.layers?.set(idx);
      obj.children?.forEach((c) => setLayersRecursive(c, idx));
    };
    if (showStars) {
      setLayersRecursive(starsRef.current, 1);
      setLayersRecursive(skyRef.current, 1);
      setLayersRecursive(starsWrapRef.current, 1);
    }
  }, [showStars]);

  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  useEffect(() => {
    const mat = starsRef.current?.material;
    if (!mat) return;
    mat.transparent = false;
    mat.blending = THREE.NormalBlending;
    mat.depthTest = true;
    mat.depthWrite = false;
    mat.needsUpdate = true;
  }, [showStars]);

  // Build occluder list once each ref is available
  const occluders = useMemo(
    () =>
      [terrainMesh, cabinObj, manObj, catObj, forestObj, radioTowerObj].filter(
        Boolean
      ),
    [terrainMesh, cabinObj, manObj, catObj, forestObj, radioTowerObj]
  );

  // Follow the tower with a small light + halo without causing React re-renders
  const haloGroupRef = useRef(null);
  const tmpBox = useMemo(() => new THREE.Box3(), []);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!radioTowerObj || !haloGroupRef.current) return;
    radioTowerObj.updateMatrixWorld(true);
    tmpBox.setFromObject(radioTowerObj);
    tmpBox.getCenter(tmpVec);
    haloGroupRef.current.position
      .copy(tmpVec)
      .add({ x: 0, y: towerLightHeight, z: 0 });
  });

  return (
    <>
      <Perf position="top-left" />

      <perspectiveCamera
        ref={skyCamRef}
        args={[50, size.width / size.height, 0.1, SKY_FAR]}
      />

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

      {/* world lights */}
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

        {/* Scene actors */}
        <Forest ref={handleForestRef} terrainMesh={terrainMesh} />
        <Cabin ref={handleCabinRef} />
        <Man ref={handleManRef} />
        <Cat ref={handleCatRef} />
        <RadioTower ref={handleRadioTowerRef} />

        {/* Local glow that follows the tower */}
        {towerGlow && (
          <group ref={haloGroupRef}>
            <TowerHalo
              radius={towerGlowRadius}
              intensity={towerGlowIntensity}
            />
            <pointLight
              intensity={towerLightIntensity}
              distance={towerLightDistance}
              decay={2}
            />
          </group>
        )}

        {/* Grid-based fog particle system with explicit occluders */}
        <FogParticleSystem
          terrainMesh={terrainMesh}
          cellSize={2}
          occluders={occluders}
        />
      </Suspense>

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
