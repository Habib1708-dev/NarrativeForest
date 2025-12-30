# Lake Component Optimization Guide

## Overview

This guide provides specific, actionable recommendations for optimizing the Lake component's two main performance bottlenecks:
1. **Noise Calculations** (Vertex Shader)
2. **Texture Lookups in Dye System** (Fragment Shader)

---

## 1. Noise Calculation Optimization

### 1.1 Current Performance Issue

**The Problem:**
- Each vertex calls `getElevation()` **3 times**:
  1. Once for the main position displacement
  2. Once for normal calculation in X direction (`elev_dx`)
  3. Once for normal calculation in Z direction (`elev_dz`)
- Each `getElevation()` call does `uWavesIterations` (default: 3) noise evaluations
- **Total: 3 calls × 3 iterations = 9 noise evaluations per vertex**
- For 19,881 vertices: **178,929 noise evaluations per frame!**

**Current Code:**
```glsl
// Main elevation
float elev = getElevation(wp.x, wp.z);  // 3 noise calls

// Normal calculation (finite difference)
float elev_dx = getElevation(wp.x - eps, wp.z);  // 3 more noise calls
float elev_dz = getElevation(wp.x, wp.z - eps);  // 3 more noise calls
```

### 1.2 Optimization Strategies

#### Strategy 1: Reduce Iterations for Normal Calculation (Easiest)

**Approach:** Normals don't need as much detail as the main displacement. Use fewer iterations for normal calculations.

**Implementation:**
```glsl
// Add a new uniform for normal iterations
uniform float uWavesIterationsNormal;  // e.g., 2 instead of 3

// Create a separate function for normal calculation
float getElevationNormal(float x, float z){
  float elevation = 0.0;
  float amplitude = 1.0;
  float frequency = uWavesFrequency;
  vec2 p = vec2(x, z);
  for (float i = 0.0; i < 32.0; i += 1.0) {
    if (i >= uWavesIterationsNormal) break;  // Use fewer iterations
    float n = snoise(p * frequency + uTime * uWavesSpeed);
    elevation += amplitude * n;
    amplitude *= uWavesPersistence;
    frequency *= uWavesLacunarity;
  }
  return elevation * uWavesAmplitude;
}

// In main():
float elev = getElevation(wp.x, wp.z);  // 3 iterations
float elev_dx = getElevationNormal(wp.x - eps, wp.z);  // 2 iterations
float elev_dz = getElevationNormal(wp.x, wp.z - eps);  // 2 iterations
```

**Performance Gain:**
- Before: 3 + 3 + 3 = 9 noise calls per vertex
- After: 3 + 2 + 2 = 7 noise calls per vertex
- **Reduction: 22% fewer noise evaluations**
- **For 19,881 vertices: 39,762 fewer noise calls per frame**

#### Strategy 2: Approximate Normals with Analytical Derivatives (Best Performance)

**Approach:** Instead of using finite differences (which requires 2 extra noise calls), calculate normals analytically from the noise function itself.

**Implementation:**
```glsl
// Calculate elevation and its partial derivatives in one pass
vec3 getElevationAndGradient(float x, float z){
  float elevation = 0.0;
  float dElev_dx = 0.0;
  float dElev_dz = 0.0;
  float amplitude = 1.0;
  float frequency = uWavesFrequency;
  vec2 p = vec2(x, z);
  
  for (float i = 0.0; i < 32.0; i += 1.0) {
    if (i >= uWavesIterations) break;
    
    // Sample noise at 3 points for gradient (or use analytical gradient if available)
    float eps = 0.001;
    float n0 = snoise(p * frequency + uTime * uWavesSpeed);
    float nx = snoise((p + vec2(eps, 0.0)) * frequency + uTime * uWavesSpeed);
    float nz = snoise((p + vec2(0.0, eps)) * frequency + uTime * uWavesSpeed);
    
    float n = n0;
    dElev_dx += (nx - n0) / eps * amplitude;
    dElev_dz += (nz - n0) / eps * amplitude;
    elevation += amplitude * n;
    
    amplitude *= uWavesPersistence;
    frequency *= uWavesLacunarity;
  }
  
  return vec3(elevation * uWavesAmplitude, dElev_dx * uWavesAmplitude, dElev_dz * uWavesAmplitude);
}

// In main():
vec3 elevData = getElevationAndGradient(wp.x, wp.z);
float elev = elevData.x;
float dElev_dx = elevData.y;
float dElev_dz = elevData.z;
```

