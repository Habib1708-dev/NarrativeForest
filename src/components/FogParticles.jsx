// src/components/FogParticles.jsx
import { useMemo, useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useTexture, useFBO } from "@react-three/drei";
import { useControls, folder } from "leva";
import * as THREE from "three";

export default function FogParticles({ count = 5 }) {
  const { x, y, z, size, opacity, softness, enabled } = useControls(
    "Fog Particles",
    {
      Position: folder({
        x: { value: -2, min: -50, max: 50, step: 0.1 },
        y: { value: -5, min: -50, max: 50, step: 0.1 },
        z: { value: -2, min: -50, max: 50, step: 0.1 },
      }),
      size: { value: 2.5, min: 0.2, max: 20, step: 0.1 },
      opacity: { value: 0.25, min: 0, max: 1, step: 0.01 },
      softness: { value: 0.8, min: 0.01, max: 5.0, step: 0.01 },
      enabled: { value: true },
    }
  );

  const groupRef = useRef();
  const meshRef = useRef();

  const map = useTexture("/textures/fog/fog.png");
  const { gl, camera, size: vpSize, scene } = useThree();
  const dpr = gl.getPixelRatio();

  useEffect(() => {
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.flipY = false;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy?.() ?? 1);
    map.needsUpdate = true;
  }, [map, gl]);

  // Depth FBO (correct signature)
  const depthFBO = useFBO(
    Math.round(vpSize.width * dpr),
    Math.round(vpSize.height * dpr),
    { depth: true, stencilBuffer: false, samples: 0, generateMipmaps: false }
  );

  // Offsets/rotations so the cards aren’t coplanar
  const OFFSETS = useMemo(() => {
    const r = (s) => ((Math.sin(s * 12.9898) * 43758.5453) % 1) * 2 - 1;
    return new Array(count).fill(0).map((_, i) => ({
      pos: new THREE.Vector3(
        r(i + 0.13) * 1.2,
        r(i + 1.37) * 0.6,
        r(i + 2.71) * 1.2
      ),
      rot: new THREE.Euler(
        r(i + 5.19) * 0.08,
        r(i + 7.77) * 1.4,
        r(i + 9.33) * 0.08
      ),
      scaleJitter: 1 + r(i + 3.33) * 0.25,
    }));
  }, [count]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: map },
          tDepth: { value: null },
          cameraNear: { value: camera.near },
          cameraFar: { value: camera.far },
          baseOpacity: { value: opacity },
          softness: { value: softness },
        },
        // ❌ Do NOT redeclare `attribute vec3 position;` or `attribute vec2 uv;`
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying float vViewZ;
          varying vec4 vClipPos;

          void main() {
            vUv = uv;

            // Build world matrix with instancing when present
            mat4 modelMat = modelMatrix;
            #ifdef USE_INSTANCING
              modelMat = modelMatrix * instanceMatrix;
            #endif

            vec4 worldPos = modelMat * vec4(position, 1.0);
            vec4 viewPos  = viewMatrix * worldPos;

            vViewZ = -viewPos.z;
            vClipPos = projectionMatrix * viewPos;
            gl_Position = vClipPos;
          }
        `,
        fragmentShader: /* glsl */ `
          #include <packing>
          precision highp float;

          uniform sampler2D map;
          uniform sampler2D tDepth;
          uniform float cameraNear;
          uniform float cameraFar;
          uniform float baseOpacity;
          uniform float softness;

          varying vec2 vUv;
          varying float vViewZ;
          varying vec4 vClipPos;

          float getViewZ(const in float depth) {
            return -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
          }

          void main() {
            vec4 tex = texture2D(map, vUv);
            float alpha = tex.a;

            vec2 ndc = vClipPos.xy / vClipPos.w;
            vec2 suv = ndc * 0.5 + 0.5;

            float sceneDepth = texture2D(tDepth, suv).x;
            float sceneViewZ = getViewZ(sceneDepth);

            float dz = sceneViewZ - vViewZ;
            float soft = smoothstep(0.0, softness, dz);

            alpha *= soft * baseOpacity;
            if (alpha <= 0.001) discard;

            gl_FragColor = vec4(tex.rgb, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [map, camera.near, camera.far, opacity, softness]
  );

  useEffect(() => {
    material.uniforms.baseOpacity.value = opacity;
    material.uniforms.softness.value = softness;
  }, [material, opacity, softness]);

  // Place instances around [x,y,z]
  useEffect(() => {
    const inst = meshRef.current;
    if (!inst) return;

    const base = new THREE.Vector3(x, y, z);
    const dummy = new THREE.Object3D();

    OFFSETS.forEach((o, i) => {
      dummy.position.copy(base).add(o.pos);
      dummy.rotation.copy(o.rot);
      const s = size * o.scaleJitter;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
  }, [x, y, z, size, OFFSETS]);

  // Depth prepass each frame (hide fog while capturing)
  useFrame(() => {
    if (!enabled) return;

    const g = groupRef.current;
    if (g) g.visible = false;

    gl.setRenderTarget(depthFBO);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);

    if (g) g.visible = true;

    material.uniforms.tDepth.value = depthFBO.depthTexture;
    material.uniforms.cameraNear.value = camera.near;
    material.uniforms.cameraFar.value = camera.far;
  });

  if (!enabled) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[geometry, material, count]} />
    </group>
  );
}
