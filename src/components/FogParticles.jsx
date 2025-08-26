import { useMemo, useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture, Billboard } from "@react-three/drei";
import { useControls } from "leva";
import * as THREE from "three";

/**
 * FogParticles — soft-particle billboards with a two-pass depth prepass.
 * Resize-safe: uniforms are stable objects; we only update their .value.
 */
export default function FogParticles({
  count = 5,
  positions = null,
  occluders = [],
}) {
  // Controls
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
      opacity: { value: 1, min: 0.0, max: 1.0, step: 0.01 },
      falloff: { value: 0.8, min: 0.01, max: 5.0, step: 0.01 },
      scaleFalloffWithSize: { value: true },
      rotationSpeedZ: { value: 0.05, min: -5, max: 5, step: 0.01 },
      fogTint: { value: "#c1c1c1ff" },
    },
    { collapsed: false }
  );

  const tex = useTexture("/textures/fog/fog.png");
  const fogColor = useMemo(() => new THREE.Color(fogTint), [fogTint]);

  const groupRef = useRef();
  const meshRefs = useRef([]);
  const spriteRefs = useRef([]);
  const billboardRefs = useRef([]);
  const angleRef = useRef(0);

  const { gl, size: viewport, camera, scene } = useThree();
  const dpr = gl.getPixelRatio ? gl.getPixelRatio() : 1;

  // Keep fog particles on layer 0 (not part of the prepass)
  useEffect(() => {
    groupRef.current?.traverse?.((o) => o.layers.set(0));
  }, []);

  // Prepass camera
  const depthCam = useMemo(() => new THREE.PerspectiveCamera(), []);
  const PREPASS_LAYER = 7;

  // ---- Render target + uniforms (RESIZE-SAFE) ----
  const [rt, setRt] = useState(null);

  // Stable uniform objects; we mutate their .value on changes
  const uResolution = useRef(new THREE.Vector2(1, 1));
  const uDepthTex = useRef({ value: null });

  // Create / recreate RT when size or DPR changes
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

    // Point uniforms to the NEW resources
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

  // Depth material (opaque override)
  const depthMatOpaque = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    m.blending = THREE.NoBlending;
    m.depthWrite = true;
    m.depthTest = true;
    return m;
  }, []);

  // Cache of depth-only materials for alpha-cut meshes
  const cutoutDepthCache = useRef(new Map());
  const getCutoutDepthMat = (srcMat) => {
    if (!srcMat) return depthMatOpaque;
    let cached = cutoutDepthCache.current.get(srcMat.uuid);
    if (cached) return cached;

    // Create with supported options only
    const dm = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: srcMat.map || null,
      alphaMap: srcMat.alphaMap || null,
    });
    // Assign these as properties (constructor setValues would warn)
    dm.skinning = !!srcMat.skinning;
    dm.morphTargets = !!srcMat.morphTargets;
    // NOTE: MeshDepthMaterial has no morphNormals

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
    tex.colorSpace = THREE.SRGBColorSpace;
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

  // Prepass + billboard rotation
  useFrame((_, dt) => {
    if (rt) {
      // Collect occluders
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
        for (let i = 0; i < occ.length; i++) {
          setSubtreeToLayer(occ[i], PREPASS_LAYER, layerStash);
        }

        // Collect cutouts
        const cutoutMeshes = [];
        for (let i = 0; i < occ.length; i++) {
          occ[i].traverse((node) => {
            if (isCutoutMesh(node)) cutoutMeshes.push(node);
          });
        }

        // PASS 1: opaque (hide cutouts)
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

        // PASS 2: cutout (swap to depth-only mats)
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
        gl.setRenderTarget(prevTarget || null); // restore framebuffer
        scene.overrideMaterial = prevOverride || null;
      }
    }

    // rotation
    angleRef.current += rotationSpeedZ * dt;
    const angle = angleRef.current;
    meshRefs.current.forEach((m) => m && (m.rotation.z = angle));
    spriteRefs.current.forEach(
      (s) => s?.material && (s.material.rotation = angle)
    );
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

  // Shaders
  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D map;
    uniform sampler2D depthTex;
    uniform vec2 resolution;
    uniform float opacity;
    uniform float near;
    uniform float far;
    uniform float falloff;
    uniform float sizeFactor;
    uniform vec3 fogColor;

    // Convert [0..1] depth to linear eye space; z01 must be converted to NDC first.
    float linearizeDepth(float z01) {
      float z = z01 * 2.0 - 1.0; // NDC
      return (2.0 * near * far) / (far + near - z * (far - near));
    }

    void main() {
      vec4 c = texture2D(map, vUv);
      if (c.a <= 0.001) discard;

      vec2 screenUV = gl_FragCoord.xy / resolution;

      float sceneZ01    = texture2D(depthTex, screenUV).x;
      float particleZ01 = gl_FragCoord.z;

      float sceneLin    = linearizeDepth(sceneZ01);
      float particleLin = linearizeDepth(particleZ01);
      float delta       = sceneLin - particleLin;

      float eff  = max(1e-4, falloff * sizeFactor);
      float soft = clamp(smoothstep(0.0, eff, delta), 0.0, 1.0);

      vec3 tinted = c.rgb * fogColor;
      gl_FragColor = vec4(tinted, c.a * opacity * soft);
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
          return (
            <sprite
              key={i}
              position={pos}
              scale={[s, s, 1]}
              ref={(el) => (spriteRefs.current[i] = el)}
            >
              <spriteMaterial
                attach="material"
                map={tex}
                depthWrite={false}
                depthTest={true}
                transparent
                opacity={opacity}
                color={fogColor}
                blending={THREE.NormalBlending}
              />
            </sprite>
          );
        }

        return (
          <Billboard
            key={i}
            position={pos}
            follow={true}
            ref={(el) => (billboardRefs.current[i] = el)}
          >
            <mesh scale={[s, s, 1]} ref={(el) => (meshRefs.current[i] = el)}>
              <planeGeometry args={[1, 1, 1, 1]} />
              <shaderMaterial
                transparent
                depthWrite={false}
                depthTest={true}
                blending={THREE.NormalBlending}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                  map: { value: tex },
                  depthTex: uDepthTex.current, // stays valid; .value updates
                  resolution: { value: uResolution.current },
                  opacity: { value: opacity },
                  near: { value: camera.near },
                  far: { value: camera.far },
                  falloff: { value: falloff },
                  sizeFactor: { value: scaleFalloffWithSize ? s : 1.0 },
                  fogColor: { value: fogColor },
                }}
              />
            </mesh>
          </Billboard>
        );
      })}
    </group>
  );
}
