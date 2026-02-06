# Bloom Effect Optimization Guide

## Overview

This guide explains how to optimize the Bloom post-processing effect for better performance while maintaining acceptable visual quality. Bloom is one of the most expensive post-processing effects, typically costing 5-15ms per frame.

## Current Configuration

The project currently uses:
```jsx
<Bloom
  intensity={1.35}
  luminanceThreshold={0.7}
  luminanceSmoothing={0.08}
  kernelSize={KernelSize.LARGE}  // Most expensive option
  mipmapBlur                     // Adds additional overhead
/>
```

---

## What is Kernel Size?

### Definition

**Kernel Size** determines the **blur radius** or **spread distance** of the bloom effect. It controls how far the glowing light "bleeds" outward from bright areas in the scene.

### Technical Explanation

Kernel size refers to the size of the convolution kernel (filter) used in the Gaussian blur pass of the bloom effect. A larger kernel means:

1. **More blur samples**: The GPU needs to sample more pixels around each bright area
2. **Larger blur radius**: The glow spreads further from the source
3. **More processing**: Each pixel requires more calculations
4. **Higher memory bandwidth**: More texture reads from the GPU memory

### Visual Impact

- **Small Kernel**: Tight, focused glow around bright objects
- **Medium Kernel**: Moderate glow that spreads a reasonable distance
- **Large Kernel**: Wide, atmospheric glow that spreads far from bright areas
- **Huge Kernel**: Very wide, dreamy glow that creates strong atmospheric effects

### Performance Impact

Larger kernel sizes require exponentially more work because:
- The blur operation needs to sample pixels in a circular/spherical pattern
- Larger radius = more pixels to sample per bright area
- More GPU texture lookups and calculations per frame

---

## Kernel Size Options

### Available Sizes (from `postprocessing` library)

| Kernel Size | Blur Radius | Performance Cost | Visual Quality | Use Case |
|-------------|-------------|------------------|----------------|----------|
| `VERY_SMALL` | ~2-3 pixels | ~1-2ms | Tight glow | Subtle highlights |
| `SMALL` | ~4-6 pixels | ~2-4ms | Focused glow | Small light sources |
| `MEDIUM` | ~8-12 pixels | ~4-7ms | Moderate glow | Balanced quality/performance |
| `LARGE` | ~16-24 pixels | ~7-12ms | Wide glow | Atmospheric scenes (current) |
| `HUGE` | ~32+ pixels | ~12-20ms | Very wide glow | Extreme atmospheric effects |

### Current Setting: LARGE

The project uses `KernelSize.LARGE`, which provides wide, atmospheric glow but at a high performance cost (7-12ms per frame).

---

## Optimization Strategies

### 1. Reduce Kernel Size (Highest Impact)

**Strategy**: Use a smaller kernel size for faster performance.

**Options**:
- `KernelSize.MEDIUM` - Balanced (recommended starting point)
- `KernelSize.SMALL` - More performance, tighter glow
- `KernelSize.VERY_SMALL` - Maximum performance, minimal glow

**Expected Performance Gain**: 40-70% improvement depending on size reduction

**Visual Trade-off**: Glow will be tighter/closer to bright objects, less atmospheric spread

### 2. Disable MipmapBlur

**What it does**: `mipmapBlur` uses pre-generated mipmap levels for additional blur passes, creating smoother bloom.

**Performance Cost**: ~1-3ms extra per frame

**Recommendation**: Remove `mipmapBlur` for immediate 1-3ms savings with minimal visual difference in most cases.

### 3. Use Resolution Scaling

**What it does**: Renders the bloom effect at a lower resolution, then upscales it.

**How to implement**: Add `resolutionScale={0.5}` prop

**Performance Gain**: 
- `0.5` (half resolution): ~60-75% improvement
- `0.75` (75% resolution): ~30-40% improvement

**Visual Impact**: Slightly softer bloom, but often barely noticeable

**Example**:
```jsx
<Bloom
  resolutionScale={0.5}  // Render at 50% resolution
  // ... other props
/>
```

### 4. Adjust Intensity and Threshold

**Intensity**: Controls how bright the bloom appears
- Lower values = less bloom = slightly better performance
- Current: `1.35`
- Recommended: `1.0` to `1.2`

**Luminance Threshold**: Controls what brightness level triggers bloom
- Higher values = fewer pixels bloom = better performance
- Current: `0.7` (pixels brighter than 70% get bloomed)
- Recommended: `0.75` to `0.8`

---

## Recommended Optimized Configurations

### Option 1: Balanced (Recommended Starting Point)

**Best for**: Most scenes, good quality/performance balance

```jsx
<Bloom
  intensity={1.2}
  luminanceThreshold={0.75}
  luminanceSmoothing={0.08}
  kernelSize={KernelSize.MEDIUM}
  resolutionScale={0.5}
/>
```

**Performance**: ~3-4ms (down from 7-12ms)
**Improvement**: ~60-65% faster
**Visual Quality**: High (slight reduction in glow spread)

---

### Option 2: Maximum Performance

