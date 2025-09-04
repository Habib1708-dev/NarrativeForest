// src/components/MagicFlowers.jsx
import React, { useEffect, useMemo, useRef, forwardRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useControls, folder, button } from "leva";

const FLOWERS_GLB = "/models/magicPlantsAndCrystal/PurpleFlowers.glb";

export default forwardRef(function MagicFlowers(props, ref) {
  const { scene } = useGLTF(FLOWERS_GLB);

  const INSTANCES = useMemo(
    () => [
      {
        position: [-0.822, -4.14, -3.5],
        rotation: [-0.059, 0, -0.117],
        scale: 0.1,
      },
      {
        position: [-0.8, -4.15, -3.6],
        rotation: [-0.352, 0.477, 0],
        scale: 0.1,
      },
      {
        position: [-0.912, -4.15, -3.56],
        rotation: [-0.117, 1.527, 0],
        scale: 0.1,
      },
      {
        position: [-2.42, -4.57, -1.42],
        rotation: [0, 0, -0.117],
        scale: 0.09,
      },
      {
        position: [-2.39, -4.59, -1.53],
        rotation: [0, 0, -0.059],
        scale: 0.09,
      },
      { position: [-2.35, -4.6, -1.66], rotation: [-0.258, 0, 0], scale: 0.06 },
      { position: [-2.38, -4.59, -1.418], rotation: [0, 0, 0], scale: 0.09 },
      {
        position: [-2.55, -4.22, -3.44],
        rotation: [-0.235, 0, 0.059],
        scale: 0.11,
      },
      {
        position: [-0.96, -4.28, -2.84],
        rotation: [-0.18, 0, -0.12],
        scale: 0.11,
      },
      { position: [-0.96, -4.29, -2.96], rotation: [-0.235, 0, 0], scale: 0.1 },
    ],
    []
  );

  const sources = useMemo(() => {
    if (!scene) return [];
    const list = [];
    scene.updateMatrixWorld(true);
    scene.traverse((n) => {
      if (!n.isMesh) return;
      const g = n.geometry.clone();
      g.applyMatrix4(n.matrixWorld);
      g.computeBoundingBox();
      g.computeBoundingSphere();

      const srcMats = Array.isArray(n.material) ? n.material : [n.material];
      const clonedMats = srcMats.map((m) => {
        const c = m.clone();
        c.transparent = false;
        c.depthWrite = true;
        c.toneMapped = false; // bloom-friendly glow
        c.needsUpdate = true;
        return c;
      });

      list.push({
        geometry: g,
        material: Array.isArray(n.material) ? clonedMats : clonedMats[0],
      });
    });
    return list;
  }, [scene]);

  const groupRef = useRef();
  const meshRefs = useRef([]);
  meshRefs.current = [];

  // ---- Dissolve (start hidden) ----
  const progressRef = useRef(-0.2);
  const worldYRangeRef = useRef({ min: 0, max: 1 });

  const params = useControls({
    Flowers: folder(
      {
        Dissolve: folder({
          build: { value: false, label: "Build Flowers" },
          speed: {
            value: 0.24,
            min: 0.05,
            max: 3,
            step: 0.01,
            label: "Speed (units/sec)",
          },
          noiseScale: {
            value: 4.5,
            min: 0.1,
            max: 6,
            step: 0.01,
            label: "Noise Scale",
          },
          noiseAmp: {
            value: 0.8,
            min: 0,
            max: 1.5,
            step: 0.01,
            label: "Noise Amplitude",
          },
          edgeWidth: {
            value: 0.15,
            min: 0.0,
            max: 0.4,
            step: 0.005,
            label: "Edge Width",
          },
          glowStrength: {
            value: 10.0,
            min: 0.0,
            max: 50,
            step: 0.1,
            label: "Glow Strength",
          },
          glowColor: { value: "#ffb97d", label: "Glow Color" },
          seed: { value: 777, min: 0, max: 1000, step: 1, label: "Noise Seed" },
          Replay: button(() => {
            progressRef.current = -0.2;
            updateUniformAll("uProgress", progressRef.current);
          }),
        }),
      },
      { collapsed: true }
    ),
  });

  const updateUniformAll = (name, val) => {
    sources.forEach((src) => {
      const mat = src.material;
      (Array.isArray(mat) ? mat : [mat]).forEach((m) => {
        const sh = m?.userData?.rtShader;
        if (sh && sh.uniforms && name in sh.uniforms) {
          sh.uniforms[name].value = val;
        }
      });
    });
  };

  useEffect(() => {
    sources.forEach((src) => {
      const mats = Array.isArray(src.material) ? src.material : [src.material];
      mats.forEach((m) => {
        if (!m || m.userData.rtPatched) return;
        if (m.isShaderMaterial || m.isPointsMaterial || m.isLineBasicMaterial)
          return;

        const prev = m.onBeforeCompile;
        m.onBeforeCompile = (shader) => {
          prev?.(shader);

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

          if (
            shader.fragmentShader.includes("#include <tonemapping_fragment>")
          ) {
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
        m.needsUpdate = true;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live uniform updates
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
    if (!groupRef.current) return;
    groupRef.current.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(groupRef.current);
    worldYRangeRef.current.min = box.min.y;
    worldYRangeRef.current.max = box.max.y;
    updateUniformAll("uMinY", worldYRangeRef.current.min);
    updateUniformAll("uMaxY", worldYRangeRef.current.max);
  };

  useEffect(() => {
    updateWorldYRange();
  }, [sources]);

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

  useEffect(() => {
    if (!sources.length) return;
    const dummy = new THREE.Object3D();
    meshRefs.current.forEach((imesh) => {
      if (!imesh) return;
      for (let i = 0; i < INSTANCES.length; i++) {
        const cfg = INSTANCES[i];
        dummy.position.set(cfg.position[0], cfg.position[1], cfg.position[2]);
        dummy.rotation.set(
          cfg.rotation[0] || 0,
          cfg.rotation[1] || 0,
          cfg.rotation[2] || 0
        );
        const sc = cfg.scale ?? 1;
        if (typeof sc === "number") dummy.scale.set(sc, sc, sc);
        else dummy.scale.set(sc[0], sc[1], sc[2]);
        dummy.updateMatrix();
        imesh.setMatrixAt(i, dummy.matrix);
      }
      imesh.instanceMatrix.needsUpdate = true;
    });
  }, [sources, INSTANCES]);

  if (!scene || sources.length === 0) return null;

  return (
    <group
      ref={(n) => {
        groupRef.current = n;
        if (typeof ref === "function") ref(n);
        else if (ref) ref.current = n;
      }}
      name="MagicFlowers"
      {...props}
    >
      {sources.map((src, idx) => (
        <instancedMesh
          key={idx}
          ref={(el) => (meshRefs.current[idx] = el)}
          args={[src.geometry, src.material, INSTANCES.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
});

useGLTF.preload(FLOWERS_GLB);