**Note:** This still does 3 noise calls per iteration, but they're in the same loop, which can be more cache-friendly. However, a better approach is:

#### Strategy 3: Use Simpler Noise for Normals (Recommended)

**Approach:** Use a faster, simpler noise function just for normal calculation.

**Implementation:**
```glsl
// Simple 2D hash-based noise (much faster than Simplex)
float fastNoise(vec2 p){
  p = fract(p * 0.3183099 + vec2(0.1, 0.2));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

float getElevationFast(float x, float z){
  float elevation = 0.0;
  float amplitude = 1.0;
  float frequency = uWavesFrequency;
  vec2 p = vec2(x, z);
  for (float i = 0.0; i < 32.0; i += 1.0) {
    if (i >= uWavesIterations) break;
    float n = fastNoise(p * frequency + uTime * uWavesSpeed);
    elevation += amplitude * n;
    amplitude *= uWavesPersistence;
    frequency *= uWavesLacunarity;
  }
  return elevation * uWavesAmplitude;
}

// In main():
float elev = getElevation(wp.x, wp.z);  // Full quality Simplex noise
float elev_dx = getElevationFast(wp.x - eps, wp.z);  // Fast noise
float elev_dz = getElevationFast(wp.x, wp.z - eps);  // Fast noise
```

**Performance Gain:**
- Fast noise is ~3-5× faster than Simplex noise
- **Reduction: ~40-60% fewer GPU cycles for normal calculation**
- Visual quality: Normals are slightly less detailed, but usually imperceptible

#### Strategy 4: Distance-Based LOD (Best for Overall Performance)

**Approach:** Reduce iterations when camera is far from the lake.

**Implementation (in Lake.jsx):**
```javascript
// Add camera distance calculation
const { camera } = useThree();
const lakeDistance = useRef(0);

useFrame(() => {
  if (meshRef.current) {
    const lakePos = new THREE.Vector3(...lakePosition);
    lakeDistance.current = camera.position.distanceTo(lakePos);
  }
});

// Calculate dynamic iterations based on distance
const dynamicIterations = useMemo(() => {
  const dist = lakeDistance.current;
  if (dist > 50) return 2;      // Far: 2 iterations
  if (dist > 25) return 2.5;     // Medium: 2-3 iterations
  return 3;                       // Close: 3 iterations (default)
}, [lakeDistance.current]);

// Update uniform
useEffect(() => {
  updateUniform("uWavesIterations", Math.floor(dynamicIterations));
}, [dynamicIterations, updateUniform]);
```

**Performance Gain:**
- At distance > 50: 33% reduction in iterations
- **Reduction: 33% fewer noise evaluations when far**

### 1.3 Recommended Implementation

**Best Approach: Combine Strategies 1 + 3 + 4**

1. Use fewer iterations for normals (Strategy 1)
2. Use fast noise for normals (Strategy 3)
3. Add distance-based LOD (Strategy 4)

**Expected Total Reduction: 50-70% fewer noise evaluations**

---

## 2. Dye System Texture Lookup Optimization

### 2.1 Current Performance Issue

**The Problem:**
The bioluminescent dye system does **5 texture lookups per fragment** to create a "soft watercolor look":

```glsl
// Current code (5 texture lookups):
float d0 = texture2D(uTrailMap, vUv0).r * 0.36;                    // Center
float d1 = texture2D(uTrailMap, vUv0 + vec2( texel.x, 0.0)).r * 0.16;  // Right
float d2 = texture2D(uTrailMap, vUv0 + vec2(-texel.x, 0.0)).r * 0.16;  // Left
float d3 = texture2D(uTrailMap, vUv0 + vec2(0.0,  texel.y)).r * 0.16;  // Up
float d4 = texture2D(uTrailMap, vUv0 + vec2(0.0, -texel.y)).r * 0.16;  // Down
float dye = clamp(d0 + d1 + d2 + d3 + d4, 0.0, 1.0);
```

