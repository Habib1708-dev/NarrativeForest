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
uniform vec2      uTrailTexel;    // 1/size for trail RTs

// Lake base height to make thresholds local (works with your coordinates)
uniform float uLakeBaseY;

// Alternating color controls
uniform vec3  uBioColorA;
uniform vec3  uBioColorB;
uniform float uBioIntensity;      // emissive boost multiplier
uniform float uBioAltFreq;        // radians per second of age
uniform float uBioAltPhase;       // phase offset in radians

varying vec3 vNormalW;            // world-space normal
varying vec3 vWorldPosition;      // world-space position
varying vec2 vUv0;                // UV for trail maps

void main(){
  // Proper view & reflection vectors + backface fix for DoubleSide
  vec3 N = normalize(vNormalW);
  if (!gl_FrontFacing) N = -N;

  vec3 V = normalize(cameraPosition - vWorldPosition); // surface -> camera
  vec3 R = reflect(-V, N);                              // incident is -V

  vec3 reflection = textureCube(uEnvironmentMap, R).rgb;

  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = uFresnelScale * pow(1.0 - NoV, uFresnelPower);

  // Local elevation relative to lake Y, so thresholds around 0 make sense
  float elevLocal = vWorldPosition.y - uLakeBaseY;

  // Elevation-based color ramp
  float peak   = smoothstep(uPeakThreshold   - uPeakTransition,   uPeakThreshold   + uPeakTransition,   elevLocal);
  float trough = smoothstep(uTroughThreshold - uTroughTransition, uTroughThreshold + uTroughTransition, elevLocal);

  vec3 base1 = mix(uTroughColor, uSurfaceColor, trough);
  vec3 base2 = mix(base1,        uPeakColor,    peak);
  vec3 baseColor = mix(base2, reflection, fresnel);

  // Dye sampling (soft 5-tap watercolor)
  vec2 t = uTrailTexel;
  float d0 = texture2D(uTrailMap, vUv0).r * 0.36;
  float d1 = texture2D(uTrailMap, vUv0 + vec2( t.x, 0.0)).r * 0.16;
  float d2 = texture2D(uTrailMap, vUv0 + vec2(-t.x, 0.0)).r * 0.16;
  float d3 = texture2D(uTrailMap, vUv0 + vec2(0.0,  t.y)).r * 0.16;
  float d4 = texture2D(uTrailMap, vUv0 + vec2(0.0, -t.y)).r * 0.16;
  float dye = clamp(d0 + d1 + d2 + d3 + d4, 0.0, 1.0);

  // Age & color alternation
  float stamp  = texture2D(uStampMap, vUv0).r;
  float ageSec = max(uTime - stamp, 0.0);

  float w = 0.5 + 0.5 * sin(ageSec * uBioAltFreq + uBioAltPhase);
  vec3 dyeColor = mix(uBioColorA, uBioColorB, w);

  // Prettier emission shaping (from previous step)
  float glow = pow(dye, 1.6);
  float freshness = 1.0 - clamp(ageSec / 0.7, 0.0, 1.0);
  float freshBoost = mix(0.6, 1.4, freshness);
  vec3 emission = dyeColor * (glow * freshBoost * uBioIntensity);

  vec3 finalColor = baseColor + emission;
  gl_FragColor = vec4(finalColor, uOpacity);
}
