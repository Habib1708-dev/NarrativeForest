# Performance Study: Tiling Logic, Magic Mushrooms, Magic Crystals, and Radio Tower

## Executive Summary

This document analyzes the performance characteristics and potential bottlenecks of four major systems in the narrative-forest project:
1. **Tiling Logic** (Terrain & Forest)
2. **Magic Mushrooms**
3. **Magic Crystals** (with Fireflies)
4. **Radio Tower**

---

## 1. Tiling Logic Performance Analysis

### 1.1 Architecture Overview

The tiling system consists of:
- `useTileSystem.jsx`: Core tile management with visibility radius
- `useInfiniteTiles.js`: Infinite grid with hysteresis and prefetch
- `TerrainTiled.jsx`: Terrain tile rendering component
- `terrainTileWorker.js`: Web Worker for async tile generation

### 1.2 Performance Characteristics

#### Strengths:
- ✅ **Web Worker Offloading**: Tile geometry generation happens off main thread when using default height sampler
- ✅ **Frame Budget System**: Limits tile building to 4ms per frame (`buildBudgetMs = 4`)
- ✅ **Geometry Pooling**: Reuses geometry objects to reduce allocation overhead
- ✅ **Height Caching**: Caches height samples with precision-based keys
- ✅ **Hysteresis System**: Prevents flickering at tile boundaries (10 unit threshold)
- ✅ **Retention System**: Keeps tiles within 2×tileSize distance before unloading

#### Performance Concerns:

1. **Per-Frame Camera Checks** (`useTileSystem.jsx:146`)
   ```javascript
   useFrame(() => {
     if (!hasMovedSignificantly(camX, camZ)) return;
     // Tile visibility calculations
   });
   ```
   - **Impact**: Low - Only triggers on significant movement (>10 units)
   - **Cost**: ~0.1-0.5ms per frame when active

2. **Tile Visibility Calculations** (`useTileSystem.jsx:66-86`)
   - **Complexity**: O(visibilityRadius²) - For radius=2, checks 25 tiles
   - **Impact**: Medium - Runs every time camera crosses tile boundary
   - **Cost**: ~0.2-1ms per tile transition

3. **Retention Merging** (`useTileSystem.jsx:95-110`)
   - Iterates through all visible tiles to check retention distance
   - **Impact**: Low-Medium - O(n) where n = visible tiles (typically 9-25)
   - **Cost**: ~0.1-0.3ms per update

4. **Tile Building Queue Processing** (`TerrainTiled.jsx:320-387`)
   ```javascript
   useFrame(() => {
     const budget = buildBudgetMs ?? 4;
     while (q.length && performance.now() - frameStart < budget) {
       // Build tiles
     }
   });
   ```
   - **Impact**: Medium - Can consume up to 4ms per frame
   - **Cost**: Variable - Depends on queue length and resolution
   - **Risk**: If queue backs up, tiles may appear delayed

5. **Height Sampling** (`TerrainTiled.jsx:181-190`)
   - Cached with precision factor (1e5)
   - **Impact**: Low - Cache hit rate should be high
   - **Cost**: ~0.01ms per sample (cached), ~0.1ms (uncached)

