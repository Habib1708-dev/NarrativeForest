import React, { useEffect, useRef, useState } from "react";
import { Sky } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useControls } from "leva";
import { useDebugStore } from "../../state/useDebugStore";

/* ── Static defaults (used when debug panel is off) ── */
export const CUSTOMSKY_HAZE_DEFAULTS = Object.freeze({
  hazeEnabled: true,
  hazeBottomY: -4.0,
  hazeTopY: 87.0,
  hazeFeather: 10.0,
  hazePower: 1.0,
  hazeBlendSpread: 0.59,
  hazeBlendStrength: 0.74,
});

export const CUSTOMSKY_LIGHTNING_DEFAULTS = Object.freeze({
  flashMinDelay: 4.0,
  flashMaxDelay: 8.0,
  flashSpreadBias: 1.2,
  preFlashMs: 40,
  mainFlashMs: 120,
  tailMs: 250,
  doubleFlashChance: 0.25,
});

/* ── Debug-only sub-component (mounts Leva panels) ── */
function CustomSkyDebugPanel({ hazeDefaults, lightningDefaults, onChange }) {
  const haze = useControls("Sky / Haze", {
    hazeEnabled: { value: hazeDefaults.hazeEnabled },
    hazeBottomY: { value: hazeDefaults.hazeBottomY, min: -200, max: 200, step: 0.1 },
    hazeTopY: { value: hazeDefaults.hazeTopY, min: -200, max: 200, step: 0.1 },
    hazeFeather: { value: hazeDefaults.hazeFeather, min: 0.0, max: 10.0, step: 0.01 },
    hazePower: { value: hazeDefaults.hazePower, min: 0.25, max: 4.0, step: 0.05 },
    hazeBlendSpread: { value: hazeDefaults.hazeBlendSpread, min: 0.0, max: 2.0, step: 0.01 },
    hazeBlendStrength: {
      value: hazeDefaults.hazeBlendStrength,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: "Haze Gradient Strength",
    },
  });

  const lightning = useControls("Sky / Lightning", {
    flashMinDelay: { value: lightningDefaults.flashMinDelay, min: 0.2, max: 20, step: 0.1 },
    flashMaxDelay: { value: lightningDefaults.flashMaxDelay, min: 0.2, max: 30, step: 0.1 },
    flashSpreadBias: { value: lightningDefaults.flashSpreadBias, min: 0.2, max: 3.0, step: 0.05 },
    preFlashMs: { value: lightningDefaults.preFlashMs, min: 0, max: 600, step: 5 },
    mainFlashMs: { value: lightningDefaults.mainFlashMs, min: 40, max: 600, step: 10 },
    tailMs: { value: lightningDefaults.tailMs, min: 40, max: 2000, step: 10 },
    doubleFlashChance: { value: lightningDefaults.doubleFlashChance, min: 0, max: 1, step: 0.01 },
  });

  useEffect(() => {
    onChange({ ...haze, ...lightning });
  }, [haze, lightning, onChange]);

  return null;
}

/**
 * CustomSky
 * - Wraps drei <Sky/> and patches its shader.
 * - Supports:
 *    • darken  [0..1] — multiplies sky RGB by (1 - darken)
 *    • lightning pulses (random or manual trigger) — multiplies by flashGain (>1)
 *    • saturation control — expands or contracts color intensity
 *    • tint control — blends the sky toward an art-directed color (optional haze tie-in)
 *    • haze gradient controls — extend or soften how fog mixes into the sky band
 *    • hue shift — rotates the sky color wheel without affecting luminance
 *
 * Defaults for sky params match Experience.jsx so swapping is seamless.
 */
