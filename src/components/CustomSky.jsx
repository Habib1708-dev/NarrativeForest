import React, { useEffect, useRef } from "react";
import { Sky } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useControls } from "leva";

/**
 * CustomSky
 * - Wraps drei <Sky/> and patches its shader.
 * - Supports:
 *    • darken  [0..1] — multiplies sky RGB by (1 - darken)
 *    • lightning pulses (random or manual trigger) — multiplies by flashGain (>1)
 *
 * Defaults for sky params match Experience.jsx so swapping is seamless.
 */
export default function CustomSky({
  // --- Existing darken knob (night grade) ---
  darken = 0.0,

  // --- ⚡ Lightning: behavior controls (all optional) ---
  lightningEnabled = false, // master toggle
  flashMinDelay = 3.0, // seconds between pulses (min)
  flashMaxDelay = 12.0, // seconds between pulses (max)
  flashPeakGain = 1.6, // peak multiplier on sky (1.0 = none)
  preFlashMs = 40, // small ramp before main flash
  mainFlashMs = 140, // bright punch
  tailMs = 240, // decay window
  flickers = 2, // little spikes in the tail
  flickerDepth = 0.45, // amplitude of the first tail spike (0..1)
  doubleFlashChance = 0.25, // chance of a second pulse ~120ms later

  // --- Preserve your current Sky defaults from Experience.jsx ---
  sunPosition = [5.0, -1.0, 30.0],
  rayleigh = 0.01,
  turbidity = 1.1,
  mieCoefficient = 0.0,
  mieDirectionalG = 0.0,

  // --- New: Height-based haze (fog color blend) ---
  // Fade the sky to a fog color below a world-space Y band.
  // Example for terrain at y=-5:
  //   hazeBottomY=-4 (full fog at/below -4), hazeTopY=-3 (full sky at/above -3)
  hazeEnabled = true,
  hazeBottomY = -4.0,
  hazeTopY = 87.0,
  hazeColor = null, // ignored when scene.fog?.color exists; kept as fallback
  hazePower = 1.0, // curve shaping (>=0.0001)
  hazeFeather = 0.75, // extra softening width (world units)

  // You can pass any other <Sky/> props via ...rest
  ...rest
}) {
  const skyRef = useRef();
  const { scene } = useThree();

  // Resolve haze color (defaults to scene fog color if available)
  const hazeColorRef = useRef(new THREE.Color());
  useEffect(() => {
    if (hazeColor) {
      hazeColorRef.current.set(hazeColor);
    } else if (scene?.fog?.color) {
      hazeColorRef.current.copy(scene.fog.color);
    } else {
      // A sensible cool night fallback
      hazeColorRef.current.set("#223140");
    }
  }, [hazeColor, scene]);

  const {
    hazeEnabled: ctrlHazeEnabled,
    hazeBottomY: ctrlHazeBottomY,
    hazeTopY: ctrlHazeTopY,
    hazeFeather: ctrlHazeFeather,
    hazePower: ctrlHazePower,
  } = useControls("Sky / Haze", {
    hazeEnabled: { value: hazeEnabled },
    hazeBottomY: { value: hazeBottomY, min: -200, max: 200, step: 0.1 },
    hazeTopY: { value: hazeTopY, min: -200, max: 200, step: 0.1 },
    hazeFeather: { value: hazeFeather, min: 0.0, max: 10.0, step: 0.01 },
    hazePower: { value: hazePower, min: 0.25, max: 4.0, step: 0.05 },
  });

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
      const mult = ` * ( 1.0 - clamp(uSkyDarken, 0.0, 1.0) ) * max(uSkyFlashGain, 0.0)`;
      const patA =
        /gl_FragColor\s*=\s*vec4\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*;/m;
      if (patA.test(fs)) {
        fs = fs.replace(patA, `gl_FragColor = vec4( ( $1 )${mult}, $2 );`);
      } else {
        // Pattern B: gl_FragColor = vec4( VEC4 );
        const patB = /gl_FragColor\s*=\s*vec4\s*\(\s*([^)]+)\s*\)\s*;/m;
        if (patB.test(fs)) {
          fs = fs.replace(
            patB,
            `gl_FragColor = vec4( ( $1 ).rgb${mult}, ( $1 ).a );`
          );
        } else {
          // Fallback: inject just before end of main()
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
                // Darken + flash multiplier
                gl_FragColor.rgb *= ( 1.0 - clamp(uSkyDarken, 0.0, 1.0) );
                gl_FragColor.rgb *= max(uSkyFlashGain, 0.0);
                ` +
                fs.slice(i);
            }
          }
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
              // narrative-forest: blend sky with fog color by world-space height
              if (uHazeEnabled > 0.5) {
                // Feather widens the blend range for a smoother transition
                float y0 = min(uHazeBottomY, uHazeTopY);
                float y1 = max(uHazeBottomY, uHazeTopY);
                float t = smoothstep(y0 - uHazeFeather, y1 + uHazeFeather, vNF_WorldY);
                t = pow(t, max(0.0001, uHazePower));
                gl_FragColor.rgb = mix(uHazeColor, gl_FragColor.rgb, t);
              }
              ` +
              fs.slice(i);
          }
        }
      }

      shader.fragmentShader = fs;

      // Keep uniforms reachable from React
      shader.uniforms.uSkyDarken = { value: darken };
      shader.uniforms.uSkyFlashGain = { value: 1.0 };
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
  ]);

  // ──────────────────────────────────────────────────────────────────────────
  // ⚡ Lightning pulse timeline (randomized)
  // ──────────────────────────────────────────────────────────────────────────
  const timeRef = useRef(0);
  const nextFireAtRef = useRef(0);
  const activeRef = useRef(null); // holds current envelope timeline or null

  // Helper to schedule the next lightning start time
  const scheduleNext = (now) => {
    const min = Math.max(0.2, flashMinDelay);
    const max = Math.max(min + 0.1, flashMaxDelay);
    const delay = min + Math.random() * (max - min);
    nextFireAtRef.current = now + delay;
  };

  // Build a tiny envelope (array of segments)
  // Each segment: { dur, amp } ; we interpret as smooth in-out per segment.
  const makeEnvelope = () => {
    const env = [];
    const toSec = (ms) => Math.max(0, ms) / 1000;

    // Pre-flash (soft rise)
    if (preFlashMs > 0) env.push({ dur: toSec(preFlashMs), amp: 0.4 });

    // Main flash (full punch)
    env.push({ dur: toSec(mainFlashMs), amp: 1.0 });

    // Tail flickers (decaying spikes)
    const n = Math.max(0, Math.floor(flickers));
    let amp = Math.max(0, Math.min(1, flickerDepth));
    const tail = Math.max(0, toSec(tailMs));
    for (let i = 0; i < n; i++) {
      const slice = tail / Math.max(1, n);
      env.push({ dur: slice, amp });
      amp *= 0.45; // decay each flicker
    }

    // Optionally chain a double-flash small echo
    const doubleHit = Math.random() < doubleFlashChance;
    if (doubleHit) {
      env.push({ dur: 0.12, amp: 0.55 }); // quick echo
    }

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

    // Lightning logic
    let flashGain = 1.0;

    if (lightningEnabled) {
      const now = timeRef.current;

      // Start a new pulse if time has come
      if (!activeRef.current) {
        if (now >= nextFireAtRef.current) {
          const env = makeEnvelope();
          const duration = env.reduce((a, s) => a + s.dur, 0);
          activeRef.current = { t0: now, env, duration };
        }
      }

      // If active, evaluate envelope
      if (activeRef.current) {
        const { t0, env, duration } = activeRef.current;
        const elapsed = now - t0;
        if (elapsed <= duration) {
          const e = evalEnvelope(env, elapsed); // 0..1
          const peak = Math.max(1.0, flashPeakGain);
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
    // Always sync haze color to scene fog color when available; else fallback
    if (ud?.uHazeColor) {
      if (scene?.fog?.color) {
        ud.uHazeColor.value.copy(scene.fog.color);
      } else {
        ud.uHazeColor.value.copy(hazeColorRef.current);
      }
    }
  });

  return (
    <Sky
      ref={skyRef}
      sunPosition={sunPosition}
      rayleigh={rayleigh}
      turbidity={turbidity}
      mieCoefficient={mieCoefficient}
      mieDirectionalG={mieDirectionalG}
      {...rest}
    />
  );
}
