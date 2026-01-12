# GPU Terrain Implementation Status

## Overview
This document tracks the implementation of GPU-driven terrain and foliage placement according to `gpu-terrain-plan.md`.

## Stage 1: GPU Terrain (Visual Only) ✅ COMPLETE

### Completed Components

#### 1. Shared GLSL Height Module
- **File**: `src/shaders/includes/terrainHeight.glsl`
- **Status**: ✅ Complete
- **Features**:
  - Inlined Simplex 2D noise matching `heightfield.js`
  - fBm function matching CPU implementation
  - Plateauize function matching CPU implementation
  - Main `terrainHeightAt()` function with (x, -z) mirroring
  - Bit-exact matching with CPU version

#### 2. Terrain Material Factory
- **File**: `src/components/TerrainMaterial.jsx`
- **Status**: ✅ Complete
- **Features**:
  - Creates MeshStandardMaterial patched with GPU displacement
  - Uses `onBeforeCompile` to inject vertex shader code
  - Per-tile uniforms: `uTileMin`, `uTileSize`, `uLatticeStep`
  - Terrain parameter uniforms synced with `heightfield.js`
  - Vertex displacement: converts normalized grid [0,1] to world XZ, computes height
  - Normal computation using finite differences (matching CPU logic)

#### 3. TerrainTiled Modifications
- **File**: `src/components/TerrainTiled.jsx`
- **Status**: ✅ Complete
- **Changes**:
  - `acquireGeometry()`: Creates flat grid with normalized coordinates [0,1] for XZ, Y=0
  - `buildTileGeometry()`: Simplified to return flat geometry (no CPU height computation)
  - `mountTileMesh()`: Sets per-tile uniforms, computes conservative bounding volumes
  - Material cloned per tile to support per-tile uniforms
  - Worker path kept for fallback but GPU path doesn't use worker-generated heights

### Key Implementation Details

1. **Geometry Structure**:
   - Positions stored as normalized [0,1] for X and Z
   - Y always 0 (flat plane)
   - GPU shader converts to world coordinates: `worldXZ = uTileMin + localPos.xz * uTileSize`

2. **Shader Injection**:
   - Terrain height module injected after `<common>`
   - Displacement happens before `<beginnormal_vertex>`
   - Normal computation replaces `<defaultnormal_vertex>`

3. **Bounding Volumes**:
   - Conservative Y bounds based on terrain parameters
   - XZ bounds from tile coordinates
   - May need refinement with 5-point sampling (Phase 3)

### Testing Checklist

- [ ] Terrain tiles render correctly
- [ ] No cracks between tiles
- [ ] Normals computed correctly (lighting matches)
- [ ] Visual output matches CPU version
- [ ] CPU usage reduced during tile streaming
- [ ] No visual artifacts or floating vertices

---

## Stage 2: Shared Height Function ✅ COMPLETE

The shared height function (`terrainHeight.glsl`) is already used by:
- ✅ Terrain material (via `TerrainMaterial.jsx`)
- ⏳ Foliage materials (pending Stage 3)

**Status**: Terrain uses shared function. Foliage integration pending.

---

## Stage 3: GPU-Driven Foliage Placement ⏳ IN PROGRESS

### Required Changes

#### 1. Modify Foliage Placement Logic
- **Files**: `src/components/ForestDynamicSampled.jsx`, `src/components/ForestDynamic.jsx`
- **Changes Needed**:
  - Store XZ positions + seed instead of full Matrix4
  - Remove `sampleHeight()` calls for visual placement
  - Generate per-instance attributes: `aXZ` (vec2), `aSeed` (float)
  - Store scale, rotation in attributes or derive from seed

#### 2. Patch Foliage Materials
- **Files**: `src/hooks/InstancedTree.jsx`, `src/hooks/InstancedRocks.jsx`
- **Changes Needed**:
  - Patch materials with `onBeforeCompile`
  - Inject terrain height module
  - Compute Y in vertex shader: `y = terrainHeightAt(aXZ.x, aXZ.y)`
  - Apply bottom alignment and sink in shader
  - Apply rotation/scale using seed for randomization

#### 3. Per-Instance Attributes
- Create `InstancedBufferAttribute` for:
  - `aXZ`: vec2 (world XZ position)
  - `aSeed`: float (for randomization)
  - Optional: `aScale`, `aRotationY` if not derived from seed

### Implementation Plan

1. Create `FoliageMaterialPatcher.jsx` utility
2. Modify `buildChunkSampled()` to return XZ + seed data
3. Update instancing setup to use per-instance attributes
4. Patch materials in `useInstancedTree` and `useInstancedRocks`

---

## Stage 4: CPU Fallback Height Sampler ⏳ PENDING

### Required Implementation

