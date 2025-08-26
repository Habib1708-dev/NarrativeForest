// src/components/RadioTower.jsx
import React, {
  forwardRef,
  useMemo,
  useRef,
  useEffect,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder, button } from "leva";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useFrame } from "@react-three/fiber";

export default forwardRef(function RadioTower(_, ref) {
  const glbPath = "/models/radioTower/Radio%20tower.glb";
  const { scene } = useGLTF(glbPath);

  const cloned = useMemo(() => (scene ? skeletonClone(scene) : null), [scene]);

  const rootRef = useRef(null);
  useImperativeHandle(ref, () => rootRef.current, []);

  const materialsRef = useRef([]);
  useEffect(() => {
    if (!cloned) return;
    const mats = new Map();
    cloned.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      arr.forEach((m) => {
        if (!m) return;
        if (m.color && !m.userData._origColor) {
          m.userData._origColor = m.color.clone();
        }
        mats.set(m.uuid, m);
      });
    });
    materialsRef.current = Array.from(mats.values());
  }, [cloned]);

  const params = useControls({
    "Radio Tower": folder(
      {
        Transform: folder({
          positionX: { value: 0.0, min: -200, max: 200, step: 0.01 },
          positionY: { value: -4.7, min: -200, max: 200, step: 0.01 },
          positionZ: { value: -1.9, min: -200, max: 200, step: 0.01 },
          rotationYDeg: {
            value: 0,
            min: -180,
            max: 180,
            step: 0.1,
            label: "Rotation Y (deg)",
          },
          scale: {
            value: 0.03,
            min: 0.001,
            max: 5,
            step: 0.001,
            label: "Uniform Scale",
          },
          heightScale: {
            value: 1.8,
            min: 0.1,
            max: 10,
            step: 0.01,
            label: "Height Scale (Y)",
          },
        }),
        Appearance: folder({
          tintColor: { value: "#ffffff", label: "Tint Color" },
          tintIntensity: {
            value: 0.0,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Tint Intensity",
          },
        }),
        Dissolve: folder({
          build: { value: false, label: "Build Tower" },
          speed: {
            value: 0.6,
            min: 0.05,
            max: 3,
            step: 0.01,
            label: "Speed (units/sec)",
          },
          noiseScale: {
            value: 1.8,
            min: 0.1,
            max: 6,
            step: 0.01,
            label: "Noise Scale",
          },
          noiseAmp: {
            value: 0.35,
            min: 0,
            max: 1.5,
            step: 0.01,
            label: "Noise Amplitude",
          },
          edgeWidth: {
            value: 0.08,
            min: 0.0,
            max: 0.4,
            step: 0.005,
            label: "Edge Width",
          },
          glowStrength: {
            value: 3.0,
            min: 0.0,
            max: 10,
            step: 0.05,
            label: "Glow Strength",
          },
          glowColor: { value: "#ffb97d", label: "Glow Color" },
          seed: { value: 17, min: 0, max: 1000, step: 1, label: "Noise Seed" },
          Replay: button(() => {
            progressRef.current = -0.2;
            updateUniformAll("uProgress", progressRef.current);
          }),
        }),
      },
      { collapsed: false }
    ),
  });

  const {
    positionX,
    positionY,
    positionZ,
    rotationYDeg,
    scale,
    heightScale,
    tintColor,
    tintIntensity,
  } = params;

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

  // -------- Dissolve (robust, chainable) --------
  const progressRef = useRef(-0.2);
  const worldYRangeRef = useRef({ min: 0, max: 1 });

  const updateUniformAll = (name, val) => {
    materialsRef.current.forEach((m) => {
      const sh = m?.userData?.rtShader;
      if (sh && sh.uniforms && name in sh.uniforms)
        sh.uniforms[name].value = val;
    });
  };

  useEffect(() => {
    materialsRef.current.forEach((m) => {
      if (!m || m.userData.rtPatched) return;
      if (!(m instanceof THREE.MeshStandardMaterial)) return;

      // Chain any existing patch (e.g., UnifiedForwardFog) instead of overwriting it.
      const prevOnBeforeCompile = m.onBeforeCompile;

      m.onBeforeCompile = (shader) => {
        // Let earlier patch(es) run first
        if (typeof prevOnBeforeCompile === "function")
          prevOnBeforeCompile(shader);

        // Ensure shared varying only once
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

        // Compute worldPos WITHOUT relying on `worldPosition`
        shader.vertexShader = shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          `
          #include <worldpos_vertex>
          #ifdef USE_INSTANCING
            mat4 rtModel = instanceMatrix * modelMatrix;
          #else
            mat4 rtModel = modelMatrix;
          #endif
          worldPos = (rtModel * vec4(transformed, 1.0)).xyz;
          `
        );

        // Add our uniforms (unique names) + helpers
        if (!/uniform\s+float\s+uProgress\s*;/.test(shader.fragmentShader)) {
          shader.uniforms.uProgress = { value: progressRef.current };
          shader.uniforms.uEdgeWidth = { value: params.edgeWidth };
          shader.uniforms.uNoiseScale = { value: params.noiseScale };
          shader.uniforms.uNoiseAmp = { value: params.noiseAmp };
          shader.uniforms.uGlowStrength = { value: params.glowStrength };
          shader.uniforms.uGlowColor = {
            value: new THREE.Color(params.glowColor),
          };
          shader.uniforms.uMinY = { value: worldYRangeRef.current.min };
          shader.uniforms.uMaxY = { value: worldYRangeRef.current.max };
          shader.uniforms.uSeed = { value: params.seed };

          const fragPrelude = /* glsl */ `
            uniform float uProgress, uEdgeWidth, uNoiseScale, uNoiseAmp, uMinY, uMaxY, uSeed, uGlowStrength;
            uniform vec3  uGlowColor;

            // Prefixed noise to avoid name collisions
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

          // Insert dissolve gate early in main
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

          // Add glow energy to the PBR emissive term
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
             totalEmissiveRadiance += edge * uGlowColor * uGlowStrength;`
          );
        }

        m.userData.rtShader = shader;
      };

      m.userData.rtPatched = true;
      m.transparent = false; // we discard; keep depth write for nice edges
      m.needsUpdate = true;
    });
  }, [params.edgeWidth, params.noiseScale, params.noiseAmp, params.glowStrength, params.glowColor, params.seed]);

  useEffect(
    () => updateUniformAll("uEdgeWidth", params.edgeWidth),
    [params.edgeWidth]
  );
  useEffect(
    () => updateUniformAll("uNoiseScale", params.noiseScale),
    [params.noiseScale]
  );
  useEffect(
    () => updateUniformAll("uNoiseAmp", params.noiseAmp),
    [params.noiseAmp]
  );
  useEffect(
    () => updateUniformAll("uGlowStrength", params.glowStrength),
    [params.glowStrength]
  );
  useEffect(
    () => updateUniformAll("uGlowColor", new THREE.Color(params.glowColor)),
    [params.glowColor]
  );
  useEffect(() => updateUniformAll("uSeed", params.seed), [params.seed]);

  const updateWorldYRange = () => {
    if (!rootRef.current) return;
    rootRef.current.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rootRef.current);
    worldYRangeRef.current.min = box.min.y;
    worldYRangeRef.current.max = box.max.y;
    updateUniformAll("uMinY", worldYRangeRef.current.min);
    updateUniformAll("uMaxY", worldYRangeRef.current.max);
  };

  useEffect(() => {
    updateWorldYRange();
  }, [cloned, positionX, positionY, positionZ, rotationYDeg, scale, heightScale]);

  useFrame((_, dt) => {
    const target = params.build ? 1.1 : -0.2;
    const dir = Math.sign(target - progressRef.current);
    if (dir !== 0) {
      const step = params.speed * dt * dir;
      const next = progressRef.current + step;
      progressRef.current = (dir > 0 ? Math.min : Math.max)(next, target);
      updateUniformAll("uProgress", progressRef.current);
    }
  });

  if (!cloned) return null;

  return (
    <group ref={rootRef} name="RadioTower" dispose={null}>
      <group position={position} rotation={[0, rotationY, 0]} scale={scaleVec}>
        <primitive object={cloned} />
      </group>
    </group>
  );
});

useGLTF.preload("/models/radioTower/Radio%20tower.glb");
