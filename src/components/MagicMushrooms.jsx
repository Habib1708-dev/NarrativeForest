// src/components/MagicMushrooms.jsx
import React, { useEffect, useMemo, useRef, forwardRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useControls, folder, button } from "leva";

const MUSHROOM_GLB = "/models/magicPlantsAndCrystal/Mushroom.glb";

export default forwardRef(function MagicMushrooms(props, ref) {
  const { scene } = useGLTF(MUSHROOM_GLB);

  // Instance placements (7th mushroom Y adjusted to -4.82)
  const INSTANCES = useMemo(
    () => [
      {
        position: [-2.487, -4.51, -1.836],
        rotation: [0, 0.0, 0.0],
        scale: 0.2,
      },
      {
        position: [-2.786, -4.394, -2.157],
        rotation: [0, Math.PI, 0.0],
        scale: 0.294,
      },
      {
        position: [-2.499, -4.449, -1.383],
        rotation: [0, 0.825, 0.062],
        scale: 0.16,
      },
      {
        position: [-2.69, -4.429, -3.001],
        rotation: [0, -Math.PI, 0.118],
        scale: 0.18,
      },
      {
        position: [-0.935, -4.167, -3.662],
        rotation: [0, 0.246, 0.117],
        scale: 0.15,
      },
      {
        position: [-1.888, -4.523, -3.583],
        rotation: [0, 1.71, -0.287],
        scale: 0.2,
      },
      // 7th: keep x,z; set y = -4.82
      {
        position: [-1.31, -4.82, -1.71],
        rotation: [0, 0.0, 0.117],
        scale: 0.19,
      },
    ],
    []
  );

  // GLB → list of source meshes (world-baked geometry + bloom-friendly cloned materials)
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
        // We discard pixels in shader; keep depth writes for solid look
        c.transparent = false;
        c.depthWrite = true;
        // Allow strong additive glow to feed bloom
        c.toneMapped = false;
        c.needsUpdate = true;
        return c;
      });

      list.push({
        geometry: g,
        bboxY: { min: g.boundingBox.min.y, max: g.boundingBox.max.y },
        material: Array.isArray(n.material) ? clonedMats : clonedMats[0],
      });
    });
    return list;
  }, [scene]);

  const groupRef = useRef();
  const meshRefs = useRef([]);
  meshRefs.current = [];

  // ---- Dissolve controls (start hidden) ----
  const progressRef = useRef(-0.2);

  const params = useControls({
    Mushrooms: folder(
      {
        Dissolve: folder({
          build: { value: false, label: "Build Mushrooms" },
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
          glowColor: { value: "#ffb97d", label: "Glow Color" }, // single color for all
          seed: { value: 321, min: 0, max: 1000, step: 1, label: "Noise Seed" },
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
      const mats = Array.isArray(src.material) ? src.material : [src.material];
      mats.forEach((m) => {
        const sh = m?.userData?.rtShader;
        if (sh && sh.uniforms && name in sh.uniforms)
          sh.uniforms[name].value = val;
      });
    });
  };

  // ---- Shader patch: per-instance min/max; single uniform glow color ----
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

          // Attributes/varyings for per-instance height normalization
          shader.vertexShader =
            `
            attribute float iMinY;
            attribute float iMaxY;
            varying float vMinY;
            varying float vMaxY;
            ` + shader.vertexShader;

          // World position varying
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

          // world position (instancing-safe) + pass per-instance min/max
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
            vMinY = iMinY;
            vMaxY = iMaxY;
            `
          );

          // Uniforms (single glow color)
          shader.uniforms.uProgress = { value: progressRef.current };
          shader.uniforms.uEdgeWidth = { value: params.edgeWidth };
          shader.uniforms.uNoiseScale = { value: params.noiseScale };
          shader.uniforms.uNoiseAmp = { value: params.noiseAmp };
          shader.uniforms.uGlowStrength = { value: params.glowStrength };
          shader.uniforms.uGlowColor = {
            value: new THREE.Color(params.glowColor),
          };
          shader.uniforms.uSeed = { value: params.seed };

          const fragPrelude = /* glsl */ `
            uniform float uProgress, uEdgeWidth, uNoiseScale, uNoiseAmp, uSeed, uGlowStrength;
            uniform vec3  uGlowColor;
            varying float vMinY, vMaxY;

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

          // Dissolve gate + edge
          shader.fragmentShader = shader.fragmentShader.replace(
            "void main() {",
            `void main() {
              float y01 = clamp((worldPos.y - vMinY) / max(1e-5, (vMaxY - vMinY)), 0.0, 1.0);
              float n = rt_vnoise(worldPos * uNoiseScale + vec3(uSeed));
              float cutoff = uProgress + (n - 0.5) * uNoiseAmp;
              if (y01 > cutoff) { discard; }
              float edge = smoothstep(0.0, uEdgeWidth, cutoff - y01);
            `
          );

          // Add single-color glow before tonemapping (with fallback)
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

  // Animate dissolve progress (in/out)
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

  // Assign transforms + per-instance Y-range attributes (no per-instance colors)
  const assignInstances = () => {
    if (!sources.length) return;

    meshRefs.current.forEach((imesh, sIdx) => {
      if (!imesh) return;

      const { min: minY0, max: maxY0 } = sources[sIdx].bboxY;

      const minYArr = new Float32Array(INSTANCES.length);
      const maxYArr = new Float32Array(INSTANCES.length);

      const dummy = new THREE.Object3D();

      for (let i = 0; i < INSTANCES.length; i++) {
        const cfg = INSTANCES[i];
        const pos = cfg.position;

        // Transform (positions from INSTANCES; rotations/scales unchanged)
        dummy.position.set(pos[0], pos[1], pos[2]);
        dummy.rotation.set(
          cfg.rotation[0] || 0,
          cfg.rotation[1] || 0,
          cfg.rotation[2] || 0
        );
        const sc = cfg.scale ?? 1;
        const sx = typeof sc === "number" ? sc : sc[0];
        const sy = typeof sc === "number" ? sc : sc[1];
        const sz = typeof sc === "number" ? sc : sc[2];
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        imesh.setMatrixAt(i, dummy.matrix);

        // Per-instance Y range (rotation around Y only → Y scales by sy)
        minYArr[i] = pos[1] + sy * minY0;
        maxYArr[i] = pos[1] + sy * maxY0;
      }

      imesh.geometry.setAttribute(
        "iMinY",
        new THREE.InstancedBufferAttribute(minYArr, 1)
      );
      imesh.geometry.setAttribute(
        "iMaxY",
        new THREE.InstancedBufferAttribute(maxYArr, 1)
      );

      imesh.instanceMatrix.needsUpdate = true;
    });
  };

  useEffect(() => {
    assignInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, INSTANCES]);

  if (!scene || sources.length === 0) return null;

  return (
    <group
      ref={(n) => {
        if (typeof ref === "function") ref(n);
        else if (ref) ref.current = n;
        groupRef.current = n;
      }}
      name="MagicMushrooms"
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

useGLTF.preload(MUSHROOM_GLB);