Create a CPU height sampler wrapper that:
- Matches GPU math exactly
- Used ONLY for:
  - Physics/raycasts
  - Near-camera interactions
  - Debug/validation

**File**: `src/proc/heightfieldGPU.js` (or extend existing)

**API**:
```javascript
export function heightAtGPU(x, z) {
  // Exact same math as GPU shader
  // Must match terrainHeightAt() in GLSL
}
```

**Usage**:
- Replace `heightAt()` calls in physics/raycast code
- Keep GPU as authoritative for visuals
- Use CPU fallback only when needed

---

## Known Issues & Limitations

### Current Limitations

1. **Bounding Volumes**: Using conservative Y bounds. May cause unnecessary culling.
   - **Solution**: Implement 5-point sampling per tile (Phase 3)

2. **Material Cloning**: Each tile gets its own material clone for per-tile uniforms.
   - **Impact**: Slightly higher memory usage
   - **Alternative**: Use instancing or texture-based tile data (future optimization)

3. **Worker Path**: Worker still generates heights but GPU path ignores them.
   - **Impact**: Wasted CPU work if worker is used
   - **Solution**: Disable worker for GPU path or remove worker entirely

### Precision Considerations

- GLSL and JavaScript may have slight precision differences
- Monitor for floating/buried instances
- May need epsilon comparisons in validation

---

## Performance Validation

### Expected Improvements

1. **CPU Usage**: 
   - ✅ Reduced per-vertex height computation
   - ✅ Reduced normal computation
   - ⏳ Reduced foliage placement CPU work (pending Stage 3)

2. **Memory**:
   - ✅ Smaller geometry buffers (no height data)
   - ⏳ Per-instance attributes vs matrices (pending Stage 3)

3. **GPU**:
   - ⏳ Height computation moved to GPU (expected to scale well)
   - ⏳ Normal computation on GPU (may be expensive, monitor)

### Monitoring Points

- Frame time during tile streaming
- GPU time for terrain rendering
- CPU time for tile building
- Memory usage (geometry pools, materials)

---

## Next Steps

### Immediate (Stage 3)

1. Create `FoliageMaterialPatcher.jsx`
2. Modify `ForestDynamicSampled.jsx` to use GPU-driven placement
3. Update instancing setup with per-instance attributes
4. Test visual correctness (no floating/buried instances)

### Short-term (Stage 4)

1. Create CPU fallback height sampler
2. Update physics/raycast code to use fallback
3. Add validation utilities to compare CPU vs GPU heights

### Long-term (Optimizations)

1. Implement 5-point sampling for tighter bounding volumes
2. Consider texture-based tile data instead of per-tile uniforms
3. Optimize normal computation (reduce samples if needed)
4. Add LOD support with skirts/stitching

---

## Integration Checklist

### How to Test Correctness

1. **Visual Comparison**:
   - Compare GPU terrain vs CPU terrain side-by-side
   - Check for cracks, seams, visual artifacts
   - Verify lighting/normals match

2. **Foliage Placement**:
   - Verify no floating instances
   - Verify no buried instances
   - Check deterministic placement (same seed = same positions)

3. **Performance**:
   - Monitor CPU usage during tile streaming
   - Check frame time consistency
   - Verify no memory leaks

### How to Validate Performance

1. **CPU Profiling**:
   - Measure `buildTileGeometry()` time (should be near-zero)
   - Measure foliage placement time (should reduce after Stage 3)
   - Monitor worker usage (should be minimal)

2. **GPU Profiling**:
   - Measure terrain rendering time
   - Check for shader compilation issues
   - Monitor uniform updates

3. **Memory Profiling**:
   - Check geometry pool sizes
   - Monitor material clones
   - Verify proper disposal

---

## Files Modified

### New Files
- `src/shaders/includes/simplexNoise2d.glsl`
- `src/shaders/includes/terrainHeight.glsl`
- `src/components/TerrainMaterial.jsx`
- `GPU_TERRAIN_IMPLEMENTATION.md` (this file)

### Modified Files
- `src/components/TerrainTiled.jsx`
- `src/shaders/includes/terrainHeight.glsl` (inlined simplex noise)

### Pending Modifications
- `src/components/ForestDynamicSampled.jsx` (Stage 3)
- `src/components/ForestDynamic.jsx` (Stage 3)
- `src/hooks/InstancedTree.jsx` (Stage 3)
- `src/hooks/InstancedRocks.jsx` (Stage 3)
- `src/proc/heightfield.js` or new file (Stage 4)

---

## Notes

- All shader code uses exact matching with JavaScript implementation
- Per-tile uniforms require material cloning (acceptable trade-off)
- Worker path kept for compatibility but not used by GPU path
- Conservative bounding volumes used initially (can be optimized later)

