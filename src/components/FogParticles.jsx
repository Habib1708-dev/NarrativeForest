// src/components/FogParticles.jsx
import { useMemo, useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture, Billboard } from "@react-three/drei";
import { useControls } from "leva";
import * as THREE from "three";

/**
 * FogParticles — single-pass soft billboards with prepass depth.
 * Adds "smart occlusion" that attenuates particles where scene geometry is in front,
 * while preserving soft-particle edges and UFF-consistent fog fade.
 */
export default function FogParticles({
  count = 5,
  positions = null,
  occluders = [],
  fogParams,
}) {
  // Look controls
  const {
    size,
    opacity,
    falloff,
    scaleFalloffWithSize,
    rotationSpeedZ,
    fogTint,
  } = useControls(
    "Fog Particles",
    {
      size: { value: 3, min: 0.1, max: 20, step: 0.1 },
      opacity: { value: 1, min: 0, max: 1, step: 0.01 },
      falloff: { value: 0.8, min: 0.01, max: 5, step: 0.01 },
      scaleFalloffWithSize: { value: true },
      rotationSpeedZ: { value: 0.05, min: -5, max: 5, step: 0.01 },
      fogTint: { value: "#c1c1c1" },
    },
    { collapsed: false }
  );

  // Smart occlusion controls
  const { occlusionThreshold, occlusionSoftness, fogBehindObjects } =
    useControls(
      "Smart Fog Occlusion",
      {
        occlusionThreshold: {
          value: 1.5,
          min: 0.05,
          max: 5.0,
          step: 0.05,
          label: "Occlusion Distance",
        },
        occlusionSoftness: {
          value: 2.0,
          min: 0.05,
          max: 5.0,
          step: 0.05,
          label: "Occlusion Softness",
        },
        fogBehindObjects: {
          value: 0.0,
          min: 0.0,
          max: 1.0,
          step: 0.01,
          label: "Fog Behind Objects",
        },
      },
      { collapsed: false }
    );

  // UFF params (defaults aligned to your Experience.jsx)
  const {
    color: fogColorHex = "#98a0a5",
    density = 1.96,
    extinction = 0.1,
    fogHeight = -12.7,
    fadeStart = 0.0,
    fadeEnd = 51.8,
    distFadeStart = 0.0,
    distFadeEnd = 92.0,
    lightDir: lightArr = [-0.5, 0.8, -0.4],
    lightIntensity = 0.0,
    anisotropy = 0.0,
  } = fogParams || {};

  const uFogColor = useMemo(() => new THREE.Color(fogColorHex), [fogColorHex]);
  const uLightDir = useMemo(
    () => new THREE.Vector3().fromArray(lightArr).normalize(),
    [lightArr]
  );

  // Texture & tint
  const tex = useTexture("/textures/fog/fog.png");
  const uTint = useMemo(() => new THREE.Color(fogTint), [fogTint]);

  const groupRef = useRef();
  const meshRefs = useRef([]);
  const billboardRefs = useRef([]);
  const angleRef = useRef(0);

  const { gl, size: viewport, camera, scene } = useThree();
  const dpr = gl.getPixelRatio ? gl.getPixelRatio() : 1;

  useEffect(() => {
    groupRef.current?.traverse?.((o) => o.layers.set(0));
  }, []);

  // Prepass camera & layer
  const depthCam = useMemo(() => new THREE.PerspectiveCamera(), []);
  const PREPASS_LAYER = 7;

  // ---- Render target + uniforms (RESIZE-SAFE) ----
  const [rt, setRt] = useState(null);
  const uResolution = useRef(new THREE.Vector2(1, 1));
  const uDepthTex = useRef({ value: null });

  useEffect(() => {
    const w = Math.max(1, Math.floor(viewport.width * dpr));
    const h = Math.max(1, Math.floor(viewport.height * dpr));

    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = gl.capabilities.isWebGL2
      ? THREE.UnsignedIntType
      : THREE.UnsignedShortType;
    depthTexture.format = THREE.DepthFormat;

    const target = new THREE.WebGLRenderTarget(w, h, {
      depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.minFilter = THREE.LinearFilter;
    target.texture.magFilter = THREE.LinearFilter;
    target.texture.generateMipmaps = false;

    uResolution.current.set(w, h);
    uDepthTex.current.value = depthTexture;

    setRt(target);

    return () => {
      target.dispose();
      depthTexture.dispose?.();
      if (uDepthTex.current.value === depthTexture) {
        uDepthTex.current.value = null;
      }
    };
  }, [gl, viewport.width, viewport.height, dpr]);

  // Depth-only materials for prepass
  const depthMatOpaque = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    m.blending = THREE.NoBlending;
    m.depthWrite = true;
    m.depthTest = true;
    return m;
  }, []);

  const cutoutDepthCache = useRef(new Map());
  const getCutoutDepthMat = (srcMat) => {
    if (!srcMat) return depthMatOpaque;
    let cached = cutoutDepthCache.current.get(srcMat.uuid);
    if (cached) return cached;

    const dm = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: srcMat.map || null,
      alphaMap: srcMat.alphaMap || null,
    });
    // Do NOT set dm.skinning / dm.morphTargets; Three handles this automatically.
    dm.alphaTest = srcMat.alphaTest ?? 0.0;
    dm.side = srcMat.side ?? THREE.FrontSide;
    dm.transparent = false;
    dm.depthWrite = true;
    dm.depthTest = true;
    dm.blending = THREE.NoBlending;

    cutoutDepthCache.current.set(srcMat.uuid, dm);
    return dm;
  };

  // Texture setup
  useEffect(() => {
    if (!tex) return;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace; // linearize in shader
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy?.() ?? 1);
    tex.needsUpdate = true;
  }, [tex, gl]);

  // Helpers (layers)
  const getObject = (o) => (o && o.isObject3D ? o : o?.current || null);
  const setSubtreeToLayer = (root, layer, stash) => {
    root.traverse((node) => {
      stash.push([node, node.layers.mask]);
      node.layers.set(layer);
    });
  };
  const restoreLayers = (stash) => {
    for (let i = 0; i < stash.length; i++) {
      const [node, mask] = stash[i];
      node.layers.mask = mask;
    }
    stash.length = 0;
  };

  const isCutoutMesh = (node) => {
    if (!node?.isMesh) return false;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of mats) {
      if (!m) continue;
      if (
        (typeof m.alphaTest === "number" && m.alphaTest > 0.0) ||
        m.alphaMap
      ) {
        return true;
      }
    }
    return false;
  };

  // Prepass + rotation
  useFrame((_, dt) => {
    if (rt) {
      const occ = [];
      for (let i = 0; i < occluders.length; i++) {
        const obj = getObject(occluders[i]);
        if (obj) occ.push(obj);
      }

      // Mirror world camera
      depthCam.position.copy(camera.position);
      depthCam.quaternion.copy(camera.quaternion);
      depthCam.fov = camera.fov;
      depthCam.aspect = camera.aspect;
      depthCam.near = camera.near;
      depthCam.far = camera.far;
      depthCam.updateProjectionMatrix();
      depthCam.layers.set(PREPASS_LAYER);

      const prevOverride = scene.overrideMaterial;
      const prevTarget = gl.getRenderTarget();
      const layerStash = [];

      try {
        for (let i = 0; i < occ.length; i++)
          setSubtreeToLayer(occ[i], PREPASS_LAYER, layerStash);

        // Hide cutouts for the opaque depth pass
        const cutoutMeshes = [];
        for (let i = 0; i < occ.length; i++) {
          occ[i].traverse((node) => {
            if (isCutoutMesh(node)) cutoutMeshes.push(node);
          });
        }

        const visStash = [];
        for (const n of cutoutMeshes) {
          visStash.push([n, n.visible]);
          n.visible = false;
        }
        scene.overrideMaterial = depthMatOpaque;
        gl.setRenderTarget(rt);
        gl.clear(true, true, true);
        gl.render(scene, depthCam);
        for (const [n, v] of visStash) n.visible = v;

        // Cutout pass with depth-only mats
        scene.overrideMaterial = null;
        const matSwapStash = [];
        for (const n of cutoutMeshes) {
          const srcMats = Array.isArray(n.material) ? n.material : [n.material];
          const newMats = srcMats.map((m) => getCutoutDepthMat(m));
          matSwapStash.push([n, n.material]);
          n.material = Array.isArray(n.material) ? newMats : newMats[0];
        }
        gl.render(scene, depthCam);
        for (const [n, orig] of matSwapStash) n.material = orig;
      } finally {
        restoreLayers(layerStash);
        gl.setRenderTarget(prevTarget || null);
        scene.overrideMaterial = prevOverride || null;
      }
    }

    // rotation
    angleRef.current += rotationSpeedZ * dt;
    const angle = angleRef.current;
    meshRefs.current.forEach((m) => m && (m.rotation.z = angle));
  }, -2);

  // Instance positions
  const offsets = useMemo(() => {
    const rnd = (s) => {
      const x = Math.sin(s * 12.9898) * 43758.5453;
      return (x - Math.floor(x)) * 2 - 1;
    };
    return new Array(count).fill(0).map((_, i) => {
      const ox = rnd(i + 0.13) * 1.2;
      const oy = rnd(i + 1.37) * 0.6;
      const oz = rnd(i + 2.71) * 1.2;
      const scaleJitter = 1 + rnd(i + 3.33) * 0.25;
      return { position: [ox, oy, oz], scaleJitter };
    });
  }, [count]);

  const instances = useMemo(() => {
    if (positions && positions.length > 0) {
      return positions.map((p) => ({ position: p, scaleJitter: 1 }));
    }
    return offsets;
  }, [positions, offsets]);

  // === Shaders (world pos, soft particles, UFF fog, smart occlusion) ===
  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;

  const fragmentShader = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    varying vec3 vWorldPos;

    uniform sampler2D map;
    uniform sampler2D depthTex;
    uniform vec2 resolution;
    uniform float opacity;
    uniform float near;
    uniform float far;
    uniform float falloff;
    uniform float sizeFactor;
    uniform vec3 uTint;

    // Smart occlusion params
    uniform float occlusionThreshold; // world-depth delta where occlusion begins
    uniform float occlusionSoftness;  // smooth ramp width
    uniform float fogBehindObjects;   // residual visibility when occluded [0..1]

    // UFF fog uniforms
    uniform vec3  uFogColor;
    uniform float uDensity;
    uniform float uExtinction;
    uniform float uFogHeight;
    uniform float uFadeStart;
    uniform float uFadeEnd;
    uniform float uDistFadeStart;
    uniform float uDistFadeEnd;
    uniform vec3  uLightDir;
    uniform float uLightIntensity;
    uniform float uAnisotropy;

    float linearizeDepth(float z01) {
      float z = z01 * 2.0 - 1.0; // NDC
      return (2.0 * near * far) / (far + near - z * (far - near));
    }

    float henyeyGreenstein(float mu, float g){
      float g2 = g*g;
      float denom = pow(1.0 + g2 - 2.0*g*mu, 1.5);
      return (1.0 - g2) / (4.0 * 3.141592653589793 * denom);
    }

    void evalFog(in vec3 fragWorld, in vec3 camPos, out float fogFactor, out vec3 fogCol){
      vec3  V = fragWorld - camPos;
      float d = length(V);

      float yRel = fragWorld.y - uFogHeight;
      float heightMask = 1.0 - smoothstep(uFadeStart, uFadeEnd, yRel);
      heightMask = clamp(heightMask, 0.0, 1.0);

      float sigma = max(1e-6, uExtinction * uDensity);
      float trans = exp(-sigma * d);

      float df = smoothstep(uDistFadeStart, uDistFadeEnd, d);
      trans = mix(trans, 0.0, df);

      fogFactor = (1.0 - trans) * heightMask;

      vec3 viewDir = normalize(V);
      float mu   = dot(viewDir, -normalize(uLightDir));
      float phase = henyeyGreenstein(mu, clamp(uAnisotropy, -0.9, 0.9));
      fogCol = uFogColor * mix(1.0, (0.4 + 1.6*phase), uLightIntensity);
    }

    void main() {
      vec4 texel = texture2D(map, vUv);
      if (texel.a <= 0.001) discard;

      // linearize sRGB texture (ShaderMaterial doesn't do it)
      vec3 texL = pow(texel.rgb, vec3(2.2));

      // Soft particles against scene prepass
      vec2 screenUV = gl_FragCoord.xy / resolution;
      float sceneZ01    = texture2D(depthTex, screenUV).x;
      float particleZ01 = gl_FragCoord.z;

      float sceneLin    = linearizeDepth(sceneZ01);
      float particleLin = linearizeDepth(particleZ01);
      float delta       = sceneLin - particleLin; // <0: scene in front (occludes), >0: particle in front

      float eff  = max(1e-4, falloff * sizeFactor);
      float soft = clamp(smoothstep(0.0, eff, delta), 0.0, 1.0);

      // Smart occlusion: attenuate when scene is in front by a margin
      // We measure "how much closer the scene is" as positive value:
      float closerAmt = max(0.0, particleLin - sceneLin); // >0 means scene is closer to camera
      float occAmt = smoothstep(occlusionThreshold, occlusionThreshold + occlusionSoftness, closerAmt);
      float occlusionFactor = mix(1.0, fogBehindObjects, occAmt);

      // Evaluate scene fog at particle position (for color & vanish-in-fog)
      float fogFactor; vec3 fogCol;
      evalFog(vWorldPos, cameraPosition, fogFactor, fogCol);

      // Color towards scene fog as fog gets dense; alpha also vanishes with fog
      vec3 baseCol = texL * uTint;
      vec3 outCol  = mix(baseCol, fogCol, fogFactor);
      float alpha  = texel.a * opacity * soft * occlusionFactor * (1.0 - fogFactor);

      gl_FragColor = vec4(outCol * alpha, alpha); // premultiplied output
      if (gl_FragColor.a < 0.001) discard;
    }
  `;

  const fallback = !rt;

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {instances.map(({ position, scaleJitter }, i) => {
        const s = scaleFalloffWithSize ? size * scaleJitter : size;
        const pos = [position[0], position[1], position[2]];

        if (fallback) {
          // Minimal fallback (no prepass soft), still premultiplied
          return (
            <Billboard
              key={i}
              position={pos}
              follow
              ref={(el) => (billboardRefs.current[i] = el)}
            >
              <mesh scale={[s, s, 1]} ref={(el) => (meshRefs.current[i] = el)}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial
                  map={tex}
                  color={uTint}
                  transparent
                  premultipliedAlpha
                  depthTest
                  depthWrite={false}
                  opacity={opacity}
                />
              </mesh>
            </Billboard>
          );
        }

        return (
          <Billboard
            key={i}
            position={pos}
            follow
            ref={(el) => (billboardRefs.current[i] = el)}
          >
            <mesh scale={[s, s, 1]} ref={(el) => (meshRefs.current[i] = el)}>
              <planeGeometry args={[1, 1]} />
              <shaderMaterial
                transparent
                depthWrite={false}
                depthTest
                blending={THREE.NormalBlending}
                premultipliedAlpha
                toneMapped
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                  map: { value: tex },
                  depthTex: uDepthTex.current,
                  resolution: { value: uResolution.current },
                  opacity: { value: opacity },
                  near: { value: camera.near },
                  far: { value: camera.far },
                  falloff: { value: falloff },
                  sizeFactor: { value: scaleFalloffWithSize ? s : 1.0 },
                  uTint: { value: uTint },

                  // Smart occlusion uniforms
                  occlusionThreshold: { value: occlusionThreshold },
                  occlusionSoftness: { value: occlusionSoftness },
                  fogBehindObjects: { value: fogBehindObjects },

                  // UFF fog (match UnifiedForwardFog)
                  uFogColor: { value: uFogColor },
                  uDensity: { value: density },
                  uExtinction: { value: extinction },
                  uFogHeight: { value: fogHeight },
                  uFadeStart: { value: fadeStart },
                  uFadeEnd: { value: fadeEnd },
                  uDistFadeStart: { value: distFadeStart },
                  uDistFadeEnd: { value: distFadeEnd },
                  uLightDir: { value: uLightDir },
                  uLightIntensity: { value: lightIntensity },
                  uAnisotropy: { value: anisotropy },
                }}
              />
            </mesh>
          </Billboard>
        );
      })}
    </group>
  );
}