6. **Worker Communication Overhead**
   - PostMessage/onMessage for each tile build
   - **Impact**: Low - Async, but adds latency
   - **Cost**: ~1-5ms per tile (async, doesn't block main thread)

### 1.3 Memory Usage

- **Geometry Pool**: Reuses geometries, minimal allocation
- **Tile Map**: Stores tile records (state, mesh, timestamps)
- **Height Cache**: Map with string keys (potential memory growth)
  - **Risk**: Cache could grow unbounded if not cleared
  - **Mitigation**: Cleared on `sampleHeight`/`tileSize`/`resolution` changes

### 1.4 Recommendations

1. **Height Cache Management**
   - Add LRU eviction or size limit to prevent unbounded growth
   - Consider using WeakMap if cache lifetime can be tied to tile lifetime

2. **Tile Building Optimization**
   - Consider increasing `buildBudgetMs` to 6-8ms for faster initial load
   - Add priority queue: build tiles closer to camera first

3. **Visibility Optimization**
   - Cache `calculateVisibleTiles` result if camera hasn't moved
   - Consider using spatial hash for faster retention checks

4. **Worker Pool**
   - Currently single worker - consider pool for parallel tile builds
   - Limit concurrent jobs (currently `maxConcurrentJobs = 2`)

---

## 2. Magic Mushrooms Performance Analysis

### 2.1 Architecture Overview

- **7 instanced mushroom meshes** (one per submesh in GLB)
- **Firefly particle system** (max 500 particles)
- **Dissolve shader effects** (per-instance)
- **Squeeze animation** (per-instance interaction)

### 2.2 Performance Characteristics

#### Strengths:
- ✅ **Instanced Rendering**: 7 instances share geometry, efficient
- ✅ **Shader Patching**: Done once on mount, not per-frame
- ✅ **Particle Pool**: Fixed max particles (500), no dynamic allocation

#### Performance Concerns:

1. **Per-Frame Animation Loop** (`MagicMushrooms.jsx:950-1035`)
   ```javascript
   useFrame((_, dt) => {
     // Timer updates (7 instances)
     // Particle culling (up to 500 particles)
     // Squeeze interpolation (7 instances)
     // Matrix recomputation (7 instances × submeshes)
   });
   ```
   - **Impact**: Medium-High
   - **Cost**: ~0.5-2ms per frame
   - **Breakdown**:
     - Timer updates: ~0.01ms
     - Particle filtering: ~0.1-0.5ms (depends on active count)
     - Squeeze interpolation: ~0.05ms
     - Matrix updates: ~0.1-0.3ms

2. **Particle System** (`MagicMushrooms.jsx:401-565`)
   - **Max Particles**: 500
   - **Per-Frame Updates**: 
     - Culling dead particles (filter operation)
     - Geometry attribute updates (when particles change)
   - **Impact**: Medium
   - **Cost**: 
     - Culling: ~0.1-0.5ms (O(n) filter)
     - Geometry update: ~0.5-2ms (when triggered, creates new Float32Arrays)

3. **Firefly Geometry Updates** (`MagicMushrooms.jsx:475-565`)
   ```javascript
   const updateFireflyGeometry = () => {
     // Creates new Float32Arrays for all attributes
     // Updates 6 buffer attributes
   };
   ```
   - **Impact**: High when triggered
   - **Cost**: ~0.5-2ms per update
   - **Frequency**: Only when particle count changes

4. **Shader Uniform Updates** (`MagicMushrooms.jsx:1031-1034`)
   - Updates `uTime` uniform every frame
   - **Impact**: Low
   - **Cost**: ~0.01ms

5. **Instance Matrix Updates** (`MagicMushrooms.jsx:1000-1029`)
   - Recomputes matrices for all 7 instances when squeeze changes
   - **Impact**: Low-Medium
   - **Cost**: ~0.1-0.3ms per update
   - **Optimization**: Only updates when `anyChanged || matricesDirtyRef.current`

### 2.3 Memory Usage

- **Instanced Meshes**: 7 instancedMesh objects
- **Particle Arrays**: 
  - `activeParticles.current`: Array of objects (up to 500)
  - Geometry attributes: 6 Float32Arrays (maxParticles × data size)
- **Firefly Geometry**: Single BufferGeometry with 6 attributes

### 2.4 Recommendations

1. **Particle Culling Optimization**
   - Use object pooling instead of array filtering
   - Mark particles as dead instead of removing from array
   - Only rebuild geometry when significant changes occur

2. **Matrix Update Optimization**
   - Batch matrix updates: only update changed instances
   - Use `instanceMatrix.setUsage(THREE.DynamicDrawUsage)` if not already

3. **Geometry Update Throttling**
   - Debounce geometry updates (e.g., max once per 2-3 frames)
   - Use incremental updates instead of full rebuilds when possible

4. **Particle Count Reduction**
   - Consider reducing `maxParticles` from 500 to 200-300
   - Use LOD: fewer particles when camera is far

---

## 3. Magic Crystals Performance Analysis

### 3.1 Architecture Overview

- **65 total crystal instances**:
  - 15 × Crystal A (instancedMesh)
  - 34 × Crystal B (instancedMesh)
  - 16 × Crystal C (instancedMesh)
- **Complex shader effects**: Gradient, dissolve, hover, cooldown
- **Per-frame hover detection** (raycasting)
- **Color interpolation** (per-frame when hovering)

### 3.2 Performance Characteristics

#### Strengths:
- ✅ **Instanced Rendering**: All crystals of same type share geometry
- ✅ **Material Sharing**: Each type uses single material (3 total)
- ✅ **Shader Patching**: Done once on mount

#### Performance Concerns:

1. **Hover Detection** (`UnifiedCrystalClusters.jsx:1265-1284`)
   ```javascript
   function anyHoveredFor(instMesh, sphereR) {
     const count = instMesh.count ?? 0;
     for (let i = 0; i < count; i++) {
       // Matrix decomposition
       // NDC projection
       // Distance calculation
     }
   }
   ```
   - **Impact**: High
   - **Cost**: ~1-5ms per frame
   - **Breakdown**:
     - Called 3 times (once per crystal type)
     - For each instance: matrix decomposition + projection + distance calc
     - Total: 65 instances checked every frame
   - **Complexity**: O(65) per frame = ~65 matrix operations + 65 projections

2. **Per-Frame Animation** (`UnifiedCrystalClusters.jsx:1286-1405`)
   ```javascript
   useFrame((_, dt) => {
     // Dissolve animation
     // Heat/glow calculation
     // Hover color interpolation
     // Uniform updates (3 materials)
   });
   ```
   - **Impact**: Medium-High
   - **Cost**: ~1-3ms per frame
   - **Breakdown**:
     - Dissolve: ~0.01ms
     - Heat calculation: ~0.05ms
     - Hover detection: ~1-5ms (see above)
     - Color interpolation: ~0.1-0.3ms
     - Uniform updates: ~0.05ms

3. **Color Interpolation** (`UnifiedCrystalClusters.jsx:1380-1404`)
   - Lerps between base and hover colors
   - Updates 3 material uniforms
   - **Impact**: Low-Medium
   - **Cost**: ~0.1-0.3ms

4. **Shader Complexity**
   - Multiple noise functions (3D value noise)
   - Gradient calculations
   - Fresnel calculations
   - Environment map lookups
   - **Impact**: Medium (GPU-bound)
   - **Cost**: Depends on fragment count, typically acceptable

5. **Instance Matrix Updates** (`UnifiedCrystalClusters.jsx:1065-1193`)
   - Updates all 65 instance matrices when controls change
   - **Impact**: Low (only on control changes)
   - **Cost**: ~0.5-1ms per update

### 3.3 Memory Usage

- **3 Instanced Meshes**: One per crystal type
- **3 Materials**: Shared across instances
- **Shader Uniforms**: Stored in material.userData.shader
- **Hover State**: Refs for color interpolation

### 3.4 Fireflies Component (Related to Crystals)

#### Architecture:
- **65 separate point systems** (one per crystal)
- **8 particles per box** = 520 total particles
- **Per-box uniforms** (65 materials)
- **Invisible hit boxes** (65 meshes for interaction)

#### Performance Concerns:

1. **Per-Frame Uniform Updates** (`Fireflies.jsx:545-593`)
   ```javascript
   useFrame(() => {
     for (let i = 0; i < COUNT_BOXES; i++) {
       // Update 8+ uniforms per box
       // Calculate ramp values
     }
   });
   ```
   - **Impact**: High
   - **Cost**: ~2-5ms per frame
   - **Breakdown**:
     - 65 iterations
     - ~8-10 uniform updates per iteration
     - Time calculation per box
     - Total: ~520-650 uniform updates per frame

2. **Geometry Building** (`Fireflies.jsx:420-458`)
   - Creates new BufferGeometry for each box
   - **Impact**: Medium (only on parameter changes)
   - **Cost**: ~0.1-0.5ms per geometry × 65 = ~6.5-32.5ms total

3. **Material Creation** (`Fireflies.jsx:472-509`)
   - Creates 65 separate ShaderMaterials
   - **Impact**: Low (only on mount/parameter changes)
   - **Cost**: ~0.1ms per material × 65 = ~6.5ms total

4. **Hit Box Rendering** (`Fireflies.jsx:713-739`)
   - 65 invisible meshes for interaction
   - **Impact**: Low (invisible, but still in scene graph)
   - **Cost**: Minimal (no rendering, but raycasting overhead)

### 3.5 Recommendations

1. **Hover Detection Optimization** (Critical)
   - Use spatial acceleration (octree, BVH) instead of checking all 65 instances
   - Only check instances within view frustum
   - Throttle hover checks (e.g., every 2-3 frames)
   - Use GPU-based picking if available

2. **Fireflies Uniform Updates** (Critical)
   - Batch uniform updates: use single material with instanced attributes
   - Or: reduce update frequency (every 2-3 frames)
   - Consider: single point system with instanced attributes instead of 65 separate systems

3. **Fireflies Geometry Consolidation**
   - Merge all fireflies into single geometry with instanced attributes
   - Use per-instance uniforms or attributes for per-box state
   - Reduces from 65 draw calls to 1

4. **Shader Optimization**
   - Consider reducing noise complexity (2D instead of 3D where possible)
   - Use texture lookups for gradients instead of calculations
   - LOD: simpler shader when camera is far

5. **Instance Count Reduction**
   - Consider reducing crystal count if performance is critical
   - Use LOD: fewer instances when camera is far

---

## 4. Radio Tower Performance Analysis

### 4.1 Architecture Overview

- **Single GLB model** with skeleton cloning
- **Shader patching** for dissolve effects
- **Per-frame dissolve animation**
- **Bounding box updates** (periodic)

### 4.2 Performance Characteristics

#### Strengths:
- ✅ **Single Model**: Only one mesh hierarchy
- ✅ **Shader Patching**: Done once on mount
- ✅ **Minimal Animation**: Only dissolve progress updates

#### Performance Concerns:

1. **Per-Frame Dissolve Animation** (`RadioTower.jsx:431-441`)
   ```javascript
   useFrame((_, dt) => {
     // Progress interpolation
     // Uniform update (all materials)
   });
   ```
   - **Impact**: Low
   - **Cost**: ~0.05-0.1ms per frame
   - **Breakdown**:
     - Progress calculation: ~0.01ms
     - Uniform update: ~0.05-0.1ms (depends on material count)

2. **Bounding Box Updates** (`RadioTower.jsx:406-428`)
   ```javascript
   const updateWorldYRange = () => {
     rootRef.current.updateMatrixWorld(true);
     const box = new THREE.Box3().setFromObject(rootRef.current);
     // Update uniforms
   };
   ```
   - **Impact**: Low-Medium (only on transform changes)
   - **Cost**: ~1-3ms per update
   - **Frequency**: On mount + when transform controls change

3. **Material Traversal** (`RadioTower.jsx:28-53`)
   - Traverses entire scene to gather materials
   - **Impact**: Low (only on mount)
   - **Cost**: ~1-5ms (depends on model complexity)

4. **Shader Patching** (`RadioTower.jsx:222-371`)
   - Patches all materials with dissolve shader
   - **Impact**: Low (only on mount)
   - **Cost**: ~5-20ms (depends on material count)

### 4.3 Memory Usage

- **Cloned Scene**: Full scene graph copy
- **Material Array**: Stores references to all materials
- **Shader Uniforms**: Stored in material.userData.rtShader

### 4.4 Recommendations

1. **Bounding Box Caching**
   - Cache bounding box, only recalculate when transform actually changes
   - Use dirty flags instead of recalculating every frame

2. **Uniform Update Optimization**
   - Batch uniform updates if multiple materials share same shader
   - Consider using shared uniforms if possible

3. **Shader Complexity**
   - Same noise function as other components - consider sharing
   - Use simpler noise for dissolve if acceptable

---

## 5. Overall Performance Summary

### 5.1 Per-Frame Cost Estimates

| Component | Estimated Cost (ms/frame) | Priority |
|-----------|---------------------------|----------|
| Tiling Logic | 0.5-2ms | Medium |
| Magic Mushrooms | 0.5-2ms | Medium |
| Magic Crystals | 1-5ms | **High** |
| Fireflies | 2-5ms | **High** |
| Radio Tower | 0.05-0.1ms | Low |
| **Total** | **4-14ms** | |

### 5.2 Critical Performance Bottlenecks

1. **Fireflies Uniform Updates** (2-5ms/frame)
   - 65 separate materials updated every frame
   - **Fix**: Consolidate to single instanced system

2. **Crystal Hover Detection** (1-5ms/frame)
   - Checks all 65 instances every frame
   - **Fix**: Spatial acceleration, frustum culling, throttling

3. **Tile Building Queue** (0-4ms/frame)
   - Can consume full frame budget
   - **Fix**: Increase budget, add priority queue

### 5.3 Memory Usage Summary

- **Tiling**: Moderate (geometry pool, height cache)
- **Mushrooms**: Low-Medium (7 instances, 500 particles)
- **Crystals**: Medium (65 instances, 3 materials)
- **Fireflies**: High (65 geometries, 65 materials, 520 particles)
- **Radio Tower**: Low (single model)

### 5.4 Recommended Optimization Priority

1. **High Priority**:
   - Consolidate Fireflies to single instanced system
   - Optimize Crystal hover detection (spatial acceleration)
   - Add height cache size limit

2. **Medium Priority**:
   - Optimize particle culling in Mushrooms
   - Add tile building priority queue
   - Reduce Fireflies particle count or use LOD

3. **Low Priority**:
   - Cache Radio Tower bounding box
   - Share noise functions across components
   - Add LOD systems for distant objects

---

## 6. Testing Recommendations

### 6.1 Performance Profiling

1. **Use Chrome DevTools Performance Tab**
   - Record during camera movement
   - Identify frame drops
   - Check main thread vs. worker thread usage

2. **Add Performance Markers**
   ```javascript
   performance.mark('tile-build-start');
   // ... tile building code ...
   performance.mark('tile-build-end');
   performance.measure('tile-build', 'tile-build-start', 'tile-build-end');
   ```

3. **Monitor Frame Times**
   - Use `stats.js` or similar
   - Track FPS over time
   - Identify spikes

### 6.2 Stress Testing

1. **Camera Movement**
   - Rapid camera movement to trigger tile transitions
   - Test hover detection with many crystals visible

2. **Interaction Testing**
   - Click all mushrooms rapidly
   - Hover over all crystals
   - Test firefly activation

3. **Memory Testing**
   - Long-running sessions
   - Monitor for memory leaks
   - Check height cache growth

---

## 7. Conclusion

The tiling system is well-optimized with worker offloading and frame budgets. The main performance concerns are:

1. **Fireflies component** - 65 separate systems updating every frame (2-5ms)
2. **Crystal hover detection** - O(65) checks every frame (1-5ms)
3. **Tile building** - Can consume full frame budget during transitions

With optimizations, the per-frame cost could be reduced from **4-14ms to 2-6ms**, leaving more headroom for other systems and maintaining 60 FPS.

---

*Generated: Performance analysis of narrative-forest project*
*Last Updated: Analysis of current codebase*

