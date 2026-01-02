# Loading Performance Analysis & Optimization Plan

## Executive Summary

This document outlines a comprehensive plan to analyze and optimize the loading performance of the Narrative Forest project. The analysis will identify bottlenecks, measure component loading times, and provide actionable optimization strategies.

---

## Current Architecture Overview

### Active Components (Loaded on Home Page)

Based on `src/Experience.jsx` and `src/pages/Home.jsx`, the following components are actively loaded:

1. **Terrain System** (`TerrainTiled`)
   - Dynamic tile-based terrain generation
   - Uses Web Worker for geometry generation
   - Progressive loading based on camera position

2. **Forest System** (`ForestDynamicSampled`)
   - Instanced trees (high + LOD variants)
   - Instanced rocks
   - Chunk-based generation system
   - Loads 3 GLB models: Spruce1.glb, Spruce1LOD.glb, MateriallessRock.glb

3. **3D Models** (Loaded via `useGLTF`)
   - Cabin (`Cabin2.glb` + `MateriallessRock.glb`)
   - Man (`man.glb` with animations)
   - Cat (`bicolor_cat_no_textures.glb` with animations)
   - Radio Tower (`Radio tower.glb`)
   - Lake (shader-based, no model loading)
   - Unified Crystal Clusters (3 GLB files: CrystalCluster.glb, CrystalCluster2.glb, CrystalCluster4.glb)
   - Butterfly (texture-based)

4. **Sky & Atmosphere**
   - CustomSky (shader-based)
   - Stars (procedural)
   - Fog systems (DistanceFade)

5. **Post-Processing**
   - EffectComposer with Bloom
   - DistanceBlurEffect (optional)
   - NoiseJitterEffect (optional)

6. **Audio Assets**
   - `night-forest-soundscape-158701.mp3` (background)
   - `calming-rain-257596.mp3` (preset-based)

---

## Component Loading Analysis Plan

### Phase 1: Baseline Measurement

#### 1.1 Create Performance Measurement Utility

**File**: `src/utils/performanceMonitor.js`

This utility will:
- Track component mount times
- Measure GLB loading durations
- Monitor Web Worker initialization
- Track terrain tile generation times
- Measure forest chunk generation
- Record total time to interactive

**Key Metrics to Track:**
```javascript
{
  // Component-level metrics
  componentMountTimes: {
    TerrainTiled: number,
    ForestDynamicSampled: number,
    Cabin: number,
    Man: number,
    Cat: number,
    RadioTower: number,
    Lake: number,
    UnifiedCrystalClusters: number,
    Butterfly: number,
    CustomSky: number,
    Stars: number,
  },
  
  // Asset loading
  glbLoadTimes: {
    [url]: { startTime, endTime, duration, size }
  },
  
  // System initialization
  workerInitTime: number,
  terrainFirstTileTime: number,
  forestFirstChunkTime: number,
  
  // Overall metrics
  timeToFirstFrame: number,
  timeToInteractive: number,
  totalLoadTime: number
}
```

#### 1.2 Instrument Components

Add performance markers to:
- `TerrainTiled.jsx` - track worker init, first tile, tile queue processing
- `ForestDynamicSampled.jsx` - track GLB loads, first chunk generation
- All model components - track GLB load start/end
- `Experience.jsx` - track overall scene ready time

#### 1.3 Network Analysis

- Use Chrome DevTools Network tab to identify:
  - Largest assets
  - Slowest requests
  - Blocking resources
  - Unused assets

---

### Phase 2: Component-by-Component Analysis

#### 2.1 Terrain System (`TerrainTiled`)

**Current Behavior:**
- Uses Web Worker for geometry generation (good)
- Progressive tile loading (good)
- Initial load radius: 2 tiles
- Resolution: 4 (low, good for performance)

**Potential Issues:**
- Worker initialization overhead
- First tile generation blocking
- Geometry pool allocation

**Measurement Points:**
1. Worker creation time
2. First tile generation time
3. Time to load initial radius tiles
4. Memory usage per tile

**Optimization Opportunities:**
- Pre-initialize worker earlier
- Reduce initial load radius if possible
- Consider lower resolution for initial tiles

#### 2.2 Forest System (`ForestDynamicSampled`)

**Current Behavior:**
- Loads 3 GLB models upfront
- Chunk-based generation with budget system
- Uses height sampling (faster than raycasting)

**Potential Issues:**
- 3 GLB files loaded synchronously
- Large tree models (Spruce1.glb, Spruce1LOD.glb)
- Initial chunk generation blocking

**Measurement Points:**
1. GLB load times (Spruce1, Spruce1LOD, MateriallessRock)
2. First chunk generation time
3. Time to populate initial view
4. Memory usage for instanced meshes

**Optimization Opportunities:**
- Lazy load LOD model (load after high-res)
- Compress GLB files
- Reduce initial chunk count
- Consider texture compression

#### 2.3 3D Models

**Models Loaded:**
1. `Cabin2.glb` - Cabin model
2. `MateriallessRock.glb` - Used by Cabin
3. `man.glb` - Character with animations
4. `bicolor_cat_no_textures.glb` - Cat with animations
5. `Radio tower.glb` - Radio tower
6. `CrystalCluster.glb` - Crystal variant A
7. `CrystalCluster2.glb` - Crystal variant B
8. `CrystalCluster4.glb` - Crystal variant C

