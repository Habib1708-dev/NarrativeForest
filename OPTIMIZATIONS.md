# Remaining Performance Optimizations

## Phase 2: Enable Frustum Culling

Frustum culling is disabled (`frustumCulled={false}`) on nearly all meshes. Off-screen geometry is still processed by the GPU even when not visible, which is the primary cause of FPS drops during camera movement.

### 2.1 Crystals (Safe, Low Risk)
**File:** `src/components/UnifiedCrystalClusters.jsx` (~lines 1351, 1360, 1369)

Set `frustumCulled={true}` on all three `InstancedMesh` components. Crystals are localized in the scene so culling is straightforward.

### 2.2 Forest Instances (Medium Risk)
**File:** `src/components/ForestDynamicSampled.jsx` (lines 280, 618, 628, 638)

Change `m.frustumCulled = false` to `true` on all instanced meshes. Call `mesh.computeBoundingSphere()` after each instance matrix update so Three.js can cull correctly.

### 2.3 Terrain Tiles (Needs Conservative Bounds)
**File:** `src/components/TerrainTiled.jsx` (line 368)

Enable culling but expand the bounding box to account for GPU vertex displacement:
```js
mesh.frustumCulled = true;
mesh.geometry.boundingBox.max.y = maxElevation;
mesh.geometry.boundingSphere.radius *= 1.5;
```

---

## Phase 3: Remove Dead Code

### 3.1 Crystal Hover Detection
**File:** `src/components/UnifiedCrystalClusters.jsx`

The hover system is disabled but code still runs every frame. Remove:
- Hover-related refs (`crystalHoverRef`, `hoverMixRef`, color tracking arrays) around lines 1189-1278
- `useFrame` hover detection logic around lines 1280-1339
- `anyHoveredFor()` function if unused

---

## Phase 4: Advanced Optimizations

### 4.1 Distance-Based Instance Culling for Trees
**File:** `src/components/ForestDynamicSampled.jsx`

Filter tree/rock instances by distance from camera before writing to the instanced mesh buffer. Only render instances within a radius (e.g., 8 units). This reduces vertex count dynamically as the camera moves.

### 4.2 Shared Terrain Material
**File:** `src/components/TerrainTiled.jsx`

Each tile currently clones the base material (`baseMaterial.clone()`), causing separate shader compilations and GPU state switches. Use a single shared material with per-tile data passed via custom vertex attributes or a uniform array.

### 4.3 Reduce or Disable Bloom
**File:** `src/Experience.jsx` (EffectComposer section)

Bloom is already optimized (0.5 resolution, VERY_SMALL kernel) but still adds a full-screen post-processing pass. If FPS is still insufficient, disable it entirely by setting `intensity={0}`.

### 4.4 Reduce Volumetric Fog Cost (If Re-enabled)
**File:** `src/post/VolumetricFogPass.jsx`

VolumetricFogPass is not currently active, but if re-enabled:
- Reduce ray march steps from 48 to 24
- Reduce noise octaves from 4 to 2
- Lower resolution scale from 0.75 to 0.5
- Add aggressive early-exit on transmittance (`< 0.01`)
