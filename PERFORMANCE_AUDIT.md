# Narrative Forest — Performance Audit Report

> Generated: January 30, 2026
> Scope: Full codebase inspection — active components, bottlenecks, tile generation system, GPU assessment

---

## Table of Contents

1. [Active Components Inventory](#1-active-components-inventory)
2. [Performance Bottlenecks (Severity-Ranked)](#2-performance-bottlenecks-severity-ranked)
3. [Tile Generation System Architecture](#3-tile-generation-system-architecture)
4. [GPU vs CPU Tile Generation Assessment](#4-gpu-vs-cpu-tile-generation-assessment)
5. [Optimization Recommendations](#5-optimization-recommendations)

---

## 1. Active Components Inventory

### 1.1 3D Scene (Inside R3F Canvas)

| # | Component | File | Role |
|---|-----------|------|------|
| 1 | `CustomSky` | `src/components/CustomSky.jsx` | Sky dome with lightning, saturation, hue shift |
| 2 | `Stars` | `src/components/Stars.jsx` | 10,000 star instances, shader-patched world-Y culling |
| 3 | `TerrainTiled` | `src/components/TerrainTiled.jsx` | Infinite procedural terrain (GPU-displaced flat grids) |
| 4 | `Cabin` | `src/components/Cabin.jsx` | GLTF actor |
| 5 | `Man` | `src/components/Man.jsx` | GLTF actor |
| 6 | `CatKTX2` | `src/components/CatKTX2.jsx` | KTX2-compressed GLTF actor |
| 7 | `RadioTower` | `src/components/RadioTower.jsx` | GLTF actor |
| 8 | `FakeLake` | `src/components/FakeLake.jsx` | Simplified lake geometry |
| 9 | `ForestDynamicSampled` | `src/components/ForestDynamicSampled.jsx` | Instanced trees + rocks with height sampling |
| 10 | `UnifiedCrystalClusters` | `src/components/UnifiedCrystalClusters.jsx` | Crystal formations |
| 11 | `IntroText` | `src/components/IntroText.jsx` | Narrative intro text |
| 12 | `DistanceFade` | `src/fog/DistanceFade.jsx` | Distance-based fragment discard (LOD system) |
| 13 | `Bloom` | Post-processing | intensity=1.35, luminanceThreshold=0.7, resScale=0.5 |
| 14 | `BrightnessContrast` | Post-processing | Global darken control |
| 15 | `DistanceBlurEffect` | `src/post/DistanceBlurEffect.jsx` | Conditional depth-of-field blur |
| 16 | `NoiseJitterEffect` | `src/post/NoiseJitterEffect.jsx` | Conditional film grain |
| 17 | `CameraControllerR3F` | `src/components/CameraControllerR3F.jsx` | Narrative camera path + free-fly mode |

### 1.2 UI Layer (Outside Canvas)

| # | Component | File |
|---|-----------|------|
| 18 | `LoadingScreen` | `src/components/LoadingScreen.jsx` |
| 19 | `DebugModeIndicator` | `src/components/DebugModeIndicator.jsx` |
| 20 | `ClickAndDragHint` | `src/components/ClickAndDragHint.jsx` |
| 21 | `StopCircleOverlay` | `src/components/StopCircleOverlay.jsx` |
| 22 | `PresetSelector` | `src/components/PresetSelector.jsx` |
| 23 | `PerformanceMetricsDisplay` | `src/components/PerformanceMetricsDisplay.jsx` |
| 24 | `FreeFlyJoystickOverlay` | `src/components/FreeFlyJoystickOverlay.jsx` |
| 25 | `Navbar` | `src/components/Navbar/Navbar.jsx` |

### 1.3 Hooks Running Per-Frame (`useFrame`)

| Hook | File | Purpose |
|------|------|---------|
| `useInfiniteTiles` | `src/hooks/useInfiniteTiles.js` | Camera tile tracking, ring set computation |
| `TerrainTiled` build loop | `src/components/TerrainTiled.jsx:476` | Budgeted tile build/remove dispatch |
| `ForestDynamicSampled` (main) | `src/components/ForestDynamicSampled.jsx:392` | Camera tracking, chunk build queue, retention |
| `ForestDynamicSampled` (apply) | `src/components/ForestDynamicSampled.jsx:631` | Instance matrix upload (priority 1) |
| `Experience` (first frame) | `src/Experience.jsx:110` | One-shot first-frame marker |
| `Experience` (preset transition) | `src/Experience.jsx:437` | Preset value interpolation |
| `CameraControllerR3F` | `src/components/CameraControllerR3F.jsx` | Camera pose application each frame |
| `DistanceFade` | `src/fog/DistanceFade.jsx` | Shader patching pass (throttled) |

**Total: 8 useFrame callbacks running every frame at 60fps.**

### 1.4 State Stores (Zustand)

| Store | File | Complexity |
|-------|------|------------|
| `useCameraStore` | `src/state/useCameraStore.js` | ~1200 lines, 40+ waypoints, free-fly physics |
| `useDebugStore` | `src/state/useDebugStore.js` | Simple boolean toggle |
| `useAudioStore` | `src/state/useAudioStore.js` | Simple mute toggle |
| `useNarrativeStore` | `src/state/useNarrativeStore.js` | Stub store |

### 1.5 Commented-Out / Inactive Components

These components exist in the codebase but are **not rendered**:

- `Butterfly` / `IntroButterfly` — animation variants
- `Lake` — full water shader lake (replaced by `FakeLake`)
- `FogParticleSystem` — particle-based fog
- `ForestDynamic` — raycast-based forest (replaced by `ForestDynamicSampled`)
- `Cat` / `CatNoTextures` — alternative cat models (replaced by `CatKTX2`)

---

## 2. Performance Bottlenecks (Severity-Ranked)

### CRITICAL #1 — Leva `useControls` overhead even when hidden

**Files:** `Experience.jsx:163-318`, `CameraControllerR3F.jsx:94-213`, `DistanceFade.jsx:34-54`, `Man.jsx:43-98`

Leva's `useControls` creates internal Zustand reactive slices. Setting `hidden: !isDebugMode` only hides the UI panel — the internal state subscription, diffing, and update broadcasting still runs every frame.

- `Experience.jsx`: 4 `useControls` calls with **50+ properties** across folders (Scene, Post, Atmosphere, Lights, Unified Fog, Sky, Sky/Haze, Sky/Color, Sky/Lightning, Post Ring Arch)
- `CameraControllerR3F.jsx`: **40+ properties** across Path, Look, Scroll, and FreeFly folders

**Impact:** ~90+ reactive properties syncing every frame regardless of debug mode. Each property triggers Zustand subscription callbacks and potential React re-renders.

---

### CRITICAL #2 — `new THREE.Color()` heap allocations during preset transitions

**File:** `Experience.jsx:420-424`

```js
const lerpColor = (colorA, colorB, t) => {
  const c1 = new THREE.Color(colorA);  // heap allocation
  const c2 = new THREE.Color(colorB);  // heap allocation
  return "#" + c1.lerp(c2, t).getHexString();
};
```

Called inside `useFrame` during transitions. With ~10 color properties transitioning over 2 seconds at 60fps:
- **2,400 Color object allocations** per transition
- Plus string concatenation for hex conversion
- Creates GC pressure spikes that can cause frame drops

---

### HIGH #3 — Set allocations in `tileMath.js` on every tile change

**File:** `src/proc/tileMath.js:37-72`

```js
export function ringSet(ix, iz, R, keyFn) {
  const s = new Set();  // new Set every call
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      s.add(keyFn(ix + dx, iz + dz));
    }
  }
  return s;
}
export const setDiff = (a, b) => new Set([...a].filter(k => !b.has(k)));
export const setUnion = (a, b) => new Set([...a, ...b]);
```

Every camera tile change triggers:
- 2x `ringSet` calls (load ring + retention ring) → 2 new Sets
- 1x `addPrefetch` → 1 new Set (copy of required)
- `setDiff` and `setUnion` in `useInfiniteTiles.js:82-89` → 2 more Sets + 2 array spreads

**Total: 5+ Set allocations and 2+ array spreads per tile change.**

---

### HIGH #4 — 7 separate `useEffect` hooks for individual uniforms

**File:** `src/fog/DistanceFade.jsx:88-109`

Each distance fade uniform (`uDF_Enable`, `uDF_DistStart`, `uDF_DistEnd`, `uDF_ClipStart`, `uDF_ClipEnd`, plus 2 more) gets its own `useEffect`. React schedules and runs these independently, causing redundant fiber work when multiple uniforms change together during preset transitions.

---

### HIGH #5 — `DistanceFade` warmup: 12 full scene traversals

**File:** `src/fog/DistanceFade.jsx:383-428`

During the first 120 frames (~2 seconds), `runPatchPass()` executes every 10 frames. Each pass calls `scene.traverse()` over the entire scene graph, checking every mesh against a `WeakSet`. With 50+ meshes in the scene, this is **12 full scene traversals** during startup.

---

### MEDIUM #6 — Material cloning per terrain tile

**File:** `src/components/TerrainTiled.jsx:348`

Every terrain tile gets `baseMaterial.clone()`, which deep-copies the material including its `onBeforeCompile` callback. With 25 tiles loaded (5x5 grid), that's **25 material clones**, each requiring shader recompilation by Three.js (identical source, different uniform references).

Geometry pooling exists (`acquireGeometry`/`releaseGeometry` at lines 266-344), but material pooling does not. Materials are created but never recycled.

---

### MEDIUM #7 — Array spreading in `ForestDynamicSampled.applyInstancing`

**File:** `src/components/ForestDynamicSampled.jsx:593-601`

```js
nearImmediateTrees.push(...rec.trees);
nearBufferTrees.push(...rec.trees);
rec.rocksByPart.forEach((arr, i) => rocksByPart[i].push(...arr));
```

Spread operator inside loops creates intermediate argument arrays. With ~50 active chunks and 10 trees per chunk, this spreads **500+ items per refresh cycle**.

---

### MEDIUM #8 — Console logs in production paths

**Files:** `Experience.jsx:489-492`, `DistanceFade.jsx:365-367`, `TerrainTiled.jsx:134,148`, `Forest.jsx:116-118`

Some `console.log/warn/info` calls are behind `process.env.NODE_ENV !== "production"` guards, but others (particularly in `TerrainTiled.jsx` and `DistanceFade.jsx`) fire unconditionally in hot paths.

---

### LOW #9 — `Object.keys().forEach()` in preset transition useFrame

**File:** `Experience.jsx:459`

Creates an array of keys per frame during active transitions. Minor but avoidable with `for...in`.

---

### LOW #10 — `heightCacheRef` uses BigInt keys

**File:** `src/components/TerrainTiled.jsx:249-264`

BigInt operations are ~5-10x slower than Number operations. The cache is only hit during CPU fallback path (when worker fails), so impact is low in normal operation.

---

## 3. Tile Generation System Architecture

### 3.1 System Overview

The terrain is an **infinite tiled system** using a hybrid CPU+GPU pipeline:

```
Camera position change
  └─ useInfiniteTiles (hooks/useInfiniteTiles.js)
       ├─ worldToTile(camera.x, camera.z) → [ix, iz]
       ├─ ringSet(ix, iz, loadRadius=2) → 25 required tiles (5x5)
       ├─ addPrefetch(forward direction) → extra tiles ahead
       └─ ringSet(ix, iz, dropRadius=3) → 49 retention tiles (7x7)
            └─ emit {required, retention} Sets via useState
                 └─ TerrainTiled.jsx useEffect (line 436)
                      ├─ Enqueue new tiles into buildQueue
                      └─ Mark tiles outside retention for removal
                           └─ TerrainTiled.jsx useFrame (line 476)
                                ├─ Remove expired tiles (cooldown: 2000ms)
                                └─ Build tiles within 4ms budget per frame
                                     ├─ Worker path: terrainTileWorker.js
                                     │    ├─ Compute heights (CPU simplex noise)
                                     │    ├─ Compute normals (finite differences)
                                     │    └─ Return Float32Array buffers (Transferable)
                                     └─ CPU fallback: flat grid geometry
                                          └─ mountTileMesh (line 346)
                                               ├─ Clone material + set per-tile uniforms
                                               ├─ Create mesh (frustumCulled=false)
                                               ├─ Set conservative bounding volumes
                                               ├─ Add to scene group
                                               └─ Emit DISTANCE_FADE_TILE_READY event
                                                    └─ GPU renders:
                                                         ├─ Vertex shader displaces flat grid
                                                         │  using terrainHeight.glsl (simplex noise)
                                                         ├─ GPU computes normals per-vertex
                                                         └─ DistanceFade discards distant fragments
```

### 3.2 Key Configuration

| Parameter | Value | Source |
|-----------|-------|--------|
| Tile size | 4 world units | `Experience.jsx:621` |
| Resolution | 4 segments → 5x5 = 25 vertices/tile | `Experience.jsx:712` |
| Load radius | 2 tiles → 5x5 grid = 25 tiles | `Experience.jsx:622` |
| Drop radius | 3 tiles → 7x7 = 49 tiles retained | `Experience.jsx:710` |
| Build budget | 4ms per frame | `TerrainTiled.jsx:36` |
| Max concurrent worker jobs | 2 | `TerrainTiled.jsx:37` |
| Unload cooldown | 2000ms | `TerrainTiled.jsx:35` |
| Noise type | Simplex 2D, 2-octave fBm | `heightfield.js` |
| Elevation | 7 | `heightfield.js:100` |
| Base height | 5 (mesh offset: -10) | `heightfield.js:107-108` |

### 3.3 Key Files

| File | Purpose |
|------|---------|
| `src/proc/tileMath.js` | World-to-tile coordinate math, ring/prefetch logic |
| `src/proc/heightfield.js` | CPU simplex noise, fBm, height sampling |
| `src/hooks/useInfiniteTiles.js` | Infinite grid management with hysteresis |
| `src/components/TerrainTiled.jsx` | Main orchestrator: build queue, worker dispatch, mounting |
| `src/components/TerrainMaterial.jsx` | GPU material factory with onBeforeCompile shader injection |
| `src/workers/terrainTileWorker.js` | Web Worker for async geometry building |
| `src/shaders/includes/terrainHeight.glsl` | GPU-side simplex noise + height computation |
| `src/fog/DistanceFade.jsx` | Fragment-level LOD via distance-based discard |

### 3.4 Critical Finding: Worker Does Redundant Work

The worker (`terrainTileWorker.js`) computes **full height and normal buffers** on the CPU via simplex noise. However, the GPU vertex shader in `terrainHeight.glsl` **recomputes all of this from scratch** each frame. The worker's output is written into geometry attributes but immediately overridden by the shader.

This is confirmed by the comment at `TerrainTiled.jsx:210-211`:
```js
// For GPU terrain, we ignore worker-generated positions/normals
// Worker path is kept for fallback but GPU path doesn't use it
```

The CPU fallback path (`buildTileGeometry` at line 427) doesn't even call `heightAt` — it just creates a flat grid. The worker's height/normal computation is **entirely wasted** in the GPU path.

### 3.5 Tile System Bottlenecks

| Issue | Severity | Details |
|-------|----------|---------|
| Material cloning (no pooling) | MEDIUM | 25 material clones on initial load, shader recompilation for each |
| Worker computing unused data | LOW | Heights/normals computed but GPU ignores them |
| Set allocations in tileMath | HIGH | 5+ new Sets per tile change |
| No material recycling | MEDIUM | Cloned materials never returned to a pool |
| frustumCulled=false | LOW | All 25 tiles render every frame; GPU handles visibility via DistanceFade |
| Single worker thread | LOW | Max 2 concurrent jobs; with 4ms budget, typically 1-2 tiles/frame anyway |

### 3.6 Memory Characteristics

| Resource | Per-Tile Size | Total (25 tiles) |
|----------|---------------|-------------------|
| Geometry (5x5 grid: 25 verts x 3 floats x 4 bytes) | ~300 bytes positions + 300 bytes normals | ~15 KB |
| Index buffer (16 quads x 6 indices x 2 bytes) | ~192 bytes | ~5 KB |
| Material clone | ~1 KB | ~25 KB |
| **Total geometry+material** | **~1.8 KB** | **~45 KB** |

Memory usage is minimal — the real cost is **shader compilation time** for 25 material clones.

---

## 4. GPU vs CPU Tile Generation Assessment

### 4.1 Current State: Already GPU-Based

The terrain system **already uses GPU-based vertex displacement**. The vertex shader in `terrainHeight.glsl` computes heights and normals per-vertex every frame. The CPU/worker path exists as a fallback but its output is unused.

The architecture is:
- **CPU side:** Tile lifecycle management (create/remove/queue), coordinate math, building flat grid geometry templates
- **GPU side:** All visual terrain computation (height displacement, normal calculation, fragment shading)

### 4.2 Option A: WebGPU Compute Shaders

| Factor | Assessment |
|--------|------------|
| **What it enables** | Generate tile geometry entirely on GPU, including bounding volumes; eliminate worker thread |
| **Browser support** | ~70% (Chrome, Edge, Firefox; no Safari stable as of early 2026) |
| **Implementation effort** | Massive — requires rewriting entire terrain pipeline, R3F integration unclear |
| **Data scale** | 25 tiles x 25 vertices = **625 total vertices**. GPU compute shines at 100k+ parallel operations |
| **Benefit** | Negligible — current bottlenecks are in JS orchestration, not GPU computation |

**Verdict: NOT RECOMMENDED.** The scale is far too small to benefit from GPU compute parallelism. The refactoring cost vastly outweighs any performance gain.

### 4.3 Option B: WebGL2 Transform Feedback

| Factor | Assessment |
|--------|------------|
| **What it enables** | Read back GPU-computed heights to CPU for accurate bounding volumes |
| **Complexity** | High — transform feedback is error-prone in R3F's managed pipeline |
| **Latency** | GPU→CPU readback adds 1-2 frames of delay |
| **Current workaround** | Conservative bounding estimates already implemented (elevation * 2 + margins) |

**Verdict: NOT RECOMMENDED.** Conservative bounds are sufficient. Transform feedback complexity isn't justified.

### 4.4 Option C: Optimize Existing GPU Path (RECOMMENDED)

The current architecture is fundamentally sound — flat grids displaced by vertex shaders is a proven pattern used in AAA terrain engines. The bottlenecks are entirely in the **JavaScript orchestration layer**:

1. **Strip the worker of height/normal computation** — it's wasted work
2. **Add material pooling** — eliminate 25 shader recompilations
3. **Re-enable frustum culling** — use worker-computed bounding volumes
4. **Reduce Set allocations** — pool/reuse Sets in tileMath

### 4.5 Final Recommendation

**Stay with the current GPU displacement approach.** The architecture is correct. Focus optimization effort on the JavaScript layer:
- Material pooling would save ~25 shader compilations on initial load
- Stripping the worker would save ~2-5ms per tile build
- Set pooling would eliminate 5+ allocations per tile change
- Leva removal in production would save ~90+ reactive property updates per frame

None of these require GPU pipeline changes. The vertex shader (`terrainHeight.glsl`) is efficient — 2-octave simplex noise with finite-difference normals on 25 vertices per tile is trivial for any modern GPU.

---

## 5. Optimization Recommendations

### Priority 1: Quick Wins (Highest Impact)

| # | Fix | File(s) | Expected Impact |
|---|-----|---------|-----------------|
| 1 | Eliminate Leva overhead in production (conditional `useControls` wrapper) | `Experience.jsx`, `CameraControllerR3F.jsx`, `DistanceFade.jsx`, `Man.jsx` | Remove ~90 reactive property updates/frame |
| 2 | Pre-allocate Color objects in `lerpColor` | `Experience.jsx:420-424` | Eliminate 2,400 allocations per preset transition |
| 3 | Consolidate DistanceFade uniform useEffects into 1 | `fog/DistanceFade.jsx:88-109` | Reduce React fiber work by 6x for uniform updates |
| 4 | Pool/reuse Sets in tileMath | `proc/tileMath.js:37-72` | Eliminate 5+ Set allocations per tile change |

### Priority 2: Tile System

| # | Fix | File(s) | Expected Impact |
|---|-----|---------|-----------------|
| 5 | Strip worker of unused height/normal computation | `workers/terrainTileWorker.js`, `TerrainTiled.jsx` | Save ~2-5ms per tile build |
| 6 | Add material pooling alongside geometry pooling | `TerrainTiled.jsx:346-415` | Eliminate 25 shader recompilations on load |
| 7 | Re-enable frustum culling with computed bounds | `TerrainTiled.jsx:366-368` | Skip rendering off-screen tiles |

### Priority 3: Forest & Cleanup

| # | Fix | File(s) | Expected Impact |
|---|-----|---------|-----------------|
| 8 | Replace spread operators in applyInstancing | `ForestDynamicSampled.jsx:593-601` | Eliminate intermediate arrays for 500+ items |
| 9 | Reduce DistanceFade warmup (120→60 frames, throttle 10→15) | `DistanceFade.jsx:383-428` | Halve scene traversals during startup |
| 10 | Guard all console output behind production checks | Multiple files | Remove logging overhead in production |
| 11 | Replace `Object.keys().forEach()` with `for...in` | `Experience.jsx:459` | Minor: avoid array allocation in useFrame |

---

## Appendix: Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.1.1 | UI framework |
| Three.js | 0.178.0 | 3D rendering |
| React Three Fiber | 9.3.0 | React bindings for Three.js |
| React Three Drei | 10.6.1 | R3F utility components |
| Zustand | 5.0.6 | State management |
| GSAP | 3.12.5 | Animation library |
| Vite | 7.0.4 | Build tool |
| Postprocessing | 6.37.7 | Post-processing effects |
| Leva | 0.10.0 | Debug UI controls |