**What This Does:**
- Samples the trail map at 5 positions (center + 4 neighbors)
- Weights them: center 36%, each neighbor 16%
- This creates a **5-tap blur filter** for smooth dye edges

**Performance Cost:**
- For 1M fragments: **5 million texture lookups per frame**
- Each texture lookup: ~10-20 GPU cycles
- **Total: ~50-100 million GPU cycles per frame**

### 2.2 Optimization Strategies

#### Strategy 1: Reduce Sample Count (Simplest)

**Option A: Center Only (Fastest)**
```glsl
// Just use center sample (1 lookup instead of 5)
float dye = texture2D(uTrailMap, vUv0).r;
```

**Performance Gain:**
- **80% reduction** (5 → 1 lookups)
- **Visual Impact:** Sharper edges, less smooth

**Option B: Center + 2 Neighbors (Balanced)**
```glsl
// Use center + horizontal neighbors (3 lookups)
float d0 = texture2D(uTrailMap, vUv0).r * 0.5;
float d1 = texture2D(uTrailMap, vUv0 + vec2( texel.x, 0.0)).r * 0.25;
float d2 = texture2D(uTrailMap, vUv0 + vec2(-texel.x, 0.0)).r * 0.25;
float dye = clamp(d0 + d1 + d2, 0.0, 1.0);
```

**Performance Gain:**
- **40% reduction** (5 → 3 lookups)
- **Visual Impact:** Slightly less smooth, but usually acceptable

#### Strategy 2: Use Texture Filtering Instead (Best Quality/Performance)

**Approach:** Let the GPU's built-in texture filtering do the blurring instead of manual sampling.

**Implementation:**
```glsl
// Use GL_LINEAR filtering with slightly offset UVs
// This leverages GPU's bilinear interpolation
vec2 blurOffset = texel * 0.5;  // Half texel offset
float dye = texture2D(uTrailMap, vUv0).r;
// The GPU's linear filtering already smooths between texels
```

**But wait - this doesn't give us the blur effect we want. Better approach:**

**Use Mipmaps or Pre-blurred Texture:**
- Generate a pre-blurred version of the trail map
- Sample from the blurred version
- **1 lookup instead of 5**

**Or use texture filtering with multiple samples at different offsets:**
```glsl
// Sample at 4 corners of a small quad, let GPU interpolate
vec2 offset = texel * 0.5;
float d0 = texture2D(uTrailMap, vUv0 + vec2(-offset.x, -offset.y)).r;
float d1 = texture2D(uTrailMap, vUv0 + vec2( offset.x, -offset.y)).r;
float d2 = texture2D(uTrailMap, vUv0 + vec2(-offset.x,  offset.y)).r;
float d3 = texture2D(uTrailMap, vUv0 + vec2( offset.x,  offset.y)).r;
float dye = (d0 + d1 + d2 + d3) * 0.25;  // Average of 4 corners
```

**Performance Gain:**
- **20% reduction** (5 → 4 lookups)
- **Visual Impact:** Similar quality

#### Strategy 3: Reduce Texture Resolution (Memory + Performance)

**Current:** 128×128 textures
**Optimized:** 64×64 textures

**Implementation (in Lake.jsx):**
```javascript
// Change texture size from 128 to 64
const emptyTexture = useMemo(() => {
  const t = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1,
    1,
    THREE.RGBAFormat
  );
  t.needsUpdate = true;
  return t;
}, []);

// Update texel size uniform
useEffect(() => {
  updateUniform("uTrailTexel", new THREE.Vector2(1 / 64, 1 / 64));
}, [updateUniform]);
```