**Current Preloading:**
- All models use `useGLTF.preload()` which starts loading immediately
- No prioritization system
- All loaded in parallel (good for speed, bad for bandwidth)

**Measurement Points:**
1. Individual GLB file sizes
2. Load time per model
3. Parse/decode time
4. Memory footprint

**Optimization Opportunities:**
- Prioritize visible models (Cabin, Man, Cat first)
- Defer non-critical models (Crystals, Radio Tower)
- Compress GLB files (Draco compression)
- Consider texture optimization
- Implement progressive loading strategy

#### 2.4 Audio Assets

**Current Behavior:**
- Two audio files with `preload="auto"`
- Background audio starts immediately
- Rain audio loads but only plays on preset change

**Measurement Points:**
1. Audio file sizes
2. Load time
3. Decode time

**Optimization Opportunities:**
- Change rain audio to `preload="metadata"` (load on demand)
- Compress audio files
- Consider streaming for large files

#### 2.5 Post-Processing

**Current Behavior:**
- EffectComposer always active
- Bloom always enabled
- Optional effects (blur, grain) conditionally enabled

**Measurement Points:**
1. EffectComposer initialization time
2. Render target creation time

**Optimization Opportunities:**
- Defer EffectComposer initialization
- Lazy load optional effects

---

### Phase 3: Implementation Plan

#### Step 1: Create Performance Monitor

**Priority: HIGH**
- Create `src/utils/performanceMonitor.js`
- Add React hooks for easy integration
- Export metrics to console and window object

#### Step 2: Instrument Key Components

**Priority: HIGH**
- Add performance markers to:
  - `Experience.jsx` - overall timing
  - `TerrainTiled.jsx` - terrain metrics
  - `ForestDynamicSampled.jsx` - forest metrics
  - All model components - GLB load times

#### Step 3: Analyze Results

**Priority: MEDIUM**
- Run analysis in development
- Identify top 3 bottlenecks
- Document findings

#### Step 4: Implement Optimizations

**Priority: MEDIUM-HIGH** (based on findings)

**Quick Wins:**
1. Change rain audio preload to metadata
2. Defer non-critical model loading
3. Reduce initial terrain load radius
4. Compress GLB files

**Medium Effort:**
1. Implement model loading prioritization
2. Lazy load LOD models
3. Optimize texture sizes
4. Implement progressive enhancement

**High Effort:**
1. Implement code splitting for components
2. Add asset compression pipeline
3. Implement service worker caching
4. Add CDN for static assets

---

## Measurement Implementation

### Performance Monitor API

```javascript
// Usage example
import { usePerformanceMonitor } from '../utils/performanceMonitor';

function MyComponent() {
  const { markStart, markEnd, getMetrics } = usePerformanceMonitor('MyComponent');
  
  useEffect(() => {
    markStart('mount');
    // ... component logic
    markEnd('mount');
  }, []);
}
```

### Key Measurement Points

1. **App Initialization**
   - `main.jsx` render start
   - `App.jsx` mount
   - `Home.jsx` mount
   - `Canvas` initialization

2. **Experience Component**
   - `Experience.jsx` mount
   - First frame render
   - Scene ready event

3. **Terrain System**
   - Worker creation
   - First tile generation
   - Initial tiles loaded

4. **Forest System**
   - GLB loads (3 files)
   - First chunk generation
   - Initial view populated

5. **3D Models**
   - Each GLB load start/end
   - Model parse time
   - Material/texture load time

6. **Audio**
   - File load time
   - Decode time

---

## Expected Bottlenecks (Hypothesis)

Based on code analysis, likely bottlenecks:

1. **Forest GLB Models** (HIGH PRIORITY)
   - Spruce1.glb and Spruce1LOD.glb are likely large
   - Loaded synchronously
   - Block forest initialization

2. **Crystal Clusters** (MEDIUM PRIORITY)
   - 3 GLB files loaded
   - May not be immediately visible
   - Could be deferred

3. **Terrain Worker Initialization** (LOW PRIORITY)
   - Worker creation has overhead
   - But already optimized with async processing

4. **Audio Files** (LOW PRIORITY)
   - Large files
   - Rain audio not needed immediately

---

## Success Metrics

After optimization, target improvements:

- **Time to First Frame**: < 2 seconds
- **Time to Interactive**: < 5 seconds
- **Total Load Time**: < 8 seconds
- **Initial Bundle Size**: Reduce by 20-30%
- **Largest Asset**: < 2MB

---

## Next Steps

1. ✅ Create this analysis document
2. ⏳ Implement performance monitor utility
3. ⏳ Instrument components with measurements
4. ⏳ Run baseline measurements
5. ⏳ Identify top bottlenecks
6. ⏳ Implement optimizations
7. ⏳ Re-measure and validate improvements
8. ⏳ Document final results

---

## Tools & Resources

- Chrome DevTools Performance tab
- Chrome DevTools Network tab
- React DevTools Profiler
- `performance.mark()` and `performance.measure()` API
- `@react-three/drei` `useProgress` hook (already used in LoadingScreen)
- Web Vitals (LCP, FID, CLS)

---

## Notes

- Current loading screen uses `useProgress` from drei which tracks GLB loads
- Forest ready event is dispatched when scene is ready
- Loading screen fades after 1s stabilization period
- Consider adding more granular progress indicators

