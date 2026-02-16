// src/components/RadioTower.jsx
import React, {
  forwardRef,
  useMemo,
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder, button } from "leva";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useFrame } from "@react-three/fiber";
import { useCameraStore } from "../../state/useCameraStore";
import { useDebugStore } from "../../state/useDebugStore";

/* ─── static defaults (used when debug panel is off) ─── */
const RADIOTOWER_DEFAULTS = Object.freeze({
  positionX: 1.4,
  positionY: -4.6,
  positionZ: -2.8,
  rotationYDeg: 0,
  scale: 0.05,
  heightScale: 2,
  tintColor: "#ffffff",
  tintIntensity: 0.0,
  build: false,
  speed: 0.42,
  noiseScale: 2.679,
  noiseAmp: 1.39,
  edgeWidth: 0,
  glowStrength: 4.12,
  glowColor: "#ffc06b",
  seed: 327,
});

/* ─── debug sub-component (only rendered when debug mode is on) ─── */
function RadioTowerDebugPanel({ onChange, onReplay }) {
  useControls({
    "Radio Tower": folder(
      {
        Transform: folder({
          positionX: { value: RADIOTOWER_DEFAULTS.positionX, min: -200, max: 200, step: 0.01, onChange: (v) => onChange("positionX", v) },
          positionY: { value: RADIOTOWER_DEFAULTS.positionY, min: -200, max: 200, step: 0.01, onChange: (v) => onChange("positionY", v) },
          positionZ: { value: RADIOTOWER_DEFAULTS.positionZ, min: -200, max: 200, step: 0.01, onChange: (v) => onChange("positionZ", v) },
          rotationYDeg: {
            value: RADIOTOWER_DEFAULTS.rotationYDeg,
            min: -180,
            max: 180,
            step: 0.1,
            label: "Rotation Y (deg)",
            onChange: (v) => onChange("rotationYDeg", v),
          },
          scale: {
            value: RADIOTOWER_DEFAULTS.scale,
            min: 0.001,
            max: 5,
            step: 0.001,
            label: "Uniform Scale",
            onChange: (v) => onChange("scale", v),
          },
          heightScale: {
            value: RADIOTOWER_DEFAULTS.heightScale,
            min: 0.1,
            max: 10,
            step: 0.01,
            label: "Height Scale (Y)",
            onChange: (v) => onChange("heightScale", v),
          },
        }),
        Appearance: folder({
          tintColor: { value: RADIOTOWER_DEFAULTS.tintColor, label: "Tint Color", onChange: (v) => onChange("tintColor", v) },
          tintIntensity: {
            value: RADIOTOWER_DEFAULTS.tintIntensity,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Tint Intensity",
            onChange: (v) => onChange("tintIntensity", v),
          },
        }),
        Dissolve: folder({
          build: { value: RADIOTOWER_DEFAULTS.build, label: "Build Tower", onChange: (v) => onChange("build", v) },
          speed: {
            value: RADIOTOWER_DEFAULTS.speed,
            min: 0.05,
            max: 3,
            step: 0.01,
            label: "Speed (units/sec)",
            onChange: (v) => onChange("speed", v),
          },
          noiseScale: {
            value: RADIOTOWER_DEFAULTS.noiseScale,
            min: 0.1,
            max: 6,
            step: 0.01,
            label: "Noise Scale",
            onChange: (v) => onChange("noiseScale", v),
          },
          noiseAmp: {
            value: RADIOTOWER_DEFAULTS.noiseAmp,
            min: 0,
            max: 1.5,
            step: 0.01,
            label: "Noise Amplitude",
            onChange: (v) => onChange("noiseAmp", v),
          },
          edgeWidth: {
            value: RADIOTOWER_DEFAULTS.edgeWidth,
            min: 0.0,
            max: 0.4,
            step: 0.005,
            label: "Edge Width",
            onChange: (v) => onChange("edgeWidth", v),
          },
          glowStrength: {
            value: RADIOTOWER_DEFAULTS.glowStrength,
            min: 0.0,
            max: 50,
            step: 0.1,
            label: "Glow Strength",
            onChange: (v) => onChange("glowStrength", v),
          },
          glowColor: { value: RADIOTOWER_DEFAULTS.glowColor, label: "Glow Color", onChange: (v) => onChange("glowColor", v) },
          seed: { value: RADIOTOWER_DEFAULTS.seed, min: 0, max: 1000, step: 1, label: "Noise Seed", onChange: (v) => onChange("seed", v) },
          Replay: button(() => onReplay()),
        }),
      },
      { collapsed: true }
    ),
  });

  return null;
}

