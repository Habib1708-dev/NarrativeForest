// src/post/IntroSmokeEffect.jsx
import { forwardRef, useMemo, useEffect, useState } from "react";
import { Uniform } from "three";
import { Effect } from "postprocessing";

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uDensity;

  // Smooth value noise — low frequency only
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Quintic interpolation for extra smoothness
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // FBM: only 3 octaves, all low frequency — no fine detail that can alias
  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.55;
    float freq = 1.0;
    for (int i = 0; i < 3; i++) {
      value += amp * noise(p * freq);
      freq *= 1.9;
      amp *= 0.45;
    }
    return value;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (uDensity <= 0.001) {
      outputColor = inputColor;
      return;
    }

    float t = uTime * 0.3;

    // Two large-scale layers only — low UV multiplier keeps everything smooth
    vec2 p1 = uv * 1.8 + vec2(t * 0.5, t * 0.3);
    float n1 = fbm(p1);

    vec2 p2 = uv * 2.5 + vec2(-t * 0.35, t * 0.45);
    float n2 = fbm(p2 + n1 * 0.5);

    // Combine into smooth per-pixel fog thickness (0–1)
    float fog = n1 * 0.6 + n2 * 0.4;

    // Remap so fog varies between thin and thick patches
    // At uDensity=1.0: ranges roughly 0.3–0.85 (world visible through thin spots)
    // As uDensity drops: everything fades toward 0
    float thickness = smoothstep(0.15, 0.7, fog) * 0.85 * uDensity;

    // Fog color with gentle internal variation
    vec3 fogColor = mix(
      vec3(0.07, 0.08, 0.09),
      vec3(0.16, 0.15, 0.14),
      fog
    );

    outputColor = vec4(mix(inputColor.rgb, fogColor, thickness), inputColor.a);
  }
`;

class IntroSmokeEffectImpl extends Effect {
  constructor() {
    super("IntroSmokeEffect", fragmentShader, {
      uniforms: new Map([
        ["uTime", new Uniform(0)],
        ["uDensity", new Uniform(1.0)],
      ]),
    });
  }

  update(renderer, inputBuffer, deltaTime) {
    this.uniforms.get("uTime").value += deltaTime;
  }
}

/**
 * React wrapper — smoke starts dense, dissipates gradually as the user scrolls
 * after clicking Explore.
 */
export const IntroSmokeEffect = forwardRef(function IntroSmokeEffect(_, ref) {
  const effect = useMemo(() => new IntroSmokeEffectImpl(), []);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = false;   // becomes true after Explore is clicked
    let density = 1.0;

    const onExplore = () => {
      active = true;
    };

    const onScroll = (e) => {
      if (!active) return;

      // Each scroll tick reduces density — abs() so both directions work
      const scrollAmount = Math.abs(e.deltaY) / 800;
      density = Math.max(0, density - scrollAmount);
      effect.uniforms.get("uDensity").value = density;

      if (density <= 0) {
        setDone(true);
      }
    };

    window.addEventListener("explore-button-clicked", onExplore);
    window.addEventListener("wheel", onScroll, { passive: true });

    return () => {
      window.removeEventListener("explore-button-clicked", onExplore);
      window.removeEventListener("wheel", onScroll);
    };
  }, [effect]);

  if (done) return null;

  return <primitive ref={ref} object={effect} dispose={null} />;
});

IntroSmokeEffect.displayName = "IntroSmokeEffect";
