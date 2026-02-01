// Shared terrain height function matching heightfield.js exactly
// This module must produce bit-exact results with the CPU version

#ifndef TERRAIN_HEIGHT_GLSL
#define TERRAIN_HEIGHT_GLSL

// Simplex 2D noise implementation (inlined)
vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float simplexNoise2d(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
    -0.577350269189626,
    0.024390243902439
  );

  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  m *= taylorInvSqrt(a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;

  return 130.0 * dot(m, g);
}

// Terrain parameters (must match heightfield.js params)
uniform float uTerrainElevation;
uniform float uTerrainFrequency;
uniform int uTerrainOctaves;
uniform float uTerrainSeed;
uniform float uTerrainScale;
uniform float uTerrainPlateauHeight;
uniform float uTerrainPlateauSmoothing;
uniform float uTerrainBaseHeight;
uniform float uTerrainWorldYOffset;

// fBm function matching heightfield.js fbm()
float terrainFbm(float x, float y, float frequency, int octaves, float seed, float scale) {
  float value = 0.0;
  float amplitude = 0.5;
  float freq = frequency;

  for (int o = 0; o < 8; o++) {
    if (o >= octaves) break;

    value += amplitude * simplexNoise2d(
      vec2((x + seed * 100.0) * freq * scale, (y + seed * 100.0) * freq * scale)
    );

    freq *= 2.0;
    amplitude *= 0.5;
  }

  return value;
}

// Smoothstep matching JS implementation
float terrainSmoothstep(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// Plateauize function matching heightfield.js plateauize()
float terrainPlateauize(float h, float threshold, float smoothing) {
  float low = max(0.0, threshold - smoothing);
  float high = min(1.0, threshold + smoothing);
  
  if (h < low || h > high) {
    return h;
  }
  
  float n = (h - low) / (high - low);
  return low + (h - low) * terrainSmoothstep(0.0, 1.0, n);
}

// Main height function matching heightfield.js heightAt()
// CRITICAL: Uses (x, -z) to mirror Z like the rotated plane did
float terrainHeightAt(float xWorld, float zWorld) {
  // fbm with (x, -z) mirroring
  float d = terrainFbm(
    xWorld,
    -zWorld,
    uTerrainFrequency,
    uTerrainOctaves,
    uTerrainSeed,
    uTerrainScale
  ) * uTerrainElevation;

  // Plateauize
  float n = terrainPlateauize(
    d / uTerrainElevation,
    uTerrainPlateauHeight,
    uTerrainPlateauSmoothing
  ) * uTerrainElevation;

  // Final: abs(n) + baseHeight + worldYOffset
  return abs(n) + uTerrainBaseHeight + uTerrainWorldYOffset;
}

#endif