export default forwardRef(function RadioTower(_, ref) {
  const glbPath = "/models/radioTower/Radio%20tower_draco.glb"; // Using Draco-compressed version
  const { scene } = useGLTF(glbPath);

  const cloned = useMemo(() => (scene ? skeletonClone(scene) : null), [scene]);

  const rootRef = useRef(null);
  useImperativeHandle(ref, () => rootRef.current, []);

  const materialsRef = useRef([]);

  const isDebugMode = useDebugStore((s) => s.isDebugMode);
  const [activeVals, setActiveVals] = useState({ ...RADIOTOWER_DEFAULTS });

  // When debug mode turns off, reset to defaults
  useEffect(() => {
    if (!isDebugMode) {
      setActiveVals({ ...RADIOTOWER_DEFAULTS });
    }
  }, [isDebugMode]);

  const handleDebugChange = (key, value) => {
    setActiveVals((prev) => ({ ...prev, [key]: value }));
  };

  // Gather unique materials, cache original flags/colors
  useEffect(() => {
    if (!cloned) return;
    const mats = new Map();
    cloned.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      arr.forEach((m) => {
        if (!m || !m.isMaterial) return;
        if (!m.userData._origColor && m.color) {
          m.userData._origColor = m.color.clone();
        }
        if (m.userData._origTransparent === undefined) {
          m.userData._origTransparent = !!m.transparent;
        }
        if (m.userData._origToneMapped === undefined) {
          // default for most three mats is true, but read current flag if present
          m.userData._origToneMapped =
            m.toneMapped !== undefined ? m.toneMapped : true;
        }
        mats.set(m.uuid, m);
      });
    });
    materialsRef.current = Array.from(mats.values());
  }, [cloned]);

  const {
    positionX,
    positionY,
    positionZ,
    rotationYDeg,
    scale,
    heightScale,
    tintColor,
    tintIntensity,
    build,
    speed,
    noiseScale,
    noiseAmp,
    edgeWidth,
    glowStrength,
    glowColor,
    seed,
  } = activeVals;

  // live tint (preserve original color as base)
  useEffect(() => {
    const target = new THREE.Color(tintColor);
    materialsRef.current.forEach((m) => {
      if (!m || !m.color) return;
      if (!m.userData._origColor) m.userData._origColor = m.color.clone();
      m.color.copy(m.userData._origColor).lerp(target, tintIntensity);
      m.needsUpdate = true;
    });
  }, [tintColor, tintIntensity]);

  const position = useMemo(
    () => [positionX, positionY, positionZ],
    [positionX, positionY, positionZ]
  );
  const rotationY = useMemo(
    () => THREE.MathUtils.degToRad(rotationYDeg || 0),
    [rotationYDeg]
  );
  const scaleVec = useMemo(
    () => [scale, scale * heightScale, scale],
    [scale, heightScale]
  );

  // -------- Dissolve state --------
  const progressRef = useRef(-0.2);
  const worldYRangeRef = useRef({ min: 0, max: 1 });
  const shouldBuildRef = useRef(false);

  // Subscribe to camera store to detect stop-13 and beyond
  const currentWaypointIndex = useCameraStore((state) => {
    const waypoints = state.waypoints || [];
    const t = state.t ?? 0;
    const nSeg = waypoints.length - 1;
    if (nSeg <= 0) return -1;
    // Find nearest waypoint
    const nearestIdx = Math.round(t * nSeg);
    return nearestIdx;
  });

  // Determine if tower should be built based on waypoint position
  useEffect(() => {
    const stop13Index = 14; // stop-13 is at index 14 in the waypoints array

    // Build if at stop-13 or beyond, dissolve if before stop-13
    const shouldBuild =
      currentWaypointIndex >= stop13Index && currentWaypointIndex !== -1;

    if (shouldBuild !== shouldBuildRef.current) {
      shouldBuildRef.current = shouldBuild;
    }
  }, [currentWaypointIndex]);

  const updateUniformAll = (name, val) => {
    materialsRef.current.forEach((m) => {
      const sh = m?.userData?.rtShader;
      if (sh?.uniforms && name in sh.uniforms) {
        sh.uniforms[name].value = val;
      }
    });
  };

  const handleReplay = () => {
    progressRef.current = -0.2;
    updateUniformAll("uProgress", progressRef.current);
  };

  // Patch materials once; preserve transparency & tone mapping intent
  useEffect(() => {
    materialsRef.current.forEach((m) => {
      if (!m || m.userData.rtPatched) return;

      // Skip shader, points, and ALL line materials
      if (m.isShaderMaterial || m.isPointsMaterial || m.isLineMaterial) return;

      // Respect original transparency; configure for stable dissolve
      const wasTransparent = !!m.userData._origTransparent;
      if (wasTransparent) {
        m.transparent = true;
        m.alphaTest = Math.max(m.alphaTest || 0, 0.001);
        m.depthWrite = false; // avoid depth artifacts with transparency
      } else {
        m.transparent = false;
        m.depthWrite = true;
      }

      const prevOnBeforeCompile = m.onBeforeCompile;
      m.onBeforeCompile = (shader) => {
        prevOnBeforeCompile?.(shader);

        // Add varying only once
        if (!/varying\s+vec3\s+worldPos\s*;/.test(shader.vertexShader)) {
          shader.vertexShader = shader.vertexShader.replace(
            "#include <common>",
            "#include <common>\n varying vec3 worldPos;"
          );
        }
        if (!/varying\s+vec3\s+worldPos\s*;/.test(shader.fragmentShader)) {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <common>",
            "#include <common>\n varying vec3 worldPos;"
          );
        }

        // Correct matrix order: modelMatrix * instanceMatrix
        shader.vertexShader = shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          `
          #include <worldpos_vertex>
          #ifdef USE_INSTANCING
            mat4 rtModel = modelMatrix * instanceMatrix;
          #else
            mat4 rtModel = modelMatrix;
          #endif
          worldPos = (rtModel * vec4(transformed, 1.0)).xyz;
          `
        );

        // uniforms
        shader.uniforms.uProgress = { value: progressRef.current };
        shader.uniforms.uEdgeWidth = { value: edgeWidth };
        shader.uniforms.uNoiseScale = { value: noiseScale };
        shader.uniforms.uNoiseAmp = { value: noiseAmp };
        shader.uniforms.uGlowStrength = { value: glowStrength };
        shader.uniforms.uGlowColor = {
          value: new THREE.Color(glowColor),
        };
        shader.uniforms.uMinY = { value: worldYRangeRef.current.min };
        shader.uniforms.uMaxY = { value: worldYRangeRef.current.max };
        shader.uniforms.uSeed = { value: seed };

        const fragPrelude = /* glsl */ `
          uniform float uProgress, uEdgeWidth, uNoiseScale, uNoiseAmp, uMinY, uMaxY, uSeed, uGlowStrength;
          uniform vec3  uGlowColor;

          float rt_hash(vec3 p){
            p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3));
            p += dot(p, p.yzx + 33.33);
            return fract((p.x + p.y) * p.z);
          }
          float rt_vnoise(vec3 x){
            vec3 i = floor(x);
            vec3 f = fract(x);
            vec3 u = f*f*(3.0-2.0*f);
            float n000 = rt_hash(i + vec3(0,0,0));
            float n100 = rt_hash(i + vec3(1,0,0));
            float n010 = rt_hash(i + vec3(0,1,0));
            float n110 = rt_hash(i + vec3(1,1,0));
            float n001 = rt_hash(i + vec3(0,0,1));
            float n101 = rt_hash(i + vec3(1,0,1));
            float n011 = rt_hash(i + vec3(0,1,1));
            float n111 = rt_hash(i + vec3(1,1,1));
            float nx00 = mix(n000, n100, u.x);
            float nx10 = mix(n010, n110, u.x);
            float nx01 = mix(n001, n101, u.x);
            float nx11 = mix(n011, n111, u.x);
            float nxy0 = mix(nx00, nx10, u.y);
            float nxy1 = mix(nx01, nx11, u.y);
            return mix(nxy0, nxy1, u.z);
          }
        `;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          `#include <common>\n${fragPrelude}`
        );

        // Gate
        shader.fragmentShader = shader.fragmentShader.replace(
          "void main() {",
          `void main() {
            float y01 = clamp((worldPos.y - uMinY) / max(1e-5, (uMaxY - uMinY)), 0.0, 1.0);
            float n = rt_vnoise(worldPos * uNoiseScale + vec3(uSeed));
            float cutoff = uProgress + (n - 0.5) * uNoiseAmp;
            if (y01 > cutoff) { discard; }
            float edge = smoothstep(0.0, uEdgeWidth, cutoff - y01);
          `
        );

        // Edge glow injection (before tonemapping/colorspace)
        if (shader.fragmentShader.includes("#include <tonemapping_fragment>")) {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <tonemapping_fragment>",
            `
            gl_FragColor.rgb += edge * uGlowColor * uGlowStrength;
            #include <tonemapping_fragment>
            `
          );
        } else if (
          shader.fragmentShader.includes("#include <colorspace_fragment>")
        ) {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <colorspace_fragment>",
            `
            gl_FragColor.rgb += edge * uGlowColor * uGlowStrength;
            #include <colorspace_fragment>
            `
          );
        } else {
          shader.fragmentShader = shader.fragmentShader.replace(
            /}\s*$/,
            `
            gl_FragColor.rgb += edge * uGlowColor * uGlowStrength;
            }
            `
          );
        }

        m.userData.rtShader = shader;
      };

      m.userData.rtPatched = true;
      // toneMapped policy: only disable when we actually want strong HDR edge
      m.toneMapped =
        glowStrength > 0 ? false : m.userData._origToneMapped;
      m.needsUpdate = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeWidth, noiseScale, noiseAmp, glowStrength, glowColor, seed]);

  // Update toneMapped dynamically if glowStrength changes
  useEffect(() => {
    const wantHDR = glowStrength > 0;
    materialsRef.current.forEach((m) => {
      if (!m || !m.userData) return;
      m.toneMapped = wantHDR ? false : m.userData._origToneMapped;
      m.needsUpdate = true;
    });
  }, [glowStrength]);

  // Live uniform updates
  useEffect(
    () => updateUniformAll("uEdgeWidth", edgeWidth),
    [edgeWidth]
  );
  useEffect(
    () => updateUniformAll("uNoiseScale", noiseScale),
    [noiseScale]
  );
  useEffect(
    () => updateUniformAll("uNoiseAmp", noiseAmp),
    [noiseAmp]
  );
  useEffect(
    () => updateUniformAll("uGlowStrength", glowStrength),
    [glowStrength]
  );
  useEffect(
    () => updateUniformAll("uGlowColor", new THREE.Color(glowColor)),
    [glowColor]
  );
  useEffect(() => updateUniformAll("uSeed", seed), [seed]);

  const updateWorldYRange = () => {
    if (!rootRef.current) return;
    rootRef.current.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rootRef.current);
    worldYRangeRef.current.min = box.min.y;
    worldYRangeRef.current.max = box.max.y;
    updateUniformAll("uMinY", worldYRangeRef.current.min);
    updateUniformAll("uMaxY", worldYRangeRef.current.max);
  };

  // Update bbox on placement edits
  useEffect(() => {
    updateWorldYRange();
  }, [cloned, positionX, positionY, positionZ, rotationYDeg, scale, heightScale]);

  // Small stabilization window to avoid stale bbox after mount/hot-reload
  const initUpdateRef = useRef(2);
  useFrame(() => {
    if (initUpdateRef.current > 0) {
      updateWorldYRange();
      initUpdateRef.current--;
    }
  });

  // Animate dissolve
  useFrame((_, dt) => {
    // Use camera-driven state unless manual control overrides
    const target = build || shouldBuildRef.current ? 1.1 : -0.2;
    const dir = Math.sign(target - progressRef.current);
    if (dir !== 0) {
      const step = speed * dt * dir;
      const next = progressRef.current + step;
      progressRef.current = (dir > 0 ? Math.min : Math.max)(next, target);
      updateUniformAll("uProgress", progressRef.current);
    }
  });

  if (!cloned) return null;

  return (
    <group
      ref={rootRef}
      name="RadioTower"
      dispose={null}
      userData={{ noDistanceFade: true }}
    >
      {isDebugMode && (
        <RadioTowerDebugPanel
          onChange={handleDebugChange}
          onReplay={handleReplay}
        />
      )}
      <group position={position} rotation={[0, rotationY, 0]} scale={scaleVec}>
        <primitive object={cloned} />
      </group>
    </group>
  );
});

useGLTF.preload("/models/radioTower/Radio%20tower_draco.glb"); // Using Draco-compressed version