**Performance Gain:**
- **75% less texture memory** (128² → 64² = 4× smaller)
- **Better texture cache utilization**
- **Faster texture lookups** (smaller textures = better cache hits)

#### Strategy 4: Conditional Blur (Distance-Based)

**Approach:** Use full 5-tap blur when close, reduce when far.

**Implementation:**
```glsl
// Add uniform for blur quality
uniform float uBlurQuality;  // 0.0 = no blur, 1.0 = full blur

// In fragment shader:
float dye;
if (uBlurQuality > 0.5) {
  // Full 5-tap blur
  float d0 = texture2D(uTrailMap, vUv0).r * 0.36;
  float d1 = texture2D(uTrailMap, vUv0 + vec2( texel.x, 0.0)).r * 0.16;
  float d2 = texture2D(uTrailMap, vUv0 + vec2(-texel.x, 0.0)).r * 0.16;
  float d3 = texture2D(uTrailMap, vUv0 + vec2(0.0,  texel.y)).r * 0.16;
  float d4 = texture2D(uTrailMap, vUv0 + vec2(0.0, -texel.y)).r * 0.16;
  dye = clamp(d0 + d1 + d2 + d3 + d4, 0.0, 1.0);
} else if (uBlurQuality > 0.0) {
  // Reduced 3-tap blur
  float d0 = texture2D(uTrailMap, vUv0).r * 0.5;
  float d1 = texture2D(uTrailMap, vUv0 + vec2( texel.x, 0.0)).r * 0.25;
  float d2 = texture2D(uTrailMap, vUv0 + vec2(-texel.x, 0.0)).r * 0.25;
  dye = clamp(d0 + d1 + d2, 0.0, 1.0);
} else {
  // No blur
  dye = texture2D(uTrailMap, vUv0).r;
}
```

**In Lake.jsx:**
```javascript
// Calculate blur quality based on distance
const blurQuality = useMemo(() => {
  const dist = lakeDistance.current;
  if (dist > 30) return 0.0;      // Far: no blur
  if (dist > 15) return 0.5;     // Medium: reduced blur
  return 1.0;                     // Close: full blur
}, [lakeDistance.current]);

useEffect(() => {
  updateUniform("uBlurQuality", blurQuality);
}, [blurQuality, updateUniform]);
```

**Performance Gain:**
- When far (>30 units): **80% reduction** (5 → 1 lookups)
- When medium (15-30 units): **40% reduction** (5 → 3 lookups)
- When close (<15 units): No change (full quality)

### 2.3 Recommended Implementation

**Best Approach: Combine Strategies 1B + 3 + 4**

1. Use center + 2 neighbors (Strategy 1B) as default
2. Reduce texture resolution to 64×64 (Strategy 3)
3. Add distance-based blur quality (Strategy 4)

**Expected Total Reduction: 40-80% fewer texture lookups (depending on distance)**

---

## 3. Implementation Priority

### High Priority (Easy Wins)
1. ✅ **Reduce texture resolution** (128→64) - Easy, big impact
2. ✅ **Use fewer iterations for normals** - Easy, good impact
3. ✅ **Center + 2 neighbors for dye** - Easy, acceptable quality

### Medium Priority (Better Performance)
4. **Fast noise for normals** - Moderate effort, good impact
5. **Distance-based LOD** - Moderate effort, scales well

### Low Priority (Polish)
6. **Conditional blur quality** - More complex, but best quality/performance balance

---

## 4. Expected Performance Gains

### Current Performance
- **Noise evaluations**: 178,929 per frame
- **Texture lookups**: ~5M per frame (1M fragments)
- **Total GPU time**: ~1.5-7ms per frame

### After Optimizations
- **Noise evaluations**: ~70,000-90,000 per frame (50-60% reduction)
- **Texture lookups**: ~1-3M per frame (40-80% reduction)
- **Total GPU time**: ~0.5-3ms per frame (50-70% reduction)

---

## 5. Code Examples

See the implementation files for complete code examples of each optimization strategy.

---

*Generated: Detailed optimization guide for Lake component noise and texture lookups*

