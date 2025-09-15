// src/components/MagicMushrooms.jsx
import React, { useEffect, useMemo, useRef, forwardRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useControls, folder, button } from "leva";

const MUSHROOM_GLB = "/models/magicPlantsAndCrystal/Mushroom.glb";

export default forwardRef(function MagicMushrooms(props, ref) {
  const { scene } = useGLTF(MUSHROOM_GLB);

  // ----- Instance placements (7th mushroom Y adjusted to -4.82) -----
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
      {
        position: [-1.31, -4.82, -1.71],
        rotation: [0, 0.0, 0.117],
        scale: 0.19,
      },
    ],
    []
  );

  // ----- Extract meshes from GLB (bake world transforms; clone materials) -----
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
        c.toneMapped = false; // keep additive glow outside tonemapping
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

  // ----- Dissolve controls -----
  const progressRef = useRef(-0.2);
  const dissolveCtl = useControls({
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

  // ----- Global gradient controls (shared by ALL instances) -----
  const gradCtl = useControls({
    Gradient: folder(
      {
        bottomColor: { value: "#da63ff", label: "Bottom" }, // requested defaults
        topColor: { value: "#ffa22b", label: "Top" }, // requested defaults
        height: {
          value: 0.51,
          min: 0,
          max: 1,
          step: 0.001,
          label: "Height (midpoint)",
        }, // requested 0.12
        soft: {
          value: 0.2,
          min: 0.001,
          max: 0.5,
          step: 0.001,
          label: "Soft (half-width)",
        }, // requested 0.2
        intensity: {
          value: 1.0,
          min: 0,
          max: 1,
          step: 0.01,
          label: "Intensity",
        },
      },
      { collapsed: false }
    ),
  });

  // ----- Helper to update a uniform on all patched materials -----
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

  // ----- Shader patch: dissolve + two-color height gradient (global mid/soft) -----
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

          // Attributes + varyings for per-instance Y extents
          shader.vertexShader =
            `
            attribute float iMinY;
            attribute float iMaxY;
            varying float vMinY;
            varying float vMaxY;
            ` + shader.vertexShader;

          // Pass world position (instancing-safe)
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

            vMinY = iMinY;
            vMaxY = iMaxY;
            `
          );

          // Uniforms
          shader.uniforms.uProgress = { value: progressRef.current };
          shader.uniforms.uEdgeWidth = { value: dissolveCtl.edgeWidth };
          shader.uniforms.uNoiseScale = { value: dissolveCtl.noiseScale };
          shader.uniforms.uNoiseAmp = { value: dissolveCtl.noiseAmp };
          shader.uniforms.uGlowStrength = { value: dissolveCtl.glowStrength };
          shader.uniforms.uSeed = { value: dissolveCtl.seed };

          // Global gradient
          shader.uniforms.uBottomColor = {
            value: new THREE.Color(gradCtl.bottomColor),
          };
          shader.uniforms.uTopColor = {
            value: new THREE.Color(gradCtl.topColor),
          };
          shader.uniforms.uMid = { value: gradCtl.height }; // 0..1 midpoint
          shader.uniforms.uSoft = { value: gradCtl.soft }; // 0..0.5 half-width
          shader.uniforms.uGradIntensity = { value: gradCtl.intensity };

          const fragPrelude = /* glsl */ `
            uniform float uProgress, uEdgeWidth, uNoiseScale, uNoiseAmp, uSeed, uGlowStrength;
            uniform vec3  uBottomColor, uTopColor;
            uniform float uMid, uSoft, uGradIntensity;
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

            float height01(vec3 wp, float minY, float maxY){
              return clamp((wp.y - minY) / max(1e-5, (maxY - minY)), 0.0, 1.0);
            }

            // Smooth split around global midpoint with global softness (half-width)
            float splitBlend(float y01, float mid, float soft){
              float a = clamp(mid - soft, 0.0, 1.0);
              float b = clamp(mid + soft, 0.0, 1.0);
              if (abs(b - a) < 1e-5) return step(mid, y01);
              return smoothstep(a, b, y01);
            }
          `;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <common>",
            `#include <common>\n${fragPrelude}`
          );

          shader.fragmentShader = shader.fragmentShader.replace(
            "void main() {",
            `void main() {
              float y01 = height01(worldPos, vMinY, vMaxY);

              // Dissolve
              float n = rt_vnoise(worldPos * uNoiseScale + vec3(uSeed));
              float cutoff = uProgress + (n - 0.5) * uNoiseAmp;
              if (y01 > cutoff) { discard; }
              float edge = smoothstep(0.0, uEdgeWidth, cutoff - y01);

              // Height gradient color (shared mid/soft)
              float t = splitBlend(y01, uMid, uSoft);
              vec3 gradColor = mix(uBottomColor, uTopColor, t);
            `
          );

          const applyAfterBase = `
              gl_FragColor.rgb = mix(gl_FragColor.rgb, gradColor, clamp(uGradIntensity, 0.0, 1.0));
              gl_FragColor.rgb += edge * gradColor * uGlowStrength;
          `;

          if (
            shader.fragmentShader.includes("#include <tonemapping_fragment>")
          ) {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <tonemapping_fragment>",
              `${applyAfterBase}
               #include <tonemapping_fragment>`
            );
          } else if (
            shader.fragmentShader.includes("#include <colorspace_fragment>")
          ) {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <colorspace_fragment>",
              `${applyAfterBase}
               #include <colorspace_fragment>`
            );
          } else {
            shader.fragmentShader = shader.fragmentShader.replace(
              /}\s*$/,
              `${applyAfterBase}\n}`
            );
          }

          m.userData.rtShader = shader;
        };

        m.userData.rtPatched = true;
        m.needsUpdate = true;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  // ----- Live uniform updates -----
  // Dissolve
  useEffect(
    () => updateUniformAll("uEdgeWidth", dissolveCtl.edgeWidth),
    [dissolveCtl.edgeWidth]
  );
  useEffect(
    () => updateUniformAll("uNoiseScale", dissolveCtl.noiseScale),
    [dissolveCtl.noiseScale]
  );
  useEffect(
    () => updateUniformAll("uNoiseAmp", dissolveCtl.noiseAmp),
    [dissolveCtl.noiseAmp]
  );
  useEffect(
    () => updateUniformAll("uGlowStrength", dissolveCtl.glowStrength),
    [dissolveCtl.glowStrength]
  );
  useEffect(
    () => updateUniformAll("uSeed", dissolveCtl.seed),
    [dissolveCtl.seed]
  );

  // Gradient (global)
  useEffect(
    () =>
      updateUniformAll("uBottomColor", new THREE.Color(gradCtl.bottomColor)),
    [gradCtl.bottomColor]
  );
  useEffect(
    () => updateUniformAll("uTopColor", new THREE.Color(gradCtl.topColor)),
    [gradCtl.topColor]
  );
  useEffect(() => updateUniformAll("uMid", gradCtl.height), [gradCtl.height]);
  useEffect(() => updateUniformAll("uSoft", gradCtl.soft), [gradCtl.soft]);
  useEffect(
    () => updateUniformAll("uGradIntensity", gradCtl.intensity),
    [gradCtl.intensity]
  );

  // ----- Dissolve animation -----
  useFrame((_, dt) => {
    const target = dissolveCtl.build ? 1.1 : -0.2;
    const dir = Math.sign(target - progressRef.current);
    if (dir !== 0) {
      const step = dissolveCtl.speed * dt * dir;
      const next = progressRef.current + step;
      progressRef.current = (dir > 0 ? Math.min : Math.max)(next, target);
      updateUniformAll("uProgress", progressRef.current);
    }
  });

  // ----- Assign transforms and per-instance Y-range attributes -----
  const assignInstances = () => {
    if (!sources.length) return;

    meshRefs.current.forEach((imesh, sIdx) => {
      if (!imesh) return;

      const { min: minY0, max: maxY0 } = sources[sIdx].bboxY;
      const N = INSTANCES.length;
      const minYArr = new Float32Array(N);
      const maxYArr = new Float32Array(N);

      const dummy = new THREE.Object3D();

      for (let i = 0; i < N; i++) {
        const cfg = INSTANCES[i];
        const pos = cfg.position;

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

        // Per-instance Y range (account for scale.y only; rotations are Y-only in placements)
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
      imesh.geometry.attributes.iMinY.needsUpdate = true;
      imesh.geometry.attributes.iMaxY.needsUpdate = true;
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
