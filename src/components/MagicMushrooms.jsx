// src/components/MagicMushrooms.jsx
import React, { useEffect, useMemo, useRef, forwardRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls, folder, button } from "leva";

const MUSHROOM_GLB = "/models/magicPlantsAndCrystal/Mushroom.glb";

// === Optimized Firefly Shaders ===
const firefliesFragmentShader = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float r = length(uv);
  if (r > 0.5) discard;

  // Simple soft circle
  float alpha = (1.0 - r * 2.0) * vAlpha;
  if (alpha <= 0.01) discard;
  
  gl_FragColor = vec4(uColor, alpha);
}
`;

const firefliesVertexShader = `
uniform float uPixelRatio;
uniform float uSize;
uniform float uTime;

attribute vec3 aVelocity;
attribute float aLifetime;
attribute float aBirthTime;
attribute float aSize;

varying float vAlpha;

void main() {
  float age = uTime - aBirthTime;
  
  // Skip dead particles
  if (age < 0.0 || age > aLifetime) {
    gl_Position = vec4(0.0, 0.0, 0.0, -1.0); // Clip
    vAlpha = 0.0;
    return;
  }
  
  // Simple physics: position + velocity * time + gravity
  vec3 pos = position + aVelocity * age;
  pos.y += -0.5 * age * age; // Simple gravity
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  // Fade based on lifetime
  float lifeRatio = age / aLifetime;
  vAlpha = 1.0 - lifeRatio;
  
  // Size
  gl_PointSize = aSize * uPixelRatio;
  gl_PointSize *= (1.0 / -mvPosition.z);
}
`;

// Stable RNG helpers
const seeded = (i, salt = 1) => {
  const x = Math.sin((i + 1) * 12.9898 * (salt + 1)) * 43758.5453;
  return x - Math.floor(x);
};

export default forwardRef(function MagicMushrooms(
  { visible = true, ...props },
  ref
) {
  const { scene } = useGLTF(MUSHROOM_GLB);
  const { gl, clock } = useThree();

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
        bottomColor: { value: "#ffa22b", label: "Bottom" },
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
  // Fireflies controls
  // =========================
  const fireflyCtl = useControls({
    Fireflies: folder(
      {
        enabled: { value: true, label: "Enabled" },
        burstCount: {
          value: 30,
          min: 10,
          max: 100,
          step: 1,
          label: "Particles per Burst",
        },
        pointSize: {
          value: 6,
          min: 1,
          max: 8,
          step: 0.5,
          label: "Point Size (px)",
        },
        lifetime: {
          value: 1.0,
          min: 1.0,
          max: 8.0,
          step: 0.1,
          label: "Lifetime (seconds)",
        },
        upwardSpeed: {
          value: 0.5,
          min: 0.05,
          max: 0.5,
          step: 0.01,
          label: "Upward Speed",
        },
        lateralSpread: {
          value: 0.3,
          min: 0.01,
          max: 0.3,
          step: 0.005,
          label: "Lateral Spread",
        },
        color: { value: "#ffc353ff", label: "Color" },
      },
      { collapsed: false }
    ),
  });

  // =========================
  // Interaction (Click → Squeeze + Fireflies)
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
          // Clear all fireflies
          activeParticles.current = [];
          if (fireflyGeometry.current) {
            updateFireflyGeometry();
          }
          matricesDirtyRef.current = true;
        }),
      },
      { collapsed: false }
    ),
  });

  const currentSqueeze = useRef(new Float32Array(INSTANCES.length).fill(0));
  const targetSqueeze = useRef(new Float32Array(INSTANCES.length).fill(0));
  const holdTimers = useRef(Array(INSTANCES.length).fill(0));
  const matricesDirtyRef = useRef(true);

  // =========================
  // Firefly burst system
  // =========================
  const activeParticles = useRef([]);
  const fireflyGeometry = useRef(null);
  const fireflyMaterial = useRef(null);
  const maxParticles = 500; // Pool size

  // Click handler
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

    // Emit fireflies
    if (fireflyCtl.enabled) {
      emitFireflies(INSTANCES[id].position);
    }

    matricesDirtyRef.current = true;
  };

  // Emit fireflies from a position
  const emitFireflies = (position) => {
    const currentTime = clock.getElapsedTime();
    const burstCount = fireflyCtl.burstCount;

    for (let i = 0; i < burstCount; i++) {
      // Start at mushroom center with tiny random offset
      const x = position[0] + (Math.random() - 0.5) * 0.02;
      const z = position[2] + (Math.random() - 0.5) * 0.02;
      const y = position[1] + 0.05; // Slightly above mushroom

      // Velocities: ONLY positive Y (upward), small lateral drift
      const vx = (Math.random() - 0.5) * fireflyCtl.lateralSpread * 0.5; // Gentle side drift
      const vz = (Math.random() - 0.5) * fireflyCtl.lateralSpread * 0.5; // Gentle side drift
      const vy = fireflyCtl.upwardSpeed + Math.random() * 0.05; // GUARANTEED positive upward

      // Random lifetime and fade timing
      const lifetime = fireflyCtl.lifetime * (0.7 + Math.random() * 0.6);
      const fadeStart = lifetime * (0.4 + Math.random() * 0.3);

      // Tiny size
      const size = fireflyCtl.pointSize * (0.8 + Math.random() * 0.4);

      activeParticles.current.push({
        position: [x, y, z],
        velocity: [vx, vy, vz], // vy is ALWAYS positive
        birthTime: currentTime,
        lifetime: lifetime,
        fadeStart: fadeStart,
        size: size,
      });
    }

    // Limit total particles
    if (activeParticles.current.length > maxParticles) {
      activeParticles.current = activeParticles.current.slice(-maxParticles);
    }

    updateFireflyGeometry();
  };

  // Update geometry with active particles
  const updateFireflyGeometry = () => {
    if (!fireflyGeometry.current || !fireflyMaterial.current) return;

    const count = activeParticles.current.length;
    if (count === 0) {
      // Hide all particles
      const positions = new Float32Array(maxParticles * 3);
      const velocities = new Float32Array(maxParticles * 3);
      const birthTimes = new Float32Array(maxParticles);
      const lifetimes = new Float32Array(maxParticles);
      const fadeStarts = new Float32Array(maxParticles);
      const sizes = new Float32Array(maxParticles);

      fireflyGeometry.current.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      fireflyGeometry.current.setAttribute(
        "aVelocity",
        new THREE.BufferAttribute(velocities, 3)
      );
      fireflyGeometry.current.setAttribute(
        "aBirthTime",
        new THREE.BufferAttribute(birthTimes, 1)
      );
      fireflyGeometry.current.setAttribute(
        "aLifetime",
        new THREE.BufferAttribute(lifetimes, 1)
      );
      fireflyGeometry.current.setAttribute(
        "aFadeStart",
        new THREE.BufferAttribute(fadeStarts, 1)
      );
      fireflyGeometry.current.setAttribute(
        "aSize",
        new THREE.BufferAttribute(sizes, 1)
      );
      fireflyGeometry.current.setDrawRange(0, 0);
      return;
    }

    const positions = new Float32Array(maxParticles * 3);
    const velocities = new Float32Array(maxParticles * 3);
    const birthTimes = new Float32Array(maxParticles);
    const lifetimes = new Float32Array(maxParticles);
    const fadeStarts = new Float32Array(maxParticles);
    const sizes = new Float32Array(maxParticles);

    for (let i = 0; i < count && i < maxParticles; i++) {
      const p = activeParticles.current[i];

      positions[i * 3] = p.position[0];
      positions[i * 3 + 1] = p.position[1];
      positions[i * 3 + 2] = p.position[2];

      velocities[i * 3] = p.velocity[0];
      velocities[i * 3 + 1] = p.velocity[1];
      velocities[i * 3 + 2] = p.velocity[2];

      birthTimes[i] = p.birthTime;
      lifetimes[i] = p.lifetime;
      fadeStarts[i] = p.fadeStart;
      sizes[i] = p.size;
    }

    fireflyGeometry.current.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    fireflyGeometry.current.setAttribute(
      "aVelocity",
      new THREE.BufferAttribute(velocities, 3)
    );
    fireflyGeometry.current.setAttribute(
      "aBirthTime",
      new THREE.BufferAttribute(birthTimes, 1)
    );
    fireflyGeometry.current.setAttribute(
      "aLifetime",
      new THREE.BufferAttribute(lifetimes, 1)
    );
    fireflyGeometry.current.setAttribute(
      "aFadeStart",
      new THREE.BufferAttribute(fadeStarts, 1)
    );
    fireflyGeometry.current.setAttribute(
      "aSize",
      new THREE.BufferAttribute(sizes, 1)
    );
    fireflyGeometry.current.setDrawRange(0, Math.min(count, maxParticles));
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

  // Track if shaders have been patched to avoid duplicate updates
  const shadersPatchedRef = useRef(false);

  // =========================
  // Initialize firefly system
  // =========================
  useEffect(() => {
    if (!fireflyCtl.enabled) return;

    // Clean up old resources
    if (fireflyGeometry.current) {
      fireflyGeometry.current.dispose();
    }
    if (fireflyMaterial.current) {
      fireflyMaterial.current.dispose();
    }

    // Create geometry
    fireflyGeometry.current = new THREE.BufferGeometry();

    // Create material
    const pixelRatio = Math.min(gl.getPixelRatio ? gl.getPixelRatio() : 1, 2);
    fireflyMaterial.current = new THREE.ShaderMaterial({
      vertexShader: firefliesVertexShader,
      fragmentShader: firefliesFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        uPixelRatio: { value: pixelRatio },
        uSize: { value: fireflyCtl.pointSize },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(fireflyCtl.color) },
      },
    });

    // Initialize with empty geometry
    updateFireflyGeometry();

    return () => {
      if (fireflyGeometry.current) {
        fireflyGeometry.current.dispose();
        fireflyGeometry.current = null;
      }
      if (fireflyMaterial.current) {
        fireflyMaterial.current.dispose();
        fireflyMaterial.current = null;
      }
    };
  }, [fireflyCtl.enabled, gl]);

  // Update firefly material uniforms
  useEffect(() => {
    if (!fireflyMaterial.current) return;
    const pixelRatio = Math.min(gl.getPixelRatio ? gl.getPixelRatio() : 1, 2);
    fireflyMaterial.current.uniforms.uPixelRatio.value = pixelRatio;
    fireflyMaterial.current.uniforms.uSize.value = fireflyCtl.pointSize;
    fireflyMaterial.current.uniforms.uColor.value.set(fireflyCtl.color);
  }, [gl, fireflyCtl.pointSize, fireflyCtl.color]);

  // =========================
  // Shader patch: dissolve + two-color height gradient (global mid/soft)
  // =========================
  useEffect(() => {
    if (!sources.length) return;

    let patchedAny = false;
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

          // Ensure worldPos varyings exist
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

          // Compute world position (instancing-safe)
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

          // Uniforms with current control values
          shader.uniforms.uProgress = { value: progressRef.current };
          shader.uniforms.uEdgeWidth = { value: dissolveCtl.edgeWidth };
          shader.uniforms.uNoiseScale = { value: dissolveCtl.noiseScale };
          shader.uniforms.uNoiseAmp = { value: dissolveCtl.noiseAmp };
          shader.uniforms.uGlowStrength = { value: dissolveCtl.glowStrength };
          shader.uniforms.uSeed = { value: dissolveCtl.seed };

          // Global gradient with current values
          shader.uniforms.uBottomColor = {
            value: new THREE.Color(gradCtl.bottomColor),
          };
          shader.uniforms.uTopColor = {
            value: new THREE.Color(gradCtl.topColor),
          };
          shader.uniforms.uMid = { value: gradCtl.height };
          shader.uniforms.uSoft = { value: gradCtl.soft };
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
        patchedAny = true;
      });
    });

    if (patchedAny) {
      shadersPatchedRef.current = true;
    }
  }, [
    sources,
    dissolveCtl.edgeWidth,
    dissolveCtl.noiseScale,
    dissolveCtl.noiseAmp,
    dissolveCtl.glowStrength,
    dissolveCtl.seed,
    gradCtl.bottomColor,
    gradCtl.topColor,
    gradCtl.height,
    gradCtl.soft,
    gradCtl.intensity,
  ]);

  // =========================
  // Live uniform updates
  // =========================
  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uEdgeWidth", dissolveCtl.edgeWidth);
  }, [dissolveCtl.edgeWidth]);

  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uNoiseScale", dissolveCtl.noiseScale);
  }, [dissolveCtl.noiseScale]);

  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uNoiseAmp", dissolveCtl.noiseAmp);
  }, [dissolveCtl.noiseAmp]);

  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uGlowStrength", dissolveCtl.glowStrength);
  }, [dissolveCtl.glowStrength]);

  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uSeed", dissolveCtl.seed);
  }, [dissolveCtl.seed]);

  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uBottomColor", new THREE.Color(gradCtl.bottomColor));
  }, [gradCtl.bottomColor]);

  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uTopColor", new THREE.Color(gradCtl.topColor));
  }, [gradCtl.topColor]);

  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uMid", gradCtl.height);
  }, [gradCtl.height]);

  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uSoft", gradCtl.soft);
  }, [gradCtl.soft]);

  useEffect(() => {
    if (!shadersPatchedRef.current) return;
    updateUniformAll("uGradIntensity", gradCtl.intensity);
  }, [gradCtl.intensity]);

  // =========================
  // Dissolve animation
  // =========================
  useFrame((_, dt) => {
    // External visibility forces hidden unless user explicitly builds while visible
    const wantBuilt = visible && dissolveCtl.build;
    const target = wantBuilt ? 1.1 : -0.2;
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
  }, [sources, INSTANCES]);

  // =========================
  // Animate squeeze + update matrices + cull dead fireflies
  // =========================
  const tmpObj = useRef(new THREE.Object3D());
  useFrame((_, dt) => {
    const N = INSTANCES.length;
    let anyChanged = false;
    const currentTime = clock.getElapsedTime();

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

    // Cull dead fireflies (performance optimization)
    const initialCount = activeParticles.current.length;
    if (initialCount > 0) {
      activeParticles.current = activeParticles.current.filter((p) => {
        const age = currentTime - p.birthTime;
        return age >= 0 && age <= p.lifetime;
      });

      // Update geometry if particles were removed
      if (activeParticles.current.length !== initialCount) {
        updateFireflyGeometry();
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

    // Update firefly time uniform
    if (fireflyMaterial.current) {
      fireflyMaterial.current.uniforms.uTime.value = currentTime;
    }
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
      userData={{ noDistanceFade: true }}
      {...props}
    >
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

      {/* Single firefly points system */}
      {fireflyCtl.enabled &&
        fireflyGeometry.current &&
        fireflyMaterial.current && (
          <points
            geometry={fireflyGeometry.current}
            material={fireflyMaterial.current}
            frustumCulled={false}
          />
        )}
    </group>
  );
});

useGLTF.preload(MUSHROOM_GLB);
