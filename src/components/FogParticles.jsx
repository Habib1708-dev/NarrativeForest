// src/components/FogParticles.jsx
import { useMemo, useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture, Billboard } from "@react-three/drei";
import { useControls, folder } from "leva";
import * as THREE from "three";

/**
 * FogParticles
 * - Simple billboarded fog sprites using a soft fog texture.
 * - Leva controls: position (x,y,z), size, opacity.
 * - Default: 5 particles, group positioned at (-2, -5, -2).
 */
export default function FogParticles({
  count = 5,
  occluder = null,
  positions = null,
}) {
  // Controls
  const { size, opacity, falloff, scaleFalloffWithSize, rotationSpeedZ } =
    useControls(
      "Fog Particles",
      {
        size: { value: 4, min: 0.1, max: 20, step: 0.1 },
        opacity: { value: 0.5, min: 0.0, max: 1.0, step: 0.01 },
        falloff: { value: 0.8, min: 0.01, max: 5.0, step: 0.01 },
        scaleFalloffWithSize: { value: true },
        rotationSpeedZ: { value: 0.05, min: -5, max: 5, step: 0.01 },
      },
      { collapsed: false }
    );

  // Drift controls removed: only z-axis rotation retained.

  const tex = useTexture("/textures/fog/fog.png");
  const groupRef = useRef();
  const meshRefs = useRef([]);
  const spriteRefs = useRef([]);
  const billboardRefs = useRef([]); // New: track billboard group
  const angleRef = useRef(0);
  const { gl, size: viewport, camera, scene } = useThree();
  const depthCam = useMemo(() => new THREE.PerspectiveCamera(), []);

  // Depth prepass setup (layer 4 scene render)
  const [rt, setRt] = useState(null);
  const depthMat = useMemo(() => {
    const m = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      skinning: true,
      morphTargets: true,
      morphNormals: true,
    });
    m.blending = THREE.NoBlending;
    return m;
  }, []);

  // Create render target with depth texture
  const dpr = gl.getPixelRatio ? gl.getPixelRatio() : 1;
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

  useEffect(() => {
    if (!tex) return;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy?.() ?? 1);
    tex.needsUpdate = true;
  }, [tex, gl]);

  // Combined depth prepass + rotation (drift removed)
  useFrame((state, dt) => {
    // --- depth prepass: only layer 4 (Terrain + Cabin + Man + Cat) ---
    if (rt) {
      depthCam.position.copy(camera.position);
      depthCam.quaternion.copy(camera.quaternion);
      depthCam.fov = camera.fov;
      depthCam.aspect = camera.aspect;
      depthCam.near = camera.near;
      depthCam.far = camera.far;
      depthCam.updateProjectionMatrix();

      depthCam.layers.disableAll?.();
      depthCam.layers.enable(4);

      const prevOverride = scene.overrideMaterial;
      const prevTarget = gl.getRenderTarget();
      const prevAutoClear = gl.autoClear;

      scene.overrideMaterial = depthMat;
      gl.autoClear = true;
      gl.setRenderTarget(rt);
      gl.clear(true, true, true);
      gl.render(scene, depthCam);
      gl.setRenderTarget(prevTarget);

      scene.overrideMaterial = prevOverride;
      gl.autoClear = prevAutoClear;
    }

    // --- rotation only ---
    angleRef.current += rotationSpeedZ * dt;
    const angle = angleRef.current;
    meshRefs.current.forEach((m) => m && (m.rotation.z = angle));
    spriteRefs.current.forEach(
      (s) => s?.material && (s.material.rotation = angle)
    );
  });

  // Stable small offsets so all sprites aren't perfectly overlapping
  const offsets = useMemo(() => {
    const rnd = (s) => {
      const x = Math.sin(s * 12.9898) * 43758.5453;
      return (x - Math.floor(x)) * 2 - 1; // [-1,1]
    };
    return new Array(count).fill(0).map((_, i) => {
      const ox = rnd(i + 0.13) * 1.2;
      const oy = rnd(i + 1.37) * 0.6;
      const oz = rnd(i + 2.71) * 1.2;
      const scaleJitter = 1 + rnd(i + 3.33) * 0.25; // +/-25%
      return { position: [ox, oy, oz], scaleJitter };
    });
  }, [count]);

  // Use provided absolute positions if given; otherwise fall back to local offsets around [x,y,z]
  const instances = useMemo(() => {
    if (positions && positions.length > 0) {
      // Ignore local offsets; 1:1 mapping to provided positions
      return positions.map((p, i) => ({ position: p, scaleJitter: 1 }));
    }
    return offsets;
  }, [positions, offsets]);

  // Drift/motion seeds removed.

  // (Removed separate rotation+drift useFrame; merged above)

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

    float linearizeDepth(float z) {
      // z is depth buffer value in [0,1]
      return (2.0 * near * far) / (far + near - z * (far - near));
    }

    void main() {
      vec4 c = texture2D(map, vUv);
      if (c.a <= 0.001) discard;

      // Screen-space UV for sampling scene depth
      vec2 screenUV = gl_FragCoord.xy / resolution;
      float sceneZ = texture2D(depthTex, screenUV).x; // non-linear
      float particleZ = gl_FragCoord.z;

      float sceneLin = linearizeDepth(sceneZ);
      float particleLin = linearizeDepth(particleZ);
      float delta = sceneLin - particleLin; // >0 when scene is behind particle

      // Effective falloff scaled by particle size if requested
      float eff = max(1e-4, falloff * sizeFactor);
      float soft = clamp(smoothstep(0.0, eff, delta), 0.0, 1.0);

      gl_FragColor = vec4(c.rgb, c.a * opacity * soft);
      if (gl_FragColor.a < 0.001) discard;
    }
  `;

  // If depth RT missing, fallback to sprites
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
                color={0xffffff}
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
                }}
              />
            </mesh>
          </Billboard>
        );
      })}
    </group>
  );
}
