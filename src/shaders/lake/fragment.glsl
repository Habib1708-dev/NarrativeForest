precision highp float;

uniform float uOpacity;
uniform float uTime;

uniform vec3 uTroughColor;
uniform vec3 uSurfaceColor;
uniform vec3 uPeakColor;

uniform float uPeakThreshold;
uniform float uPeakTransition;
uniform float uTroughThreshold;
uniform float uTroughTransition;

uniform float uFresnelScale;
uniform float uFresnelPower;

// Environment map removed - not used in this project
// Bioluminescent dye system removed - not used in this project

varying vec3 vNormalW;
varying vec3 vWorldPosition;

void main(){
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vWorldPosition - cameraPosition);

  // Environment map lookups removed - not used in this project
  // Reflection effect removed to improve performance
  // Using simple fresnel-based color blending instead

  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = uFresnelScale * pow(1.0 - NoV, uFresnelPower);

  float elevation = vWorldPosition.y;
  float peak   = smoothstep(uPeakThreshold - uPeakTransition,   uPeakThreshold + uPeakTransition,   elevation);
  float trough = smoothstep(uTroughThreshold - uTroughTransition, uTroughThreshold + uTroughTransition, elevation);

  vec3 base1 = mix(uTroughColor, uSurfaceColor, trough);
  vec3 base2 = mix(base1,        uPeakColor,    peak);
  // Simple fresnel effect: blend towards a lighter color based on viewing angle
  vec3 fresnelColor = mix(base2, uSurfaceColor, fresnel * 0.3);
  vec3 finalColor = fresnelColor;

  // Bioluminescent dye system removed - not used in this project

  gl_FragColor = vec4(finalColor, uOpacity);
}