export default function CustomSky({
  // --- Existing darken knob (night grade) ---
  darken = 0.0,

  // --- ⚡ Lightning: behavior controls (all optional) ---
  lightningEnabled = false, // master toggle
  flashMinDelay = 4.0, // seconds between pulses (min) - increased for longer quiet periods
  flashMaxDelay = 8.0, // seconds between pulses (max) - increased to match user's request
  flashPeakGain = 8.0, // peak multiplier on sky (1.0 = none) - increased for brighter strikes
  preFlashMs = 40, // small ramp before main flash - reduced for quicker onset
  mainFlashMs = 120, // bright punch - reduced for shorter, more natural streak
  tailMs = 250, // decay window - reduced for shorter tail
  flickers = 2, // little spikes in the tail
  flickerDepth = 0.35, // amplitude of the first tail spike (0..1) - reduced slightly
  doubleFlashChance = 0.25, // chance of a second pulse ~120ms later

  // --- New realism controls (optional) ---
  flashSpreadBias = 1.2, // >1 biases towards longer delays (slightly more spread)
  preFlashJitter = 0.6, // 0..1: +/-% jitter on pre-flash duration
  mainFlashJitter = 0.5, // 0..1: +/-% jitter on main flash duration
  tailJitter = 0.7, // 0..1: +/-% jitter on tail duration
  flickersMin = null, // if set w/ flickersMax, randomize count in [min,max]
  flickersMax = null,
  flickerDepthMin = null, // if set w/ flickerDepthMax, randomize amplitude
  flickerDepthMax = null,
  flashPeakGainMin = null, // if set w/ flashPeakGainMax, randomize peak
  flashPeakGainMax = null,
  doubleFlashGapMinMs = 80, // variable gap for double-flash echo
  doubleFlashGapMaxMs = 220,
  doubleFlashScaleMin = 0.5, // amplitude scale of echo pulse
  doubleFlashScaleMax = 0.85,

  // --- Preserve your current Sky defaults from Experience.jsx ---
  sunPosition = [5.0, -1.0, 30.0],
  rayleigh = 0.01,
  turbidity = 1.1,
  mieCoefficient = 0.0,
  mieDirectionalG = 0.0,

  // --- New: direct saturation controls ---
  saturation = 1.0,
  tintColor = "#ffffff",
  tintStrength = 0.0,
  colorAffectsHaze = false,
  hueShift = 0.0,

  // --- New: Height-based haze (fog color blend) ---
  // Fade the sky to a fog color below a world-space Y band.
  // Example for terrain at y=-5:
  //   hazeBottomY=-4 (full fog at/below -4), hazeTopY=-3 (full sky at/above -3)
  hazeEnabled = true,
  hazeBottomY = -4.0,
  hazeTopY = 87.0,
  hazeColor = "#585858", // separate haze color for sky blending (independent of scene fog)
  hazePower = 1.0, // curve shaping (>=0.0001)
  hazeFeather = 10.0, // extra softening width (world units)
  hazeBlendSpread = 0.59, // extends haze ↔ sky blend range
  hazeBlendStrength = 0.74, // mixes expanded blend back into final mix

  // You can pass any other <Sky/> props via ...rest
  ...rest
}) {
  const skyRef = useRef();
  const { scene } = useThree();

  // Resolve haze color (initial seed; can be overridden via Leva control)
  const hazeColorRef = useRef(new THREE.Color());
  const tintColorRef = useRef(new THREE.Color(tintColor));
  useEffect(() => {
    if (hazeColor) {
      hazeColorRef.current.set(hazeColor);
    } else if (scene?.fog?.color) {
      // seed from fog on first mount if no explicit color provided
      hazeColorRef.current.copy(scene.fog.color);
    } else {
      // A sensible cool night fallback
      hazeColorRef.current.set("#585858");
    }
  }, [hazeColor, scene]);

  useEffect(() => {
    if (tintColor) {
      tintColorRef.current.set(tintColor);
    }
  }, [tintColor]);

  // ── Debug panel guard ──
  const isDebugMode = useDebugStore((s) => s.isDebugMode);
  const [debugValues, setDebugValues] = useState(null);

  // Resolve ctrl* values: use debug overrides when available, otherwise use props directly
  const ctrlHazeEnabled = isDebugMode && debugValues ? debugValues.hazeEnabled : hazeEnabled;
  const ctrlHazeBottomY = isDebugMode && debugValues ? debugValues.hazeBottomY : hazeBottomY;
  const ctrlHazeTopY = isDebugMode && debugValues ? debugValues.hazeTopY : hazeTopY;
  const ctrlHazeFeather = isDebugMode && debugValues ? debugValues.hazeFeather : hazeFeather;
  const ctrlHazePower = isDebugMode && debugValues ? debugValues.hazePower : hazePower;
  const ctrlHazeBlendSpread = isDebugMode && debugValues ? debugValues.hazeBlendSpread : hazeBlendSpread;
  const ctrlHazeBlendStrength = isDebugMode && debugValues ? debugValues.hazeBlendStrength : hazeBlendStrength;

  // Use hazeColor prop directly (controlled from Experience.jsx presets)
  const ctrlHazeColor = hazeColor;

  // lightningEnabled and flashPeakGain now come from Experience.jsx (presets)
  const ctrlLightningEnabled = lightningEnabled;
  const ctrlFlashPeakGain = flashPeakGain;

  const ctrlFlashMinDelay = isDebugMode && debugValues ? debugValues.flashMinDelay : flashMinDelay;
  const ctrlFlashMaxDelay = isDebugMode && debugValues ? debugValues.flashMaxDelay : flashMaxDelay;
  const ctrlFlashSpreadBias = isDebugMode && debugValues ? debugValues.flashSpreadBias : flashSpreadBias;
  const ctrlPreFlashMs = isDebugMode && debugValues ? debugValues.preFlashMs : preFlashMs;
  const ctrlMainFlashMs = isDebugMode && debugValues ? debugValues.mainFlashMs : mainFlashMs;
  const ctrlTailMs = isDebugMode && debugValues ? debugValues.tailMs : tailMs;
  const ctrlDoubleFlashChance = isDebugMode && debugValues ? debugValues.doubleFlashChance : doubleFlashChance;

  // Use Sky / Color props directly (controlled from Experience.jsx presets)
  const ctrlSaturation = saturation;
  const ctrlTintStrength = tintStrength;
  const ctrlTintColor = tintColor;
  const ctrlColorAffectsHaze = colorAffectsHaze;
  const ctrlHueShift = hueShift;

  useEffect(() => {
    if (ctrlTintColor) {
      tintColorRef.current.set(ctrlTintColor);
    }
  }, [ctrlTintColor]);

  // ──────────────────────────────────────────────────────────────────────────
  // Shader patch (adds uSkyDarken and uSkyFlashGain to fragment shader)
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const mesh = skyRef.current;
    const mat = mesh?.material;
    if (!mat || mat.userData?._patched) return;

    const originalOBC = mat.onBeforeCompile;

    mat.onBeforeCompile = (shader) => {
      originalOBC?.(shader);

      // 0) Vertex shader: carry world-space Y to fragment stage
      //    Add varying and compute it at the end of main().
      if (!/varying\s+float\s+vNF_WorldY\s*;/.test(shader.vertexShader)) {
        shader.vertexShader =
          `varying float vNF_WorldY;\n` + shader.vertexShader;
      }
      {
        const vs = shader.vertexShader;
        const mainOpen = vs.indexOf("void main()");
        if (mainOpen >= 0) {
          const braceOpen = vs.indexOf("{", mainOpen);
          let depth = 0,
            i = braceOpen;
          for (; i < vs.length; i++) {
            const ch = vs[i];
            if (ch === "{") depth++;
            else if (ch === "}") {
              depth--;
              if (depth === 0) break;
            }
          }
          if (i > braceOpen) {
            shader.vertexShader =
              vs.slice(0, i) +
              `\n              // narrative-forest: world-space Y for haze blending\n              vec4 nf_wp = modelMatrix * vec4(position, 1.0);\n              vNF_WorldY = nf_wp.y;\n              ` +
              vs.slice(i);
          }
        }
      }

      // 1) Declare our uniforms at the very top of the fragment shader
      shader.fragmentShader =
        `uniform float uSkyDarken;\n` +
        `uniform float uSkyFlashGain;\n` +
        `uniform float uSkySaturation;\n` +
        `uniform vec3  uSkyTintColor;\n` +
        `uniform float uSkyTintStrength;\n` +
        `uniform float uSkyColorAffectsHaze;\n` +
        `uniform float uSkyHueShift;\n` +
        `uniform float uHazeBlendSpread;\n` +
        `uniform float uHazeBlendStrength;\n` +
        `uniform float uHazeEnabled;\n` +
        `uniform float uHazeBottomY;\n` +
        `uniform float uHazeTopY;\n` +
        `uniform float uHazePower;\n` +
        `uniform float uHazeFeather;\n` +
        `uniform vec3  uHazeColor;\n` +
        `varying float vNF_WorldY;\n` +
        shader.fragmentShader;

      // 2) Rewrite final assignment → multiply with darken & flash
      // Pattern A: gl_FragColor = vec4( COLOR , ALPHA );
      let fs = shader.fragmentShader;
      const patA =
        /gl_FragColor\s*=\s*vec4\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*;/m;
      if (patA.test(fs)) {
        fs = fs.replace(patA, `gl_FragColor = vec4( ( $1 ), $2 );`);
      } else {
        // Pattern B: gl_FragColor = vec4( VEC4 );
        const patB = /gl_FragColor\s*=\s*vec4\s*\(\s*([^)]+)\s*\)\s*;/m;
        if (patB.test(fs)) {
          fs = fs.replace(patB, `gl_FragColor = vec4( ( $1 ).rgb, ( $1 ).a );`);
        } else {
          // Fallback: no direct assignment found; final adjustments handled later
        }
      }

      // 3) Inject height-based haze blend near end of main()
      {
        const mainOpen = fs.indexOf("void main()");
        if (mainOpen >= 0) {
          const braceOpen = fs.indexOf("{", mainOpen);
          let depth = 0,
            i = braceOpen;
          for (; i < fs.length; i++) {
            const ch = fs[i];
            if (ch === "{") depth++;
            else if (ch === "}") {
              depth--;
              if (depth === 0) break;
            }
          }
          if (i > braceOpen) {
            fs =
              fs.slice(0, i) +
              `
              // narrative-forest: apply saturation/tint before optional haze blend
              vec3 nfBaseColor = gl_FragColor.rgb;
              if (abs(uSkyHueShift) > 0.0001) {
                mat3 nfRGB2YIQ = mat3(
                  0.299, 0.587, 0.114,
                  0.596, -0.274, -0.322,
                  0.211, -0.523, 0.312
                );
                mat3 nfYIQ2RGB = mat3(
                  1.0, 0.956, 0.621,
                  1.0, -0.272, -0.647,
                  1.0, -1.107, 1.704
                );
                vec3 nfYIQ = nfRGB2YIQ * nfBaseColor;
                float nfHue = radians(uSkyHueShift);
                float nfCh = cos(nfHue);
                float nfSh = sin(nfHue);
                mat2 nfRot = mat2(nfCh, -nfSh, nfSh, nfCh);
                nfYIQ.yz = nfRot * nfYIQ.yz;
                nfBaseColor = nfYIQ2RGB * nfYIQ;
              }
              float nfSat = max(0.0, uSkySaturation);
              float nfLumBase = dot(nfBaseColor, vec3(0.2126, 0.7152, 0.0722));
              vec3 nfGrayBase = vec3(nfLumBase);
              vec3 nfSatColor = nfGrayBase + (nfBaseColor - nfGrayBase) * nfSat;
              float nfTintStrength = clamp(uSkyTintStrength, 0.0, 1.0);
              vec3 nfTinted = mix(nfSatColor, uSkyTintColor, nfTintStrength);
              vec3 nfFinalColor = nfTinted;

              if (uHazeEnabled > 0.5) {
                float y0 = min(uHazeBottomY, uHazeTopY);
                float y1 = max(uHazeBottomY, uHazeTopY);
                float t = smoothstep(y0 - uHazeFeather, y1 + uHazeFeather, vNF_WorldY);
                t = pow(t, max(0.0001, uHazePower));

                vec3 nfHazeColor = uHazeColor;
                if (uSkyColorAffectsHaze > 0.5) {
                  float nfLumHaze = dot(nfHazeColor, vec3(0.2126, 0.7152, 0.0722));
                  vec3 nfGrayHaze = vec3(nfLumHaze);
                  vec3 nfHazeSat = nfGrayHaze + (nfHazeColor - nfGrayHaze) * nfSat;
                  nfHazeColor = mix(nfHazeSat, uSkyTintColor, nfTintStrength);
                }

                float nfBlend = clamp(t, 0.0, 1.0);
                float nfSpread = max(0.0, uHazeBlendSpread);
                float nfStrength = clamp(uHazeBlendStrength, 0.0, 1.0);
                float nfExpanded = nfBlend;
                if (nfStrength > 0.0001) {
                  if (nfSpread > 0.0001) {
                    nfExpanded = smoothstep(-nfSpread, 1.0 + nfSpread, nfBlend);
                  } else {
                    nfExpanded = smoothstep(0.0, 1.0, nfBlend);
                  }
                  nfBlend = mix(nfBlend, nfExpanded, nfStrength);
                }

                nfFinalColor = mix(nfHazeColor, nfTinted, clamp(nfBlend, 0.0, 1.0));
              }

              gl_FragColor.rgb = nfFinalColor;
      gl_FragColor.rgb *= ( 1.0 - clamp(uSkyDarken, 0.0, 1.0) );
      gl_FragColor.rgb *= max(uSkyFlashGain, 0.0);
              ` +
              fs.slice(i);
          }
        }
      }

      shader.fragmentShader = fs;

      // Keep uniforms reachable from React
      shader.uniforms.uSkyDarken = { value: darken };
      shader.uniforms.uSkyFlashGain = { value: 1.0 };
      shader.uniforms.uSkySaturation = { value: Math.max(0.0, ctrlSaturation) };
      shader.uniforms.uSkyTintColor = {
        value: new THREE.Color().copy(tintColorRef.current),
      };
      shader.uniforms.uSkyTintStrength = {
        value: Math.max(0.0, Math.min(1.0, ctrlTintStrength)),
      };
      shader.uniforms.uSkyColorAffectsHaze = {
        value: ctrlColorAffectsHaze ? 1 : 0,
      };
      shader.uniforms.uSkyHueShift = {
        value: ctrlHueShift,
      };
      shader.uniforms.uHazeBlendSpread = {
        value: Math.max(0.0, ctrlHazeBlendSpread),
      };
      shader.uniforms.uHazeBlendStrength = {
        value: Math.max(0.0, Math.min(1.0, ctrlHazeBlendStrength)),
      };
      shader.uniforms.uHazeEnabled = { value: ctrlHazeEnabled ? 1 : 0 };
      shader.uniforms.uHazeBottomY = { value: ctrlHazeBottomY };
      shader.uniforms.uHazeTopY = { value: ctrlHazeTopY };
      shader.uniforms.uHazePower = { value: Math.max(0.0001, ctrlHazePower) };
      shader.uniforms.uHazeFeather = { value: Math.max(0.0, ctrlHazeFeather) };
      shader.uniforms.uHazeColor = {
        value: new THREE.Color(hazeColorRef.current),
      };
      mat.userData.uSkyDarken = shader.uniforms.uSkyDarken;
      mat.userData.uSkyFlashGain = shader.uniforms.uSkyFlashGain;
      mat.userData.uSkySaturation = shader.uniforms.uSkySaturation;
      mat.userData.uSkyTintColor = shader.uniforms.uSkyTintColor;
      mat.userData.uSkyTintStrength = shader.uniforms.uSkyTintStrength;
      mat.userData.uSkyColorAffectsHaze = shader.uniforms.uSkyColorAffectsHaze;
      mat.userData.uSkyHueShift = shader.uniforms.uSkyHueShift;
      mat.userData.uHazeBlendSpread = shader.uniforms.uHazeBlendSpread;
      mat.userData.uHazeBlendStrength = shader.uniforms.uHazeBlendStrength;
      mat.userData.uHazeEnabled = shader.uniforms.uHazeEnabled;
      mat.userData.uHazeBottomY = shader.uniforms.uHazeBottomY;
      mat.userData.uHazeTopY = shader.uniforms.uHazeTopY;
      mat.userData.uHazePower = shader.uniforms.uHazePower;
      mat.userData.uHazeFeather = shader.uniforms.uHazeFeather;
      mat.userData.uHazeColor = shader.uniforms.uHazeColor;
    };

    mat.userData._patched = true;
    mat.needsUpdate = true;

    return () => {
      if (mat) mat.onBeforeCompile = originalOBC;
    };
  }, [
    darken,
    sunPosition,
    rayleigh,
    turbidity,
    mieCoefficient,
    mieDirectionalG,
    ctrlHazeEnabled,
    ctrlHazeBottomY,
    ctrlHazeTopY,
    ctrlHazePower,
    ctrlHazeFeather,
    ctrlSaturation,
    ctrlTintStrength,
    ctrlColorAffectsHaze,
    ctrlHazeBlendSpread,
    ctrlHazeBlendStrength,
    ctrlHueShift,
  ]);

  // ──────────────────────────────────────────────────────────────────────────
  // ⚡ Lightning pulse timeline (randomized)
  // ──────────────────────────────────────────────────────────────────────────
  const timeRef = useRef(0);
  const nextFireAtRef = useRef(0);
  const activeRef = useRef(null); // holds current envelope timeline or null
  const activeThunderSoundsRef = useRef([]); // array of currently playing thunder sounds

  // Audio object pool to avoid per-strike allocations
  const THUNDER_POOL_SIZE = 4;
  const thunderPoolRef = useRef([]);

  useEffect(() => {
    const pool = [];
    for (let i = 0; i < THUNDER_POOL_SIZE; i++) {
      const audio = new Audio("/audio/loud-thunder-192165.mp3");
      audio.preload = "auto";
      audio._inUse = false;
      pool.push(audio);
    }
    thunderPoolRef.current = pool;
    return () => {
      // Stop all pooled and active thunder sounds on unmount
      for (let i = 0; i < pool.length; i++) {
        pool[i].pause();
        pool[i].src = "";
      }
      for (let i = 0; i < activeThunderSoundsRef.current.length; i++) {
        activeThunderSoundsRef.current[i].pause();
      }
      activeThunderSoundsRef.current = [];
    };
  }, []);

  // Helper to schedule the next lightning start time
  const randRange = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(randRange(a, b + 1));
  const jitter = (base, pct) => {
    const p = Math.max(0, pct);
    const f = randRange(1 - p, 1 + p);
    return base * f;
  };

  const scheduleNext = (now) => {
    const min = Math.max(0.2, ctrlFlashMinDelay);
    const max = Math.max(min + 0.1, ctrlFlashMaxDelay);
    const bias = Math.max(0.01, ctrlFlashSpreadBias);
    const u = Math.random();
    // Skew towards longer delays when bias>1
    const skewed = 1 - Math.pow(1 - u, bias);
    const delay = min + (max - min) * skewed;
    nextFireAtRef.current = now + delay;
  };

  // Build a tiny envelope (array of segments)
  // Each segment: { dur, amp } ; we interpret as smooth in-out per segment.
  const makeEnvelope = () => {
    const env = [];
    const toSec = (ms) => Math.max(0, ms) / 1000;

    // Randomize peak per event if a range is provided
    // Max peak comes from Leva control; min defaults to 1.0 unless props specify a range
    const peakMax = Number.isFinite(ctrlFlashPeakGain)
      ? ctrlFlashPeakGain
      : Number.isFinite(flashPeakGainMax)
      ? flashPeakGainMax
      : flashPeakGain;
    const peakMin = Number.isFinite(flashPeakGainMin) ? flashPeakGainMin : 1.0;
    const peakLocal = randRange(
      Math.min(peakMin, peakMax),
      Math.max(peakMin, peakMax)
    );

    // Helper to append a pulse with optional amplitude scaling
    const addPulse = (ampScale = 1.0) => {
      const pf = Math.max(0, jitter(ctrlPreFlashMs, preFlashJitter));
      const mf = Math.max(0, jitter(ctrlMainFlashMs, mainFlashJitter));
      const tf = Math.max(0, jitter(ctrlTailMs, tailJitter));

      // Pre-flash (soft rise)
      if (pf > 0) env.push({ dur: toSec(pf), amp: 0.4 * ampScale });
      // Main flash
      if (mf > 0) env.push({ dur: toSec(mf), amp: 1.0 * ampScale });

      // Tail flickers (decaying spikes)
      const hasRange =
        Number.isFinite(flickersMin) && Number.isFinite(flickersMax);
      const n = Math.max(
        0,
        hasRange
          ? randInt(
              Math.min(flickersMin, flickersMax),
              Math.max(flickersMin, flickersMax)
            )
          : Math.floor(flickers)
      );
      const tail = Math.max(0, toSec(tf));
      let amp0 =
        Number.isFinite(flickerDepthMin) && Number.isFinite(flickerDepthMax)
          ? randRange(
              Math.min(flickerDepthMin, flickerDepthMax),
              Math.max(flickerDepthMin, flickerDepthMax)
            )
          : Math.max(0, Math.min(1, flickerDepth));
      let amp = Math.max(0, Math.min(1, amp0)) * ampScale;
      for (let i = 0; i < n; i++) {
        const slice = tail / Math.max(1, n);
        env.push({ dur: slice, amp });
        amp *= 0.45; // decay each flicker
      }
    };

    // First pulse
    addPulse(1.0);

    // Optional echo pulse with variable gap and scale
    if (Math.random() < ctrlDoubleFlashChance) {
      const gap = randRange(doubleFlashGapMinMs, doubleFlashGapMaxMs);
      env.push({ dur: toSec(gap), amp: 0.0 }); // silent gap
      const echoScale = randRange(
        Math.min(doubleFlashScaleMin, doubleFlashScaleMax),
        Math.max(doubleFlashScaleMin, doubleFlashScaleMax)
      );
      addPulse(echoScale);
    }

    // Attach the chosen peak to the env for this event
    env._peak = Math.max(1.0, peakLocal);

    // Normalize: ensure at least one segment
    if (env.length === 0) env.push({ dur: 0.12, amp: 1.0 });
    return env;
  };

  // Envelope sampler (smooth sin in/out per segment)
  const evalEnvelope = (env, t) => {
    let acc = 0;
    for (let s = 0; s < env.length; s++) {
      const { dur, amp } = env[s];
      const t0 = acc,
        t1 = acc + dur;
      if (t <= t1) {
        const u = dur > 0 ? (t - t0) / dur : 1;
        // raised-sine for pulse
        const w = Math.sin(Math.PI * Math.min(Math.max(u, 0), 1));
        return amp * w;
      }
      acc = t1;
    }
    // past the end
    return 0;
  };

  // Allow manual external trigger via ref if needed later
  // (e.g., skyRef.current?.userData?.triggerLightning?.())
  useEffect(() => {
    const mat = skyRef.current?.material;
    if (!mat) return;
    mat.userData.triggerLightning = () => {
      activeRef.current = {
        t0: timeRef.current,
        env: makeEnvelope(),
        duration: makeEnvelope().reduce((a, s) => a + s.dur, 0),
      };
    };
  }, []);

  // Main loop: update uniforms
  useFrame((_, dt) => {
    timeRef.current += dt;

    // Update darken uniform every frame
    const uDark = skyRef.current?.material?.userData?.uSkyDarken;
    if (uDark) uDark.value = darken;
    const uSat = skyRef.current?.material?.userData?.uSkySaturation;
    if (uSat) uSat.value = Math.max(0.0, ctrlSaturation);
    const uTintStrength = skyRef.current?.material?.userData?.uSkyTintStrength;
    if (uTintStrength)
      uTintStrength.value = Math.max(0.0, Math.min(1.0, ctrlTintStrength));
    const uTintColor = skyRef.current?.material?.userData?.uSkyTintColor;
    if (uTintColor) uTintColor.value.copy(tintColorRef.current);
    const uColorAffectsHaze =
      skyRef.current?.material?.userData?.uSkyColorAffectsHaze;
    if (uColorAffectsHaze)
      uColorAffectsHaze.value = ctrlColorAffectsHaze ? 1 : 0;
    const uHueShift = skyRef.current?.material?.userData?.uSkyHueShift;
    if (uHueShift) uHueShift.value = ctrlHueShift;
    const uHazeBlendSpread =
      skyRef.current?.material?.userData?.uHazeBlendSpread;
    if (uHazeBlendSpread)
      uHazeBlendSpread.value = Math.max(0.0, ctrlHazeBlendSpread);
    const uHazeBlendStrength =
      skyRef.current?.material?.userData?.uHazeBlendStrength;
    if (uHazeBlendStrength)
      uHazeBlendStrength.value = Math.max(
        0.0,
        Math.min(1.0, ctrlHazeBlendStrength)
      );

    // Lightning logic
    let flashGain = 1.0;

    const isLightningOn = (ctrlLightningEnabled ?? lightningEnabled) === true;
    if (isLightningOn) {
      const now = timeRef.current;

      // Start a new pulse if time has come
      if (!activeRef.current) {
        if (now >= nextFireAtRef.current) {
          const env = makeEnvelope();
          const duration = env.reduce((a, s) => a + s.dur, 0);
          activeRef.current = { t0: now, env, duration };

          // Play thunder sound from pool (avoids per-strike Audio allocation)
          const pool = thunderPoolRef.current;
          let thunderAudio = null;
          for (let pi = 0; pi < pool.length; pi++) {
            if (!pool[pi]._inUse) { thunderAudio = pool[pi]; break; }
          }
          if (!thunderAudio) thunderAudio = pool[0]; // reuse oldest if all busy

          const peak = env._peak ?? flashPeakGain;
          const normalizedPeak = Math.min(1, Math.max(0, (peak - 1) / 9));
          const volume = 0.3 + normalizedPeak * 0.7;
          thunderAudio.volume = volume;
          thunderAudio.currentTime = 0;
          thunderAudio._inUse = true;

          const handleEnded = () => {
            thunderAudio._inUse = false;
            thunderAudio.removeEventListener("ended", handleEnded);
          };
          thunderAudio.addEventListener("ended", handleEnded);

          thunderAudio.play().catch(() => {
            thunderAudio._inUse = false;
            thunderAudio.removeEventListener("ended", handleEnded);
          });
        }
      }

      // If active, evaluate envelope
      if (activeRef.current) {
        const { t0, env, duration } = activeRef.current;
        const elapsed = now - t0;
        if (elapsed <= duration) {
          const e = evalEnvelope(env, elapsed); // 0..1
          const peak = Math.max(1.0, env._peak ?? flashPeakGain);
          flashGain = 1.0 + (peak - 1.0) * e;
        } else {
          // End pulse → schedule next
          activeRef.current = null;
          scheduleNext(now);
        }
      } else if (nextFireAtRef.current === 0) {
        // Initialize first schedule
        scheduleNext(now);
      }
    } else {
      // If disabled, clear state and keep baseline gain
      activeRef.current = null;
      nextFireAtRef.current = 0;
      flashGain = 1.0;
    }

    const uFlash = skyRef.current?.material?.userData?.uSkyFlashGain;
    if (uFlash) uFlash.value = flashGain;

    // Update haze uniforms
    const ud = skyRef.current?.material?.userData;
    if (ud?.uHazeEnabled) ud.uHazeEnabled.value = ctrlHazeEnabled ? 1 : 0;
    if (ud?.uHazeBottomY) ud.uHazeBottomY.value = ctrlHazeBottomY;
    if (ud?.uHazeTopY) ud.uHazeTopY.value = ctrlHazeTopY;
    if (ud?.uHazePower) ud.uHazePower.value = Math.max(0.0001, ctrlHazePower);
    if (ud?.uHazeFeather)
      ud.uHazeFeather.value = Math.max(0.0, ctrlHazeFeather);
    // Use independent haze color (debug-friendly)
    if (ud?.uHazeColor) {
      ud.uHazeColor.value.copy(hazeColorRef.current);
    }
  });

  return (
    <>
      {isDebugMode && (
        <CustomSkyDebugPanel
          hazeDefaults={{
            hazeEnabled,
            hazeBottomY,
            hazeTopY,
            hazeFeather,
            hazePower,
            hazeBlendSpread,
            hazeBlendStrength,
          }}
          lightningDefaults={{
            flashMinDelay,
            flashMaxDelay,
            flashSpreadBias,
            preFlashMs,
            mainFlashMs,
            tailMs,
            doubleFlashChance,
          }}
          onChange={setDebugValues}
        />
      )}
      <Sky
        ref={skyRef}
        sunPosition={sunPosition}
        rayleigh={rayleigh}
        turbidity={turbidity}
        mieCoefficient={mieCoefficient}
        mieDirectionalG={mieDirectionalG}
        {...rest}
      />
    </>
  );
}
