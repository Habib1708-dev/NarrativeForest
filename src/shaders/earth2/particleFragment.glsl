uniform vec3 uColor;
uniform float uOpacity;
uniform float uSolidRatio;
uniform float uSolidAlpha;
uniform float uGlowSpread;
uniform float uTime;
uniform float uSparklingAlpha;
uniform float uSparklingFrequency;
uniform float uSparklingDuration;

varying float vPhase;

void main() {
  vec2 centeredUv = gl_PointCoord - vec2(0.5);
  float distanceToCenter = length(centeredUv);
  if (distanceToCenter >= 0.5) discard;

  float coreRadius = max(uSolidRatio * 0.5, 0.02);
  float glowRadius = min(0.5, coreRadius + max(uGlowSpread, 0.01) * 6.0);
  float alphaSolid =
    (1.0 - smoothstep(max(coreRadius - 0.08, 0.0), coreRadius, distanceToCenter)) *
    uSolidAlpha;
  float alphaGlow =
    1.0 - smoothstep(max(coreRadius * 0.65, 0.0), glowRadius, distanceToCenter);
  float edgeFade = 1.0 - smoothstep(0.42, 0.5, distanceToCenter);
  float alpha = max(alphaGlow * 0.85, alphaSolid) * edgeFade * uOpacity;

  float sparkleLife = mod(uTime * uSparklingFrequency, 1.0);
  float window = uSparklingDuration * uSparklingFrequency * 0.5;
  float diff = mod(sparkleLife - vPhase + 0.5, 1.0) - 0.5;
  float sparkle = step(abs(diff), window);
  alpha *= (sparkle * uSparklingAlpha + 1.0);

  if (alpha <= 0.001) discard;

  gl_FragColor = vec4(uColor, alpha);
}
