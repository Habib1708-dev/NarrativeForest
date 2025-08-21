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
export default function FogParticles({ count = 5, occluder = null }) {
  // Controls
  const { x, y, z, size, opacity, falloff, scaleFalloffWithSize } = useControls(
    "Fog Particles",
    {
      Position: folder(
        {
          x: { value: -2, min: -50, max: 50, step: 0.1 },
          y: { value: -5, min: -50, max: 50, step: 0.1 },
          z: { value: -2, min: -50, max: 50, step: 0.1 },
        },
        { collapsed: false }
      ),
      size: { value: 2.5, min: 0.1, max: 20, step: 0.1 },
      opacity: { value: 0.25, min: 0.0, max: 1.0, step: 0.01 },
      falloff: { value: 0.8, min: 0.01, max: 5.0, step: 0.01 },
      scaleFalloffWithSize: { value: true },
    },
    { collapsed: false }
  );

  const tex = useTexture("/textures/fog/fog.png");
  const groupRef = useRef();
  const { gl, size: viewport, camera } = useThree();

  // Depth prepass setup
  const [rt, setRt] = useState(null);
  const depthScene = useMemo(() => new THREE.Scene(), []);
  const depthMat = useMemo(
    () => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
    []
  );
  const depthMeshRef = useRef(null);
  if (!depthMeshRef.current)
    depthMeshRef.current = new THREE.Mesh(undefined, depthMat);
  // Ensure only our mesh is in the depth scene
  useEffect(() => {
    depthScene.clear();
    depthScene.add(depthMeshRef.current);
  }, [depthScene]);

  // Create render target with depth texture
  useEffect(() => {
    const depthTexture = new THREE.DepthTexture(
      viewport.width,
      viewport.height
    );
    depthTexture.type = gl.capabilities.isWebGL2
      ? THREE.UnsignedIntType
      : THREE.UnsignedShortType;
    depthTexture.format = THREE.DepthFormat;
    const target = new THREE.WebGLRenderTarget(
      viewport.width,
      viewport.height,
      {
        depthTexture,
        depthBuffer: true,
        stencilBuffer: false,
      }
    );
    target.texture.minFilter = THREE.LinearFilter;
    target.texture.magFilter = THREE.LinearFilter;
    target.texture.generateMipmaps = false;
    setRt(target);
    return () => {
      target.dispose();
      depthTexture.dispose?.();
    };
  }, [gl, viewport.width, viewport.height]);

  // Keep RT size in sync with canvas size
  useEffect(() => {
    if (!rt) return;
    rt.setSize(viewport.width, viewport.height);
  }, [rt, viewport.width, viewport.height]);

  useEffect(() => {
    if (!tex) return;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy?.() ?? 1);
    tex.needsUpdate = true;
  }, [tex, gl]);

  // Update depth mesh to mirror occluder (e.g., Terrain)
  useFrame(() => {
    if (!occluder || !rt) return;
    const dm = depthMeshRef.current;
    if (!dm) return;
    // Mirror transform and geometry
    dm.geometry = occluder.geometry;
    dm.position.copy(occluder.position);
    dm.quaternion.copy(occluder.quaternion);
    dm.scale.copy(occluder.scale);
    dm.updateMatrixWorld();
    // Render into depth RT
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    gl.clearDepth();
    gl.clear(true, true, true);
    gl.render(depthScene, camera);
    gl.setRenderTarget(prevTarget);
  }, 0);

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

  // If depth RT missing or occluder not available yet, fallback to sprites
  const fallback = !rt || !occluder;

  return (
    <group ref={groupRef} position={[x, y, z]}>
      {offsets.map(({ position, scaleJitter }, i) => {
        const s = size * scaleJitter;
        if (fallback) {
          return (
            <sprite key={i} position={position} scale={[s, s, 1]}>
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
          <Billboard key={i} position={position} follow={true}>
            <mesh scale={[s, s, 1]}>
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
                  depthTex: { value: rt.depthTexture },
                  resolution: {
                    value: new THREE.Vector2(viewport.width, viewport.height),
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
