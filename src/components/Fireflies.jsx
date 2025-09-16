// src/components/Fireflies.jsx
import React, { forwardRef, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useControls } from "leva";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Shaders
 * - Vertex: vertical rise from bottom → top (looped), per-particle speed/phase, subtle lateral drift
 * - Fragment: circular soft sprite, tinted by uColor; fades in at bottom, twinkles near top, then disappears
 */

// Fragment: soft circular glow + fade/twinkle based on vProgress
const firefliesFragmentShader = `
uniform vec3 uColor;
uniform float uTime;

varying float vProgress;
varying float vSeed;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float r = length(uv);
  if (r > 0.5) discard;

  // Soft Gaussian blob
  float x = r / 0.5;                  // 0..1
  float blob = exp(-4.0 * x * x);

  // Fade in near the bottom, fade out near the top
  float fadeIn  = smoothstep(0.00, 0.08, vProgress);
  float fadeOut = 1.0 - smoothstep(0.92, 1.0, vProgress);

  // Twinkle near the top before disappearing
  float nearTop  = smoothstep(0.85, 1.0, vProgress);
  float twBase   = 0.5 + 0.5 * sin(uTime * 30.0 + vSeed * 12.0);
  float twinkle  = mix(1.0, twBase, nearTop);

  float alpha = blob * fadeIn * fadeOut * twinkle;
  gl_FragColor = vec4(uColor, alpha);
}
`;

// Vertex: move each particle upward through the box height; add subtle lateral drift
const firefliesVertexShader = `
uniform float uPixelRatio;
uniform float uSize;
uniform float uTime;
uniform float uSpeed;    // global speed multiplier
uniform float uWidth;    // full width (X/Z footprint)
uniform float uHeight;   // full height
uniform float uDrift;    // lateral drift as fraction of half-width

attribute float aScale;  // per-particle size multiplier
attribute float aSpeed;  // per-particle speed multiplier
attribute float aPhase;  // per-particle phase [0..1)
attribute float aSeed;   // per-particle seed [0..1] for drift/twinkle

varying float vProgress;
varying float vSeed;

void main() {
  // position = bottom-start world position (x,z random in box; y is box bottom center)
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);

  // Looping progress: 0 at bottom → 1 at top → wrap
  float t = uTime * uSpeed * aSpeed + aPhase;
  float p = fract(t);           // 0..1
  vProgress = p;
  vSeed = aSeed;

  // Vertical rise
  modelPosition.y += p * uHeight;

  // Subtle lateral drift (side-to-side) while rising
  float halfW = uWidth * 0.5;
  float jitterAmp = halfW * uDrift;          // fraction of half width
  modelPosition.x += sin(t * 1.7 + aSeed * 6.2831) * jitterAmp;
  modelPosition.z += cos(t * 1.3 + aSeed * 3.1415) * jitterAmp;

  // Project
  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;

  // Perspective-correct point size
  gl_PointSize = uSize * aScale * uPixelRatio;
  gl_PointSize *= (1.0 / -viewPosition.z);
}
`;

// === Baked crystal instance placements (centers) ===
const BAKED = [
  { px: -2.47, py: -4.56, pz: -1.5, s: 0.18 },
  { px: -2.22, py: -4.67, pz: -1.62, s: 0.13 },
  { px: -2.8, py: -4.47, pz: -2.9, s: 0.18 },
  { px: -2.48, py: -4.46, pz: -3.6, s: 0.12 },
  { px: -2.8, py: -4.48, pz: -3.121, s: 0.14 },
  { px: -2.6, py: -4.5, pz: -1.47, s: 0.16 },
  { px: -2.7, py: -4.53, pz: -2.2, s: 0.17 },
  { px: -0.97, py: -4.28, pz: -2.8, s: 0.14 },
];
const COUNT_BOXES = BAKED.length;

// Stable RNG helpers
const seeded = (i, salt = 1) => {
  const x = Math.sin((i + 1) * 12.9898 * (salt + 1)) * 43758.5453;
  return x - Math.floor(x);
};

