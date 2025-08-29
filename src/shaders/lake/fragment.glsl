precision highp float;

uniform float uTime;
uniform float uOpacity;

uniform vec3 uTroughColor;
uniform vec3 uSurfaceColor;
uniform vec3 uPeakColor;

uniform float uPeakThreshold;
uniform float uPeakTransition;
uniform float uTroughThreshold;
uniform float uTroughTransition;

uniform float uFresnelScale;
uniform float uFresnelPower;

// Biobluemessence trail uniforms
uniform float uTrailPositions[100]; // maxTrailPoints * 2
uniform float uTrailData[150]; // maxTrailPoints * 3
uniform int uTrailCount;
uniform float uTrailDecayTime;
uniform vec3 uBioBlueColor;
uniform float uBioBlueIntensity;
uniform float uTrailSpreadSpeed;
uniform float uTrailMaxRadius;
uniform float uPulseFrequency;
uniform float uRippleFrequency;

varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform samplerCube uEnvironmentMap;

// Calculate biobluemessence trail intensity
float getBioBlueIntensity(vec2 position) {
  float totalIntensity = 0.0;
  
  for(int i = 0; i < 50; i++) { // maxTrailPoints
    if(i >= uTrailCount) break;
    
    // Get trail data
    vec2 trailPos = vec2(uTrailPositions[i * 2], uTrailPositions[i * 2 + 1]);
    float timestamp = uTrailData[i * 3];
    float intensity = uTrailData[i * 3 + 1];
    float radius = uTrailData[i * 3 + 2];
    
    if(intensity <= 0.0) continue;
    
    // Calculate distance to trail point
    float dist = distance(position, trailPos);
    
    // Create radial falloff
    float radialFactor = 1.0 - smoothstep(0.0, min(radius, uTrailMaxRadius), dist);
    
    // Add pulsing effect
    float pulsePhase = timestamp * uPulseFrequency;
    float pulse = 0.5 + 0.5 * sin(uTime * uPulseFrequency + pulsePhase);
    
    // Create fluid ripple effect
    float ripplePhase = dist * uRippleFrequency - uTime * 2.0 + timestamp;
    float ripple = 0.5 + 0.5 * sin(ripplePhase);
    
    // Add swirling motion for fluid-like appearance
    float swirl = sin(atan(position.y - trailPos.y, position.x - trailPos.x) * 3.0 + uTime + timestamp) * 0.5 + 0.5;
    
    // Combine effects for distorted fluid appearance
    float trailIntensity = intensity * radialFactor * (0.6 + 0.2 * pulse) * (0.7 + 0.2 * ripple) * (0.8 + 0.2 * swirl);
    totalIntensity += trailIntensity;
  }
  
  return min(totalIntensity, 1.0);
}

void main() {
  // Calculate vector from camera to the vertex
  vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
  vec3 reflectedDirection = reflect(viewDirection, vNormal);
  reflectedDirection.x = -reflectedDirection.x;

  // Sample environment map to get the reflected color
  vec4 reflectionColor = textureCube(uEnvironmentMap, reflectedDirection);

  // Calculate fresnel effect
  float fresnel = uFresnelScale * pow(1.0 - clamp(dot(viewDirection, vNormal), 0.0, 1.0), uFresnelPower);

  // Calculate elevation-based color
  float elevation = vWorldPosition.y;

  // Calculate transition factors using smoothstep
  float peakFactor = smoothstep(uPeakThreshold - uPeakTransition, uPeakThreshold + uPeakTransition, elevation);
  float troughFactor = smoothstep(uTroughThreshold - uTroughTransition, uTroughThreshold + uTroughTransition, elevation);

  // Mix between trough and surface colors based on trough transition
  vec3 mixedColor1 = mix(uTroughColor, uSurfaceColor, troughFactor);

  // Mix between surface and peak colors based on peak transition 
  vec3 mixedColor2 = mix(mixedColor1, uPeakColor, peakFactor);

  // Mix the final color with the reflection color
  vec3 baseColor = mix(mixedColor2, reflectionColor.rgb, fresnel);

  // Calculate biobluemessence effect
  vec2 waterPos = vWorldPosition.xz;
  float bioIntensity = getBioBlueIntensity(waterPos);
  
  // Create fluid-like color mixing
  vec3 bioEffect = uBioBlueColor * bioIntensity;
  
  // Mix bio effect with base water color using additive blending for glow
  vec3 finalColor = baseColor + bioEffect * 0.8;
  
  // Add emissive glow for bloom effect
  finalColor += bioEffect * uBioBlueIntensity * 0.5;
  
  // Apply subtle color shift in bio areas
  finalColor = mix(finalColor, finalColor * vec3(0.7, 0.9, 1.2), bioIntensity * 0.3);

  gl_FragColor = vec4(finalColor, uOpacity);
}