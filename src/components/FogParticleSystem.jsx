// src/components/FogParticleSystem.jsx
// Camera‑tethered ground fog: a world‑snapped cell with a small front cluster of soft billboards.
// Occlusion comes from the existing depth prepass that renders ONLY layer 4 (Terrain/Cabin/Man/Cat).
// Trees remain off layer 4 and won’t occlude.

import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { Billboard, useTexture } from "@react-three/drei";
import { useControls, folder } from "leva";

/**
 * Props
 * - terrainMesh: THREE.Mesh with BVH (computeBoundsTree/acceleratedRaycast already done) – for 1 raycast/frame.
 * - cellSize: world meters for the snapped fog cell (default 8).
 */
export default function FogParticleSystem({ terrainMesh, cellSize = 8 }) {
  const { gl, size: viewport, camera, scene } = useThree();
  const dpr = gl.getPixelRatio ? gl.getPixelRatio() : 1;

  // ===== Controls =====
  const {
    L, // cell size (overrides prop if changed)
    frontDepthScale, // fraction of L in front of cell center
    edgeOffsetScale, // lateral offset for side puffs (× L)
    puffCount, // 3 or 4
    size, // billboard size (meters)
    opacity,
    falloff,
    rotationSpeedZ,
    yOffset, // lift above ground after raycast
    groundFollowK, // smoothing factor for ground follow
    driftAmp,
    driftAmpY,
    driftSpeed,
    windX,
    windZ,
  } = useControls(
    "Fog Cell",
    {
      L: {
        value: cellSize,
        min: 2,
        max: 30,
        step: 0.5,
        label: "Cell Size (m)",
      },
      frontDepthScale: {
        value: 0.6,
        min: 0.1,
        max: 1.5,
        step: 0.01,
        label: "Front Depth ×L",
      },
      edgeOffsetScale: {
        value: 0.55,
        min: 0.1,
        max: 1.2,
        step: 0.01,
        label: "Edge Offset ×L",
      },
      puffCount: { value: 3, options: [3, 4], label: "Puffs" },
      Visual: folder({
        size: { value: 4, min: 0.5, max: 20, step: 0.1 },
        opacity: { value: 0.5, min: 0.0, max: 1.0, step: 0.01 },
        falloff: { value: 0.8, min: 0.01, max: 5.0, step: 0.01 },
        rotationSpeedZ: { value: 0.05, min: -5, max: 5, step: 0.01 },
      }),
      Ground: folder({
        yOffset: { value: 0.3, min: -1, max: 2, step: 0.01 },
        groundFollowK: {
          value: 8.0,
          min: 0.5,
          max: 20,
          step: 0.1,
          label: "Follow Speed",
        },
      }),
      Drift: folder({
        driftAmp: { value: 0.15, min: 0, max: 2, step: 0.01 },
        driftAmpY: { value: 0.05, min: 0, max: 1, step: 0.01 },
        driftSpeed: { value: 0.5, min: 0, max: 5, step: 0.01 },
        windX: { value: 0.0, min: -0.5, max: 0.5, step: 0.001 },
        windZ: { value: 0.0, min: -0.5, max: 0.5, step: 0.001 },
      }),
    },
    { collapsed: false }
  );

  // ===== Texture =====
  const tex = useTexture("/textures/fog/fog.png");
  useEffect(() => {
    if (!tex) return;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy?.() ?? 1);
    tex.needsUpdate = true;
  }, [tex, gl]);

  // ===== Depth prepass (layer 4 only) =====
  const depthCam = useMemo(() => new THREE.PerspectiveCamera(), []);
  const rtRef = useRef(null);

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
    rtRef.current = target;
    return () => {
      target.dispose();
      depthTexture.dispose?.();
    };
  }, [gl, viewport.width, viewport.height, dpr]);

  useEffect(() => {
    if (!rtRef.current) return;
    const w = Math.max(1, Math.floor(viewport.width * dpr));
    const h = Math.max(1, Math.floor(viewport.height * dpr));
    rtRef.current.setSize(w, h);
  }, [viewport.width, viewport.height, dpr]);

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

  // ===== Raycast for ground following (1 ray per frame) =====
  const ray = useMemo(() => {
    const r = new THREE.Raycaster();
    r.firstHitOnly = true;
    return r;
  }, []);
  const ceilYRef = useRef(20);
  const rayFarRef = useRef(100);
  const groundYRef = useRef(-4.8);

  useEffect(() => {
    if (!terrainMesh) return;
    const bb = new THREE.Box3().setFromObject(terrainMesh);
    ceilYRef.current = bb.max.y + 5;
    rayFarRef.current = Math.max(10, bb.max.y - bb.min.y + 20);
  }, [terrainMesh]);

  // ===== Puff instances (we manage exactly 4 and toggle visibility) =====
  const puffMeshes = [useRef(), useRef(), useRef(), useRef()];
  const billboards = [useRef(), useRef(), useRef(), useRef()];
  const angleRef = useRef(0);

  // ===== Shaders =====
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
      return (2.0 * near * far) / (far + near - z * (far - near));
    }

    void main() {
      vec4 c = texture2D(map, vUv);
      if (c.a <= 0.001) discard;

      vec2 screenUV = gl_FragCoord.xy * vec2(1.0 / resolution.x, 1.0 / resolution.y);
      float sceneZ = texture2D(depthTex, screenUV).x;
      float particleZ = gl_FragCoord.z;

      float sceneLin = linearizeDepth(sceneZ);
      float particleLin = linearizeDepth(particleZ);
      float delta = sceneLin - particleLin;

      float eff = max(1e-4, falloff * sizeFactor);
      float soft = clamp(smoothstep(0.001, eff, delta), 0.0, 1.0);

      gl_FragColor = vec4(c.rgb, c.a * opacity * soft);
      if (gl_FragColor.a < 0.001) discard;
    }
  `;

  // Build a material factory so we can recreate with correct DPR sizing on resize
  const makeShaderMaterial = (s) => (
    <shaderMaterial
      key={`fogMat-${Math.floor(viewport.width * dpr)}x${Math.floor(
        viewport.height * dpr
      )}-${s}`}
      transparent
      depthWrite={false}
      depthTest={true}
      blending={THREE.NormalBlending}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={{
        map: { value: tex },
        depthTex: { value: rtRef.current?.depthTexture || null },
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
        sizeFactor: { value: s },
      }}
    />
  );

  // ===== Frame loop =====
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tmpF = useMemo(() => new THREE.Vector3(), []);
  const tmpR = useMemo(() => new THREE.Vector3(), []);
  const tmpV = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const rt = rtRef.current;

    // --- 1) Depth prepass (layer 4 only) ---
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

    // --- 2) Compute world‑snapped cell, forward/right ---
    const Lm = Math.max(0.001, L);
    const camPos = camera.position;
    const cx = Math.floor(camPos.x / Lm);
    const cz = Math.floor(camPos.z / Lm);
    const cellCenterX = cx * Lm + Lm * 0.5;
    const cellCenterZ = cz * Lm + Lm * 0.5;

    camera.getWorldDirection(tmpF);
    tmpF.y = 0;
    if (tmpF.lengthSq() < 1e-6) tmpF.set(0, 0, -1);
    tmpF.normalize();
    tmpR.crossVectors(tmpF, up).normalize();

    // --- 3) Ground follow (single BVH ray) ---
    let fogY = groundYRef.current;
    if (terrainMesh) {
      const originY = ceilYRef.current;
      const far = rayFarRef.current;
      ray.set(
        tmpV.set(cellCenterX, originY, cellCenterZ),
        up.clone().multiplyScalar(-1)
      );
      ray.near = 0;
      ray.far = far;
      const hit = ray.intersectObject(terrainMesh, false)[0];
      if (hit) {
        const targetY = hit.point.y + yOffset;
        const a = 1.0 - Math.exp(-groundFollowK * dt);
        groundYRef.current = THREE.MathUtils.lerp(
          groundYRef.current,
          targetY,
          THREE.MathUtils.clamp(a, 0, 1)
        );
        fogY = groundYRef.current;
      }
    }

    // --- 4) Compute puff anchors (front cluster) ---
    const frontDepth = frontDepthScale * Lm;
    const edgeOffset = edgeOffsetScale * Lm;

    // front face midpoint of the cell along camera forward
    const frontMidX = cellCenterX + tmpF.x * frontDepth;
    const frontMidZ = cellCenterZ + tmpF.z * frontDepth;

    // midpoint between camera XZ and frontMid
    const midX = (camPos.x + frontMidX) * 0.5;
    const midZ = (camPos.z + frontMidZ) * 0.5;

    // base positions (no drift yet)
    const base = [
      new THREE.Vector3(midX, fogY, midZ), // center
      new THREE.Vector3(
        midX + tmpR.x * edgeOffset,
        fogY,
        midZ + tmpR.z * edgeOffset
      ), // right
      new THREE.Vector3(
        midX - tmpR.x * edgeOffset,
        fogY,
        midZ - tmpR.z * edgeOffset
      ), // left
      new THREE.Vector3(
        cellCenterX - tmpF.x * (0.2 * Lm),
        fogY,
        cellCenterZ - tmpF.z * (0.2 * Lm)
      ), // reserve/back
    ];

    // --- 5) Rotation + gentle drift ---
    angleRef.current += rotationSpeedZ * dt;
    const angle = angleRef.current;
    const t = state.clock.getElapsedTime();
    const seeds = [0.13, 1.37, 2.71, 3.33];

    for (let i = 0; i < 4; i++) {
      const b = base[i];
      const s = seeds[i];
      const dx =
        Math.sin((t + s) * driftSpeed * (0.8 + s * 0.1)) * driftAmp + windX * t;
      const dz =
        Math.cos((t + s) * driftSpeed * (0.7 + s * 0.1)) * driftAmp + windZ * t;
      const dy = Math.sin((t + s) * driftSpeed * (1.0 + s * 0.1)) * driftAmpY;
      const bb = billboards[i].current;
      const mm = puffMeshes[i].current;
      if (bb) bb.position.set(b.x + dx, b.y + dy, b.z + dz);
      if (mm) mm.rotation.z = angle;
      // visibility per puffCount
      const vis = i < puffCount;
      if (bb) bb.visible = vis;
      if (mm) mm.visible = vis;
    }
  });

  // ===== Render puffs =====
  // We instantiate 4 (max) and toggle visibility; sizeFactor = per‑puff scale multiplier (kept 1 for all).
  const sizeFactor = 1.0;
  return (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <Billboard key={i} follow={true} ref={billboards[i]}>
          <mesh ref={puffMeshes[i]} scale={[size, size, 1]}>
            <planeGeometry args={[1, 1, 1, 1]} />
            {makeShaderMaterial(sizeFactor)}
          </mesh>
        </Billboard>
      ))}
    </group>
  );
}