export default forwardRef(function Fireflies(props, ref) {
  const { gl, clock } = useThree();

  // =========================
  // Global, simple controls
  // =========================
  const {
    enabled,
    perBoxCount, // particles per virtual box
    pointSizePx, // base gl_PointSize (px)
    scaleMin, // per-particle size multiplier min
    scaleMax, // per-particle size multiplier max
    speed, // global rise speed multiplier
    width, // full width (X/Z), square footprint
    height, // full vertical height
    elevation, // box floor offset from baked base
    drift, // lateral drift as fraction of half-width
    color, // global particle color
    showBoxes, // debug wire boxes
    boxColor,
    boxOpacity,
  } = useControls("Fireflies (Global)", {
    enabled: { value: true, label: "Enabled" },

    // Keep your debugged defaults small/tidy
    perBoxCount: {
      value: 40,
      min: 0,
      max: 2000,
      step: 1,
      label: "Particles per Box",
    },
    pointSizePx: {
      value: 8,
      min: 1,
      max: 200,
      step: 1,
      label: "Point Size (px)",
    },
    scaleMin: {
      value: 0.32,
      min: 0.01,
      max: 1.0,
      step: 0.01,
      label: "Per-Particle Scale Min",
    },
    scaleMax: {
      value: 1.0,
      min: 0.05,
      max: 2.0,
      step: 0.01,
      label: "Per-Particle Scale Max",
    },
    speed: { value: 0.2, min: 0.0, max: 5.0, step: 0.01, label: "Speed" },

    width: {
      value: 0.1,
      min: 0.02,
      max: 10.0,
      step: 0.001,
      label: "Box Width (full, X=Z)",
    },
    height: {
      value: 0.22,
      min: 0.02,
      max: 10.0,
      step: 0.001,
      label: "Box Height (full)",
    },
    elevation: {
      value: 0.0,
      min: -5.0,
      max: 5.0,
      step: 0.001,
      label: "Elevation from Base",
    },

    drift: {
      value: 0.08,
      min: 0.0,
      max: 0.5,
      step: 0.001,
      label: "Lateral Drift (× half-width)",
    },

    color: { value: "#e79affff", label: "Particle Color" },
    showBoxes: { value: false, label: "Show Wireframe Boxes" },
    boxColor: { value: "#39d6ff", label: "Box Color" },
    boxOpacity: {
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Box Opacity",
    },
  });

  // ====================
  // Geometry & material
  // ====================
  const geoRef = useRef(null);
  const matRef = useRef(null);
  const ptsRef = useRef(null);
  const pixelRatioRef = useRef(1);

  useEffect(() => {
    pixelRatioRef.current = Math.min(
      gl.getPixelRatio ? gl.getPixelRatio() : 1,
      2
    );
  }, [gl]);

  // total particles = boxes * per-box count
  const totalParticles = useMemo(
    () => COUNT_BOXES * Math.max(0, Math.floor(perBoxCount)),
    [perBoxCount]
  );

  // Build/rebuild particles when globals change
  useEffect(() => {
    if (!enabled) return;

    // dispose old geometry
    if (geoRef.current) {
      geoRef.current.dispose();
      geoRef.current = null;
    }

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(totalParticles * 3);
    const aScale = new Float32Array(totalParticles);
    const aSpeed = new Float32Array(totalParticles);
    const aPhase = new Float32Array(totalParticles);
    const aSeed = new Float32Array(totalParticles);

    const nPerBox = Math.max(0, Math.floor(perBoxCount));
    const half = Math.max(0.001, width * 0.5);
    const fullH = Math.max(0.001, height);

    let cursor = 0;

    for (let i = 0; i < COUNT_BOXES; i++) {
      const baseX = BAKED[i].px;
      const baseY = BAKED[i].py + elevation; // box floor (bottom)
      const baseZ = BAKED[i].pz;

      for (let k = 0; k < nPerBox; k++) {
        const idx = cursor + k;

        // Random bottom-start position inside the square footprint
        const rx = (Math.random() * 2 - 1) * half;
        const rz = (Math.random() * 2 - 1) * half;

        positions[idx * 3 + 0] = baseX + rx;
        positions[idx * 3 + 1] = baseY; // bottom of the box
        positions[idx * 3 + 2] = baseZ + rz;

        // Per-particle visual scale
        const rS = seeded(idx, 11);
        aScale[idx] = THREE.MathUtils.lerp(scaleMin, scaleMax, rS);

        // Per-particle speed multiplier (0.75..1.25 for variety)
        const rV = seeded(idx, 5);
        aSpeed[idx] = THREE.MathUtils.lerp(0.75, 1.25, rV);

        // Per-particle starting phase (0..1)
        aPhase[idx] = seeded(idx, 7);

        // Seed for twinkle/drift
        aSeed[idx] = seeded(idx, 13);
      }

      cursor += nPerBox;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aScale", new THREE.BufferAttribute(aScale, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeed, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geoRef.current = geo;
  }, [enabled, totalParticles, width, height, elevation, scaleMin, scaleMax, perBoxCount]);

  // Shader material
  useEffect(() => {
    if (!enabled) return;

    if (matRef.current) {
      matRef.current.dispose();
      matRef.current = null;
    }

    const mat = new THREE.ShaderMaterial({
      vertexShader: firefliesVertexShader,
      fragmentShader: firefliesFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        uPixelRatio: { value: pixelRatioRef.current },
        uSize: { value: pointSizePx },
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uWidth: { value: width },
        uHeight: { value: height },
        uDrift: { value: drift },
        uColor: { value: new THREE.Color(color) },
      },
    });

    matRef.current = mat;
  }, [enabled, pointSizePx, speed, width, height, drift, color]);

  // Keep uniforms live
  useEffect(() => {
    if (!matRef.current) return;
    matRef.current.uniforms.uPixelRatio.value = Math.min(
      gl.getPixelRatio ? gl.getPixelRatio() : 1,
      2
    );
    matRef.current.uniforms.uSize.value = pointSizePx;
    matRef.current.uniforms.uSpeed.value = speed;
    matRef.current.uniforms.uWidth.value = width;
    matRef.current.uniforms.uHeight.value = height;
    matRef.current.uniforms.uDrift.value = drift;
    matRef.current.uniforms.uColor.value.set(color);
  }, [gl, pointSizePx, speed, width, height, drift, color]);

  // Resize → update pixel ratio
  useEffect(() => {
    const onResize = () => {
      const pr = Math.min(gl.getPixelRatio ? gl.getPixelRatio() : 1, 2);
      pixelRatioRef.current = pr;
      if (matRef.current) matRef.current.uniforms.uPixelRatio.value = pr;
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [gl]);

  // Animate time
  useFrame(() => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  // ==================
  // Wireframe boxes
  // ==================
  const boxRefs = useRef([...Array(COUNT_BOXES)].map(() => React.createRef()));
  const lineMatsRef = useRef([]);

  // (re)create line materials when color/opacity change
  useEffect(() => {
    lineMatsRef.current.forEach((m) => m.dispose?.());
    lineMatsRef.current = [...Array(COUNT_BOXES)].map(
      () =>
        new THREE.LineBasicMaterial({
          color: new THREE.Color(boxColor),
          transparent: true,
          opacity: boxOpacity,
          depthWrite: false,
        })
    );
    // apply onto existing
    boxRefs.current.forEach((ref, i) => {
      if (ref.current) ref.current.material = lineMatsRef.current[i];
    });
    return () => {
      lineMatsRef.current.forEach((m) => m.dispose?.());
      lineMatsRef.current = [];
    };
  }, [boxColor, boxOpacity]);

  // Keep box transforms in sync with width/height/elevation
  useEffect(() => {
    const fullW = Math.max(0.001, width);
    const fullH = Math.max(0.001, height);
    const halfH = fullH * 0.5;
    for (let i = 0; i < COUNT_BOXES; i++) {
      const seg = boxRefs.current[i]?.current;
      if (!seg) continue;

      const { px, py, pz } = BAKED[i];
      const centerY = py + elevation + halfH;

      seg.position.set(px, centerY, pz);
      seg.scale.set(fullW, fullH, fullW); // square footprint (X == Z == width)
      seg.updateMatrixWorld(true);
    }
  }, [width, height, elevation]);

  if (!enabled || totalParticles <= 0) {
    return showBoxes ? (
      <group ref={ref} name="Fireflies (Boxes only)" {...props}>
        {Array.from({ length: COUNT_BOXES }).map((_, i) => (
          <lineSegments
            key={`boxOnly-${i}`}
            ref={boxRefs.current[i]}
            material={
              lineMatsRef.current[i] ||
              new THREE.LineBasicMaterial({
                color: new THREE.Color(boxColor),
                transparent: true,
                opacity: boxOpacity,
                depthWrite: false,
              })
            }
            visible={true}
          >
            <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
          </lineSegments>
        ))}
      </group>
    ) : null;
  }

  return (
    <group ref={ref} name="Fireflies" {...props}>
      {/* Points */}
      {geoRef.current && matRef.current && (
        <points
          ref={ptsRef}
          geometry={geoRef.current}
          material={matRef.current}
          frustumCulled={false}
        />
      )}

      {/* Wireframe bounds */}
      {showBoxes &&
        Array.from({ length: COUNT_BOXES }).map((_, i) => (
          <lineSegments
            key={`box-${i}`}
            ref={boxRefs.current[i]}
            material={
              lineMatsRef.current[i] ||
              new THREE.LineBasicMaterial({
                color: new THREE.Color(boxColor),
                transparent: true,
                opacity: boxOpacity,
                depthWrite: false,
              })
            }
          >
            <edgesGeometry args={[new THREE.BoxGeometry(1, 1, 1)]} />
          </lineSegments>
        ))}
    </group>
  );
});
