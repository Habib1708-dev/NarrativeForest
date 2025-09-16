// src/components/MagicMushrooms.jsx
import React, { useEffect, useMemo, useRef, forwardRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useControls, folder, button } from "leva";

const MUSHROOM_GLB = "/models/magicPlantsAndCrystal/Mushroom.glb";

// ---------------------------------------------------------------------
// Particle system used by all mushroom instances
// ---------------------------------------------------------------------
function MushroomClickParticles({
  INSTANCES,
  getInstanceScale,
  getInstancePosition,
  // Tunables
  maxPerBurst = 60,
  maxBursts = 16,
  riseSpeed = 1.2, // base upward velocity
  lateralJitter = 0.4, // random lateral factor
  gravity = 0.0, // downward accel if you want (0 by default)
  lifeSeconds = [0.6, 1.1], // lifespan range per particle
  boxRatio = { x: 0.6, y: 0.3, z: 0.6 }, // emitter box as fraction of instance scale
  fadeHeight = 1.2, // altitude fade range
  color = "#ffd2a0", // warm spores
  sizePx = 10, // sprite size in px (screen-space)
  refHook, // parent ref to call emitBurst(id)
}) {
  const totalParticles = maxPerBurst * maxBursts;

  // Pool state
  const positions = useRef(new Float32Array(totalParticles * 3));
  const ages = useRef(new Float32Array(totalParticles));
  const lifetimes = useRef(new Float32Array(totalParticles));
  const alive = useRef(new Uint8Array(totalParticles));
  const origins = useRef(new Float32Array(totalParticles * 3)); // emitter origin (for altitude fade)
  const velocities = useRef(new Float32Array(totalParticles * 3)); // simple kinematics

  // Free-list stack of indices
  const freeList = useRef(Array.from({ length: totalParticles }, (_, i) => i));

  const geometryRef = useRef(null);
  const pointsRef = useRef(null);

  // Utility
  const rand = (a, b) => a + Math.random() * (b - a);
  const popIndex = () => freeList.current.pop();
  const pushIndex = (i) => freeList.current.push(i);

  // Build geometry & attributes once
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions.current, 3));
    // Custom attributes: per-particle life ratio + origin.y (for altitude fade)
    const lifeRatioArray = new Float32Array(totalParticles);
    const originYArray = new Float32Array(totalParticles);
    g.setAttribute("aLife", new THREE.BufferAttribute(lifeRatioArray, 1));
    g.setAttribute("aOriginY", new THREE.BufferAttribute(originYArray, 1));
    return g;
  }, [totalParticles]);

  // Shader material — clamp gl_PointSize + fade near-camera to prevent giant disc
  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uSize: { value: sizePx },
        uFadeHeight: { value: fadeHeight },
        uViewport: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        uniform float uSize;
        uniform vec2  uViewport;
        attribute float aLife;      // 0..1
        attribute float aOriginY;   // origin y for altitude fade
        varying float vLife;        // pass to frag
        varying float vHeight;      // delta height from origin
        varying float vCamZ;        // camera-space depth (>0 in front of camera)

        void main() {
          vLife = aLife;
          vHeight = position.y - aOriginY;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vCamZ = -mvPosition.z;

          gl_Position = projectionMatrix * mvPosition;

          // Size attenuation; clamp to avoid huge point sprite
          float size = uSize * (300.0 / max(0.001, vCamZ));
          gl_PointSize = clamp(size, 1.0, 128.0);
        }
      `,
      fragmentShader: `
        uniform vec3  uColor;
        uniform float uFadeHeight;
        varying float vLife;     // 0..1 life ratio
        varying float vHeight;   // world-height from origin
        varying float vCamZ;

        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(uv, uv);
          if (r2 > 1.0) discard;
          float disk = smoothstep(1.0, 0.0, r2);

          float lifeFade = 1.0 - clamp(vLife, 0.0, 1.0);
          float h = clamp(vHeight / max(uFadeHeight, 1e-4), 0.0, 1.0);
          float heightFade = 1.0 - h;

          // Fade out very-near particles (tweak thresholds to taste)
          float nearFade = smoothstep(0.3, 1.2, vCamZ);

          float alpha = disk * lifeFade * heightFade * nearFade;
          if (alpha <= 1e-4) discard;

          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
    return mat;
  }, [color, sizePx, fadeHeight]);

  // Keep viewport uniform in sync
  useFrame(({ size }) => {
    material.uniforms.uViewport.value.set(size.width, size.height);
  });

  // Update simulation
  useFrame((_, dt) => {
    if (!geometryRef.current) return;

    const posAttr = geometryRef.current.getAttribute("position");
    const lifeAttr = geometryRef.current.getAttribute("aLife");
    const orgAttr = geometryRef.current.getAttribute("aOriginY");

    let any = false;
    const N = totalParticles;
    for (let i = 0; i < N; i++) {
      if (!alive.current[i]) continue;

      ages.current[i] += dt;
      const life = lifetimes.current[i];
      if (ages.current[i] >= life) {
        // Recycle
        alive.current[i] = 0;
        pushIndex(i);
        continue;
      }

      const i3 = i * 3;

      // dynamics
      velocities.current[i3 + 1] += -gravity * dt;
      positions.current[i3 + 0] += velocities.current[i3 + 0] * dt;
      positions.current[i3 + 1] += velocities.current[i3 + 1] * dt;
      positions.current[i3 + 2] += velocities.current[i3 + 2] * dt;

      // write positions
      posAttr.array[i3 + 0] = positions.current[i3 + 0];
      posAttr.array[i3 + 1] = positions.current[i3 + 1];
      posAttr.array[i3 + 2] = positions.current[i3 + 2];

      // write life ratio and originY (for altitude fade)
      lifeAttr.array[i] = ages.current[i] / life;
      orgAttr.array[i] = origins.current[i3 + 1];

      any = true;
    }

    if (any) {
      posAttr.needsUpdate = true;
      lifeAttr.needsUpdate = true;
      orgAttr.needsUpdate = true;
    }
  });

  // Expose "emitBurst" to parent
  const emitBurst = (id, count = maxPerBurst) => {
    const origin = getInstancePosition(id);
    if (!origin) return;

    const { sx, sy, sz } = getInstanceScale(id);
    const halfX = Math.max(0.02, sx * boxRatio.x);
    const halfY = Math.max(0.01, sy * boxRatio.y);
    const halfZ = Math.max(0.02, sz * boxRatio.z);

    for (let n = 0; n < count; n++) {
      const idx = popIndex();
      if (idx == null) break; // pool full

      const i3 = idx * 3;

      // Seed position within box
      const px = origin.x + (Math.random() * 2 - 1) * halfX;
      const py = origin.y + Math.random() * halfY; // slightly above cap
      const pz = origin.z + (Math.random() * 2 - 1) * halfZ;
      positions.current[i3 + 0] = px;
      positions.current[i3 + 1] = py;
      positions.current[i3 + 2] = pz;

      // Save origin for altitude fade
      origins.current[i3 + 0] = origin.x;
      origins.current[i3 + 1] = origin.y;
      origins.current[i3 + 2] = origin.z;

      // Velocity: upwards + small lateral jitter
      velocities.current[i3 + 0] =
        (Math.random() * 2 - 1) * lateralJitter * 0.4;
      velocities.current[i3 + 1] = riseSpeed * (0.8 + Math.random() * 0.4);
      velocities.current[i3 + 2] =
        (Math.random() * 2 - 1) * lateralJitter * 0.4;

      // Life
      ages.current[idx] = 0;
      lifetimes.current[idx] = rand(lifeSeconds[0], lifeSeconds[1]);
      alive.current[idx] = 1;
    }

    // mark position buffer dirty now
    if (geometryRef.current) {
      geometryRef.current.attributes.position.needsUpdate = true;
    }
  };

  useEffect(() => {
    if (!refHook) return;
    refHook.current = { emitBurst };
    return () => {
      if (refHook.current) refHook.current = null;
    };
  }, [refHook]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry ref={geometryRef} {...geom} />
      <primitive object={material} attach="material" />
    </points>
  );
}

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

  // =========================
  // Dissolve controls
  // =========================
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

  // =========================
  // Global Gradient controls
  // =========================
  const gradCtl = useControls({
    Gradient: folder(
      {
        bottomColor: { value: "#da63ff", label: "Bottom" },
        topColor: { value: "#ffa22b", label: "Top" },
        height: {
          value: 0.51,
          min: 0,
          max: 1,
          step: 0.001,
          label: "Height (midpoint)",
        },
        soft: {
          value: 0.2,
          min: 0.001,
          max: 0.5,
          step: 0.001,
          label: "Soft (half-width)",
        },
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

  // =========================
  // Interaction (Click → Squeeze)
  // =========================
  const squeezeCtl = useControls({
    Interaction: folder(
      {
        enabled: { value: true, label: "Enable Click" },
        squeezeAmount: {
          value: 0.13,
          min: 0,
          max: 0.8,
          step: 0.01,
          label: "Squeeze Amount",
        },
        preserveVolume: { value: true, label: "Preserve Volume (inflate XZ)" },
        squeezeSpeed: {
          value: 4.8,
          min: 1,
          max: 20,
          step: 0.1,
          label: "Squeeze Speed",
        },
        releaseSpeed: {
          value: 4.8,
          min: 1,
          max: 20,
          step: 0.1,
          label: "Release Speed",
        },
        autoRelease: { value: true, label: "Auto Release" },
        holdSeconds: {
          value: 0.2,
          min: 0.0,
          max: 2.0,
          step: 0.01,
          label: "Hold (s)",
        },
        ResetAll: button(() => {
          const N = INSTANCES.length;
          for (let i = 0; i < N; i++) {
            targetSqueeze.current[i] = 0;
            currentSqueeze.current[i] = 0;
            holdTimers.current[i] = 0;
          }
          matricesDirtyRef.current = true;
        }),
      },
      { collapsed: false }
    ),
  });

  // Per-instance squeeze state
  const currentSqueeze = useRef(new Float32Array(INSTANCES.length).fill(0));
  const targetSqueeze = useRef(new Float32Array(INSTANCES.length).fill(0));
  const holdTimers = useRef(Array(INSTANCES.length).fill(0));
  const matricesDirtyRef = useRef(true);

  // Particles ref + helpers for scale/position
  const particlesRef = useRef(null);

  const getInstanceScale = (id) => {
    const sc = INSTANCES[id]?.scale ?? 1;
    const sx = typeof sc === "number" ? sc : sc[0];
    const sy = typeof sc === "number" ? sc : sc[1];
    const sz = typeof sc === "number" ? sc : sc[2];
    return { sx, sy, sz };
  };
  const getInstancePosition = (id) => {
    const p = INSTANCES[id]?.position;
    if (!p) return null;
    return new THREE.Vector3(p[0], p[1], p[2]);
  };

  // Click handler (shared for all instanced submeshes)
  const onClickInstance = (e) => {
    if (!squeezeCtl.enabled) return;
    e.stopPropagation();
    const id = e.instanceId;
    if (id == null) return;

    // Squeeze
    if (squeezeCtl.autoRelease) {
      targetSqueeze.current[id] = squeezeCtl.squeezeAmount;
      holdTimers.current[id] = Math.max(
        holdTimers.current[id],
        squeezeCtl.holdSeconds
      );
    } else {
      const near = Math.abs(targetSqueeze.current[id]) < 1e-3;
      targetSqueeze.current[id] = near ? squeezeCtl.squeezeAmount : 0.0;
    }
    matricesDirtyRef.current = true;

    // Emit particle burst for this instance
    particlesRef.current?.emitBurst(id);
  };

  // Helper to update a uniform on all patched materials
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

  // =========================
  // Shader patch: dissolve + two-color height gradient (global mid/soft)
  // =========================
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

          // Ensure worldPos varyings exist (proper regex + real newline insertion)
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

          // Compute world position safely with instancing
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

            vMinY = iMinY;
            vMaxY = iMaxY;
            `
          );

          // Uniforms
          shader.uniforms.uProgress = { value: -0.2 };
          shader.uniforms.uEdgeWidth = { value: 0.15 };
          shader.uniforms.uNoiseScale = { value: 4.5 };
          shader.uniforms.uNoiseAmp = { value: 0.8 };
          shader.uniforms.uGlowStrength = { value: 10.0 };
          shader.uniforms.uSeed = { value: 321 };

          // Global gradient
          shader.uniforms.uBottomColor = { value: new THREE.Color("#da63ff") };
          shader.uniforms.uTopColor = { value: new THREE.Color("#ffa22b") };
          shader.uniforms.uMid = { value: 0.51 };
          shader.uniforms.uSoft = { value: 0.2 };
          shader.uniforms.uGradIntensity = { value: 1.0 };

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

  // =========================
  // Live uniform updates
  // =========================
  useEffect(
    () => updateUniformAll("uEdgeWidth", 0.15),
    [dissolveCtl.edgeWidth]
  );
  useEffect(
    () => updateUniformAll("uNoiseScale", 4.5),
    [dissolveCtl.noiseScale]
  );
  useEffect(() => updateUniformAll("uNoiseAmp", 0.8), [dissolveCtl.noiseAmp]);
  useEffect(
    () => updateUniformAll("uGlowStrength", 10.0),
    [dissolveCtl.glowStrength]
  );
  useEffect(() => updateUniformAll("uSeed", 321), [dissolveCtl.seed]);

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

  // =========================
  // Dissolve animation
  // =========================
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

  // =========================
  // Instance transforms (initial)
  // =========================
  const assignInstances = () => {
    if (!sources.length) return;

    meshRefs.current.forEach((imesh, sIdx) => {
      if (!imesh) return;

      const { min: minY0, max: maxY0 } = sources[sIdx].bboxY;
      const N = INSTANCES.length;
      const minYArr = new Float32Array(N);
      const maxYArr = new Float32Array(N);
      const tmp = new THREE.Object3D();

      for (let i = 0; i < N; i++) {
        const cfg = INSTANCES[i];
        const pos = cfg.position;
        tmp.position.set(pos[0], pos[1], pos[2]);
        tmp.rotation.set(
          cfg.rotation[0] || 0,
          cfg.rotation[1] || 0,
          cfg.rotation[2] || 0
        );
        const sc = cfg.scale ?? 1;
        const sx = typeof sc === "number" ? sc : sc[0];
        const sy = typeof sc === "number" ? sc : sc[1];
        const sz = typeof sc === "number" ? sc : sc[2];
        tmp.scale.set(sx, sy, sz);
        tmp.updateMatrix();
        imesh.setMatrixAt(i, tmp.matrix);

        // Per-instance Y range
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

  // =========================
  // Animate squeeze + update matrices
  // =========================
  const tmpObj = useRef(new THREE.Object3D());
  useFrame((_, dt) => {
    const N = INSTANCES.length;
    let anyChanged = false;

    // timers + targets
    for (let i = 0; i < N; i++) {
      if (holdTimers.current[i] > 0) {
        holdTimers.current[i] -= dt;
        if (holdTimers.current[i] <= 0) {
          holdTimers.current[i] = 0;
          targetSqueeze.current[i] = 0; // release
          matricesDirtyRef.current = true;
        }
      }
    }

    // integrate towards targets
    for (let i = 0; i < N; i++) {
      const curr = currentSqueeze.current[i];
      const tgt = targetSqueeze.current[i];
      const spd =
        tgt > curr ? squeezeCtl.squeezeSpeed : squeezeCtl.releaseSpeed;
      const alpha = 1.0 - Math.exp(-spd * dt);
      const next = THREE.MathUtils.lerp(curr, tgt, alpha);
      if (Math.abs(next - curr) > 1e-5) {
        currentSqueeze.current[i] = next;
        anyChanged = true;
      }
    }

    if (!anyChanged && !matricesDirtyRef.current) return;
    matricesDirtyRef.current = false;

    // Recompute matrices with squeeze applied
    meshRefs.current.forEach((imesh) => {
      if (!imesh) return;
      for (let i = 0; i < N; i++) {
        const cfg = INSTANCES[i];
        const pos = cfg.position;

        const amount = currentSqueeze.current[i]; // 0..squeezeAmount
        // Build squeezed scale:
        // - Y compressed by (1 - amount)
        // - X/Z inflated by (1 + k*amount) if preserveVolume
        const baseS = cfg.scale ?? 1;
        const baseSX = typeof baseS === "number" ? baseS : baseS[0];
        const baseSY = typeof baseS === "number" ? baseS : baseS[1];
        const baseSZ = typeof baseS === "number" ? baseS : baseS[2];

        const inflate = squeezeCtl.preserveVolume ? 1 + 0.5 * amount : 1.0; // ~volume conservation
        const sx = baseSX * inflate;
        const sy = baseSY * (1 - amount);
        const sz = baseSZ * inflate;

        const d = tmpObj.current;
        d.position.set(pos[0], pos[1], pos[2]);
        d.rotation.set(
          cfg.rotation[0] || 0,
          cfg.rotation[1] || 0,
          cfg.rotation[2] || 0
        );
        d.scale.set(sx, sy, sz);
        d.updateMatrix();
        imesh.setMatrixAt(i, d.matrix);
      }
      imesh.instanceMatrix.needsUpdate = true;
    });
  });

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
      {/* Particle pool (single) */}
      <MushroomClickParticles
        refHook={particlesRef}
        INSTANCES={INSTANCES}
        getInstanceScale={getInstanceScale}
        getInstancePosition={getInstancePosition}
        // Optional tunables:
        maxPerBurst={60}
        maxBursts={16}
        riseSpeed={1.25}
        lateralJitter={0.45}
        gravity={0.0}
        lifeSeconds={[0.6, 1.1]}
        boxRatio={{ x: 0.6, y: 0.3, z: 0.6 }}
        fadeHeight={1.25}
        color={"#ffd2a0"}
        sizePx={11}
      />

      {/* Instanced mushrooms (all submeshes) */}
      {sources.map((src, idx) => (
        <instancedMesh
          key={idx}
          ref={(el) => (meshRefs.current[idx] = el)}
          args={[src.geometry, src.material, INSTANCES.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
          onClick={onClickInstance}
          onPointerDown={onClickInstance}
        />
      ))}
    </group>
  );
});

useGLTF.preload(MUSHROOM_GLB);
