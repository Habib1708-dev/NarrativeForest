# GlobalDarken to Ambient Light Migration Guide

## Overview

This document identifies which presets currently use `globalDarken` (which requires the BrightnessContrast post-processing effect) and explains how to substitute it with `ambientLight` intensity for better performance.

## Current Implementation

The `globalDarken` value is applied through the `BrightnessContrast` post-processing effect in the EffectComposer. This adds overhead to every frame. Instead, we can achieve similar darkening effects by controlling the `ambientLight` intensity, which is more performant and physically accurate.

## Presets Using GlobalDarken

### Presets with Non-Zero GlobalDarken Values:

1. **Night**
   - Current `globalDarken`: `0.15` (darkens by 15%)
   - Recommended `ambientLight` intensity: `0.15` or lower (e.g., `0.12` for slightly darker)

2. **Stormy Night**
   - Current `globalDarken`: `0.15` (darkens by 15%)
   - Recommended `ambientLight` intensity: `0.15` or lower (e.g., `0.12` for slightly darker)

3. **Dawn**
   - Current `globalDarken`: `0.15` (darkens by 15%)
   - Recommended `ambientLight` intensity: `0.18` (slightly brighter than Night to maintain the dawn feel)

4. **Purplish Evening**
   - Current `globalDarken`: `0.1` (darkens by 10%)
   - Recommended `ambientLight` intensity: `0.2` (moderate darkness for evening)

5. **Sunset**
   - Current `globalDarken`: `0.03` (darkens by 3% - very subtle)
   - Recommended `ambientLight` intensity: `0.25` or `0.27` (minimal darkening, mostly bright)

### Presets with Zero GlobalDarken:

These presets don't need changes, but their ambient light can be set to a baseline:

- **Default**: No darkening needed, can use `ambientLight: 0.3` (baseline)
- **White Dawn**: No darkening needed, can use `ambientLight: 0.3`
- **Summer Day**: No darkening needed, can use `ambientLight: 0.35` (brighter for day)
- **Polar Night**: No darkening needed, can use `ambientLight: 0.3`
- **Dawn In Lofoten**: No darkening needed, can use `ambientLight: 0.3`

## Migration Strategy

### Conceptual Differences

1. **GlobalDarken (Post-Processing)**:
   - Applies uniform darkening to the final rendered image
   - Works on pixels after all lighting calculations
   - More uniform/artificial darkening effect
   - Performance cost: ~0.5-1ms per frame (post-processing overhead)

2. **Ambient Light (Lighting)**:
   - Affects how materials are lit during rendering
   - More physically accurate - materials react differently based on their properties
   - More natural-looking darkening
   - Performance cost: Negligible (just a lighting calculation)

### Recommended Ambient Light Values

Use these as starting points, adjust based on visual testing:

| Preset | Current globalDarken | Recommended ambientLight | Notes |
|--------|---------------------|-------------------------|-------|
| Default | 0.0 | 0.3 | Baseline brightness |
| White Dawn | 0.0 | 0.3 | Similar to Default |
| Night | 0.15 | 0.12-0.15 | Dark scene |
| Stormy Night | 0.15 | 0.12-0.15 | Dark scene with storms |
| Dawn | 0.15 | 0.18-0.20 | Slightly brighter than Night |
| Purplish Evening | 0.1 | 0.20-0.22 | Moderate evening darkness |
| Sunset | 0.03 | 0.25-0.27 | Very subtle darkening |
| Summer Day | 0.0 | 0.35 | Brightest scene |
| Polar Night | 0.0 | 0.3 | Baseline |
| Dawn In Lofoten | 0.0 | 0.3 | Baseline |

### Adjustment Guidelines

1. **Direct Inverse Relationship**:
   - `globalDarken: 0.15` ≈ `ambientLight: 0.15` (1:1 ratio for dark presets)
   - `globalDarken: 0.1` ≈ `ambientLight: 0.2` (slightly brighter)
   - `globalDarken: 0.03` ≈ `ambientLight: 0.27` (minimal change)

2. **Visual Testing Required**:
   - The relationship isn't perfectly linear because ambient light affects materials differently
   - Some materials may appear darker or lighter than expected
   - Test each preset visually to fine-tune values

3. **Consider Scene Context**:
   - Darker presets (Night, Stormy Night) might need lower ambient light (0.12-0.15)
   - Transitional times (Dawn, Sunset) might need moderate values (0.18-0.25)
   - Bright scenes can use higher values (0.3-0.35)

## Benefits of Migration

1. **Performance**: Removes post-processing overhead (~0.5-1ms saved per frame)
2. **Simplicity**: Removes dependency on EffectComposer for this feature
3. **Physical Accuracy**: More realistic lighting behavior
4. **Flexibility**: Can fine-tune per-material response if needed later

## Notes

- The current `directionalLight` has `dirLightIntensity: 0.0` (disabled), so ambient light will be the primary lighting source
- If directional light is enabled later, the ambient light values may need adjustment
- The `skyDarken` parameter in CustomSky is separate and controls sky brightness, not scene object lighting
- Some presets already use `skyDarken`, which complements ambient light changes