**Best for**: When performance is critical

```jsx
<Bloom
  intensity={1.0}
  luminanceThreshold={0.8}
  luminanceSmoothing={0.08}
  kernelSize={KernelSize.SMALL}
  resolutionScale={0.5}
/>
```

**Performance**: ~2-3ms (down from 7-12ms)
**Improvement**: ~70-75% faster
**Visual Quality**: Medium-High (tighter glow, but still effective)

---

### Option 3: Minimal Impact

**Best for**: When you want to keep visual quality close to current

```jsx
<Bloom
  intensity={1.35}
  luminanceThreshold={0.7}
  luminanceSmoothing={0.08}
  kernelSize={KernelSize.LARGE}
  resolutionScale={0.5}
  // mipmapBlur removed
/>
```

**Performance**: ~4-6ms (down from 7-12ms)
**Improvement**: ~30-40% faster
**Visual Quality**: Very High (minimal visual difference)

---

## Performance Comparison

| Configuration | Cost (ms) | Quality | Improvement | Recommendation |
|--------------|-----------|---------|-------------|----------------|
| **Current** (LARGE + mipmapBlur) | 7-12ms | Highest | Baseline | ⚠️ Too expensive |
| MEDIUM + resolutionScale 0.5 | 3-4ms | High | ~60-65% | ✅ **Recommended** |
| SMALL + resolutionScale 0.5 | 2-3ms | Medium-High | ~70-75% | ✅ For performance-critical |
| VERY_SMALL + resolutionScale 0.5 | 1-2ms | Medium | ~80-85% | ✅ Maximum performance |
| LARGE + resolutionScale 0.5 | 4-6ms | Very High | ~40-50% | ✅ Keep visual quality |

---

## Understanding the Bloom Pipeline

To understand kernel size better, here's how Bloom works:

1. **Luminance Extraction**: Identifies bright pixels (based on `luminanceThreshold`)
2. **Blur Passes**: Applies Gaussian blur (kernel size determines how many samples/blur radius)
   - This is where kernel size matters most
   - Larger kernel = more blur passes or wider blur radius
3. **Combination**: Adds the blurred bright areas back to the original image

**Kernel size specifically affects step 2** - the blur passes. A larger kernel means:
- More texture samples per pixel
- More GPU memory reads
- More shader calculations
- Wider blur radius

---

## Visual Examples (Conceptual)

### SMALL Kernel
```
Bright object: ●
Bloom glow:    ░░░
               ░●░
               ░░░
```
Tight, focused glow around the object.

### MEDIUM Kernel
```
Bright object: ●
Bloom glow:    ▓▓▓▓▓
               ▓▓▓▓▓
               ▓▓●▓▓
               ▓▓▓▓▓
               ▓▓▓▓▓
```
Moderate spread, balanced appearance.

### LARGE Kernel (Current)
```
Bright object: ●
Bloom glow:    ████████
               ████████
               ████████
               ███●███
               ████████
               ████████
               ████████
               ████████
```
Wide atmospheric glow, more cinematic.

---

## Additional Optimization Techniques

### Frame-Skipping (Advanced)

Update Bloom every other frame to save performance:
```jsx
const [bloomEnabled, setBloomEnabled] = useState(true);

useFrame(({ clock }) => {
  // Enable bloom every other frame
  setBloomEnabled(Math.floor(clock.elapsedTime * 30) % 2 === 0);
});

{bloomEnabled && <Bloom ... />}
```

**Trade-off**: Bloom may appear slightly less smooth, but saves 50% of bloom processing time.

### Dynamic Quality (Advanced)

Adjust kernel size based on performance:
```jsx
const [kernelSize, setKernelSize] = useState(KernelSize.MEDIUM);

useEffect(() => {
  // Monitor FPS and adjust quality
  if (fps < 30) {
    setKernelSize(KernelSize.SMALL);  // Low FPS = reduce quality
  } else if (fps < 45) {
    setKernelSize(KernelSize.MEDIUM);
  } else {
    setKernelSize(KernelSize.LARGE);  // Good FPS = higher quality
  }
}, [fps]);
```

---

## Summary

### What Kernel Size Controls:
- **Blur radius/spread**: How far the glow extends from bright areas
- **Performance cost**: Larger = exponentially more expensive
- **Atmospheric effect**: Larger = more cinematic/dreamy appearance

### Quick Recommendations:

1. **Start with**: `KernelSize.MEDIUM` + `resolutionScale={0.5}` for ~60% improvement
2. **If still slow**: Drop to `KernelSize.SMALL`
3. **Remove**: `mipmapBlur` for immediate 1-3ms savings
4. **Adjust**: `luminanceThreshold` to 0.75-0.8 for fewer bloomed pixels

### Expected Results:
- Moving from LARGE to MEDIUM: ~40-50% performance improvement
- Adding resolutionScale 0.5: Additional ~30-40% improvement
- Combined: ~60-65% total improvement (from 7-12ms to 3-4ms)

The goal is to find the right balance between visual quality and performance for your target frame rate.
