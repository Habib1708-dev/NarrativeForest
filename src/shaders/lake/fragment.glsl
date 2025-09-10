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

uniform samplerCube uEnvironmentMap;

// Bioluminescent dye + stamp (age) maps
uniform sampler2D uTrailMap;      // R: dye intensity 0..1
uniform sampler2D uStampMap;      // R: last-write time in seconds

// NEW (Step 2): texel size for uTrailMap/uStampMap (1/size, 1/size)
uniform vec2 uTrailTexel;

uniform vec3  uBioColorA;
uniform vec3  uBioColorB;
uniform float uBioIntensity;      // emissive boost multiplier
uniform float uBioAltFreq;        // radians per second of age
uniform float uBioAltPhase;       // phase offset in radians

varying vec3 vNormalW;
varying vec3 vWorldPosition;
varying vec2 vUv0;

void main(){
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vWorldPosition - cameraPosition);

  // keep existing handedness hack for reflections (we'll fix in Step 4)
  vec3 R = reflect(V, N);
  R.x = -R.x;

  vec3 reflection = textureCube(uEnvironmentMap, R).rgb;

  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = uFresnelScale * pow(1.0 - NoV, uFresnelPower);

  float elevation = vWorldPosition.y;
  float peak   = smoothstep(uPeakThreshold - uPeakTransition,   uPeakThreshold + uPeakTransition,   elevation);
  float trough = smoothstep(uTroughThreshold - uTroughTransition, uTroughThreshold + uTroughTransition, elevation);

  vec3 base1 = mix(uTroughColor, uSurfaceColor, trough);
  vec3 base2 = mix(base1,        uPeakColor,    peak);
  vec3 baseColor = mix(base2, reflection, fresnel);

  // --- Bioluminescent dye sampling (soft watercolor look) ---
  // REPLACED: vec2 texel = 1.0 / vec2(textureSize(uTrailMap, 0));
  vec2 texel = uTrailTexel;
  float d0 = texture2D(uTrailMap, vUv0).r * 0.36;
  float d1 = texture2D(uTrailMap, vUv0 + vec2( texel.x, 0.0)).r * 0.16;
  float d2 = texture2D(uTrailMap, vUv0 + vec2(-texel.x, 0.0)).r * 0.16;
  float d3 = texture2D(uTrailMap, vUv0 + vec2(0.0,  texel.y)).r * 0.16;
  float d4 = texture2D(uTrailMap, vUv0 + vec2(0.0, -texel.y)).r * 0.16;
  float dye = clamp(d0 + d1 + d2 + d3 + d4, 0.0, 1.0);

  // --- Alternation between two colors along the trail's age ---
  float stamp = texture2D(uStampMap, vUv0).r;
  float ageSec = max(uTime - stamp, 0.0);

  float w = 0.5 + 0.5 * sin(ageSec * uBioAltFreq + uBioAltPhase);
  vec3 dyeColor = mix(uBioColorA, uBioColorB, w);

  vec3 emission = dyeColor * (dye * uBioIntensity);
  vec3 finalColor = baseColor + emission;

  gl_FragColor = vec4(finalColor, uOpacity);
}
