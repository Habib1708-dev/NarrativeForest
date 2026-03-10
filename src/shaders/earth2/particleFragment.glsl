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
  float safeDistance = max(distanceToCenter, 0.0001);

  float alphaSolid =
    (1.0 - step(uSolidRatio * 0.5, distanceToCenter)) * uSolidAlpha;

  float alphaGlow = (uGlowSpread / safeDistance) - (uGlowSpread * 2.0);
  alphaGlow *= (1.0 - alphaSolid);

  float alpha = max(alphaGlow, alphaSolid) * uOpacity;

  float sparkleLife = mod(uTime * uSparklingFrequency, 1.0);
  float window = uSparklingDuration * uSparklingFrequency * 0.5;
  float diff = mod(sparkleLife - vPhase + 0.5, 1.0) - 0.5;
  float sparkle = step(abs(diff), window);
  alpha *= (sparkle * uSparklingAlpha + 1.0);

  if (alpha <= 0.001) discard;

  gl_FragColor = vec4(uColor, alpha);
}
