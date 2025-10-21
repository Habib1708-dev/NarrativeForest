// src/post/NoiseJitterEffect.jsx
import { forwardRef, useMemo } from "react";
import { Uniform } from "three";
import { Effect } from "postprocessing";

/**
 * NoiseJitterEffect — adds film grain noise overlay
 * Creates a subtle grainy texture like analog film
 */

const fragmentShader = /* glsl */ `
  uniform float uGrainStrength;
  uniform float uGrainSize;
  uniform float uTime;

  // High-frequency random function for grain
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Create grain coordinates with time offset for animation
    vec2 grainCoord = uv * uGrainSize;
    grainCoord += vec2(uTime * 0.5, uTime * 0.7); // Slow drift
    
    // Generate grain noise
    float grain = random(grainCoord);
    
    // Add some variation with second layer
    grain += random(grainCoord + vec2(0.5, 0.5)) * 0.5;
    grain *= 0.666; // Normalize
    
    // Center around 0.5 and scale by strength
    grain = (grain - 0.5) * uGrainStrength;
    
    // Apply grain to the image
    vec3 grainyColor = inputColor.rgb + vec3(grain);
    
    outputColor = vec4(grainyColor, inputColor.a);
  }
`;

class NoiseJitterEffectImpl extends Effect {
  constructor({ grainStrength = 0.2, grainSize = 0.4 } = {}) {
    super("NoiseJitterEffect", fragmentShader, {
      uniforms: new Map([
        ["uGrainStrength", new Uniform(grainStrength)],
        ["uGrainSize", new Uniform(grainSize)],
        ["uTime", new Uniform(0)],
      ]),
    });

    this.grainStrength = grainStrength;
    this.grainSize = grainSize;
  }

  update(renderer, inputBuffer, deltaTime) {
    this.uniforms.get("uTime").value += deltaTime;
  }
}

/**
 * React wrapper for NoiseJitterEffect (now grain effect)
 */
export const NoiseJitterEffect = forwardRef(
  ({ grainStrength, grainSize }, ref) => {
    const effect = useMemo(
      () =>
        new NoiseJitterEffectImpl({
          grainStrength,
          grainSize,
        }),
      [grainStrength, grainSize]
    );

    return <primitive ref={ref} object={effect} dispose={null} />;
  }
);

NoiseJitterEffect.displayName = "NoiseJitterEffect";
