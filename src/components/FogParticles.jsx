import { useMemo, useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture, Billboard } from "@react-three/drei";
import { useControls } from "leva";
import * as THREE from "three";

/**
 * FogParticles
 * - Billboarded fog sprites using a soft fog texture.
 * - Depth prepass renders ONLY the provided `occluders` into an offscreen RT depthTexture.
 * - Handles alpha-cutout foliage with a dedicated depth-only material (no real materials in prepass).
 */
export default function FogParticles({
  count = 5,
  positions = null,
  occluders = [], // Array of Object3D or React refs to Object3D
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

  // Standalone camera for the offscreen depth prepass
  const depthCam = useMemo(() => new THREE.PerspectiveCamera(), []);
  const PREPASS_LAYER = 7; // scratch layer used only inside the prepass

  // Depth prepass target
  const [rt, setRt] = useState(null);

  // Opaque override depth material
  const depthMatOpaque = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    m.blending = THREE.NoBlending;
    m.depthWrite = true;
    m.depthTest = true;
    return m;
  }, []);

  // Cache of depth-only materials for cutout meshes (keyed by source material UUID)
  const cutoutDepthCache = useRef(new Map());
  const getCutoutDepthMat = (srcMat) => {
    if (!srcMat) return depthMatOpaque;
    let cached = cutoutDepthCache.current.get(srcMat.uuid);
    if (cached) return cached;
    const dm = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: srcMat.map || null,
      alphaMap: srcMat.alphaMap || null,
      skinning: !!srcMat.skinning,
      morphTargets: !!srcMat.morphTargets,
      morphNormals: !!srcMat.morphNormals,
    });
    dm.alphaTest = srcMat.alphaTest ?? 0;
    dm.side = srcMat.side ?? THREE.FrontSide;
    dm.transparent = false;
    dm.depthWrite = true;
    dm.depthTest = true;
    dm.blending = THREE.NoBlending;
    cutoutDepthCache.current.set(srcMat.uuid, dm);
    return dm;
  };

  // Create render target with depth texture
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

    setRt(target);
    return () => {
      target.dispose();
      depthTexture.dispose?.();
    };
  }, [gl, viewport.width, viewport.height, dpr]);

  // Keep RT size in sync with canvas size
  useEffect(() => {
    if (!rt) return;
    rt.setSize(
      Math.max(1, Math.floor(viewport.width * dpr)),
      Math.max(1, Math.floor(viewport.height * dpr))
    );
  }, [rt, viewport.width, viewport.height, dpr]);

  // Texture setup
  useEffect(() => {
    if (!tex) return;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy?.() ?? 1);
    tex.needsUpdate = true;
  }, [tex, gl]);

  // Helpers to isolate occluders into a scratch layer and restore
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
    stash.length = 0; // clear
  };

  // Detect alpha-tested (cutout) meshes
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

  // Depth prepass (to RT) + rotation (run before your sky pass at -1)
  useFrame((state, dt) => {
    if (rt) {
      // Collect current occluder objects (ignore nulls)
      const occ = [];
      for (let i = 0; i < occluders.length; i++) {
        const obj = getObject(occluders[i]);
        if (obj) occ.push(obj);
      }

      // Mirror main cam
      depthCam.position.copy(camera.position);
      depthCam.quaternion.copy(camera.quaternion);
      depthCam.fov = camera.fov;
      depthCam.aspect = camera.aspect;
      depthCam.near = camera.near;
      depthCam.far = camera.far;
      depthCam.updateProjectionMatrix();

      // Prepass camera on scratch layer
      depthCam.layers.set(PREPASS_LAYER);

      // Save scene state
      const prevOverride = scene.overrideMaterial;
      const prevTarget = gl.getRenderTarget();
      const layerStash = [];

      try {
        // 0) Move occluders to prepass layer
        for (let i = 0; i < occ.length; i++) {
          setSubtreeToLayer(occ[i], PREPASS_LAYER, layerStash);
        }

        // 1) Collect cutout meshes
        const cutoutMeshes = [];
        for (let i = 0; i < occ.length; i++) {
          occ[i].traverse((node) => {
            if (isCutoutMesh(node)) cutoutMeshes.push(node);
          });
        }

        // 2) PASS OPAQUE — hide cutout so their quads never write depth
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

        // 3) PASS CUTOUT — swap materials for depth-only versions
        scene.overrideMaterial = null;
        const matSwapStash = [];
        for (const n of cutoutMeshes) {
          const srcMats = Array.isArray(n.material) ? n.material : [n.material];
          const newMats = srcMats.map((m) => getCutoutDepthMat(m));
          matSwapStash.push([n, n.material]);
          n.material = Array.isArray(n.material) ? newMats : newMats[0];
        }
        gl.render(scene, depthCam);
        // Restore original materials
        for (const [n, orig] of matSwapStash) n.material = orig;
      } finally {
        restoreLayers(layerStash);
        gl.setRenderTarget(prevTarget);
        scene.overrideMaterial = prevOverride;
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

  // Stable local offsets if positions aren’t passed
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

  // Soft-particle shader (billboarded quads)
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

    float linearizeDepth(float z) {
      return (2.0 * near * far) / (far + near - z * (far - near));
    }

    void main() {
      vec4 c = texture2D(map, vUv);
      if (c.a <= 0.001) discard;

      vec2 screenUV = gl_FragCoord.xy / resolution;
      float sceneZ = texture2D(depthTex, screenUV).x;
      float particleZ = gl_FragCoord.z;

      float sceneLin = linearizeDepth(sceneZ);
      float particleLin = linearizeDepth(particleZ);
      float delta = sceneLin - particleLin;

      float eff = max(1e-4, falloff * sizeFactor);
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
        const s = size * scaleJitter;
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
                key={`fogMat-${Math.floor(viewport.width * dpr)}x${Math.floor(
                  viewport.height * dpr
                )}`}
                transparent
                depthWrite={false}
                depthTest={true}
                blending={THREE.NormalBlending}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                  map: { value: tex },
                  depthTex: { value: rt.depthTexture },
                  resolution: {
                    value: new THREE.Vector2(
                      Math.floor(viewport.width * dpr),
                      Math.floor(viewport.height * dpr)
                    ),
                  },
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
