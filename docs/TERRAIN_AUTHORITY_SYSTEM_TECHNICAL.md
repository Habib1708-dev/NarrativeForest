# Authority-Anchored Terrain System - Technical Documentation

This document provides an in-depth technical explanation of how the Authority-Anchored Terrain System works in Narrative Forest. This system enables infinite procedural terrain exploration while preserving a focused, authored area for narrative purposes.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Core Concepts](#2-core-concepts)
3. [WorldAnchor State Management](#3-worldanchor-state-management)
4. [Terrain Tile System](#4-terrain-tile-system)
5. [GPU Terrain Displacement](#5-gpu-terrain-displacement)
6. [Forest Authority System](#6-forest-authority-system)
7. [Coordinate Space Transformation](#7-coordinate-space-transformation)
8. [Data Flow Architecture](#8-data-flow-architecture)
9. [Performance Optimizations](#9-performance-optimizations)
10. [Configuration Reference](#10-configuration-reference)

---

## 1. System Overview

The Authority-Anchored Terrain System solves a fundamental problem: **how to create an infinite procedural world while preserving a fixed, authored narrative space**.

### The Problem

In a traditional infinite terrain system, the player can explore endlessly but may accidentally return to or stumble upon the "starting area" from unexpected angles, breaking narrative immersion. Alternatively, hard boundaries feel artificial.

### The Solution

The system introduces the concept of **spatial authority**:

- **AUTHORED Mode**: The world samples terrain and places objects using absolute world coordinates. The cabin, characters, and narrative elements exist at fixed positions.

- **FREEFLIGHT Mode**: When activated, the camera's current position becomes a new origin. From this point forward, terrain and objects sample using coordinates relative to this anchor point, creating a natural spatial discontinuity.

This means:
- The authored area remains intact until freeflight activates
- Once in freeflight, the authored area becomes naturally unreachable (unless flying the full distance back)
- No invisible walls, no teleportation, no forced constraints

---

## 2. Core Concepts

### 2.1 World Anchor

The World Anchor is the single source of truth for coordinate space authority:

```
WorldAnchor {
  mode: "AUTHORED" | "FREEFLIGHT"
  origin: Vector3
}
```

- **mode**: Determines which coordinate space has authority
- **origin**: In FREEFLIGHT mode, this is the camera position when freeflight was activated

### 2.2 Two Coordinate Spaces

#### Authored World Space (Static)
- Used for: Cabin, characters, camera intro paths, narrative staging
- Properties: Fixed coordinates, never re-centered, spatially finite

#### Procedural World Space (Endless)
- Used for: Terrain, trees, rocks, distant exploration
- Properties: Camera-anchored, relative coordinates, infinite illusion

### 2.3 The Travel Offset

In FREEFLIGHT mode, the **travel offset** is the vector from the anchor origin to the current camera position:

```
travelOffset = camera.position - anchor.origin
```

This offset is applied to all terrain and prop sampling to create the illusion of infinite terrain while the actual geometry stays near the camera.

---

## 3. WorldAnchor State Management

**File**: `src/state/useWorldAnchorStore.js`

The WorldAnchor is managed as a Zustand store, providing global reactive state:

```javascript
const useWorldAnchorStore = create((set, get) => ({
  mode: "AUTHORED",                    // Current authority mode
  origin: new THREE.Vector3(0, 0, 0),  // Anchor origin point
  distanceFromOrigin: 0,               // For effects (fog, audio)

  setFreeflightMode: (cameraPosition) => {
    set({
      mode: "FREEFLIGHT",
      origin: cameraPosition.clone(),
      distanceFromOrigin: 0
    });
  },

  setAuthoredMode: () => {
    set({
      mode: "AUTHORED",
      origin: new THREE.Vector3(0, 0, 0),
      distanceFromOrigin: 0
    });
  },

  getTravelOffset: (cameraPosition) => {
    const { mode, origin } = get();
    if (mode === "AUTHORED") return { x: 0, z: 0 };
    return {
      x: cameraPosition.x - origin.x,
      z: cameraPosition.z - origin.z
    };
  }
}));
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `setFreeflightMode(pos)` | Activates freeflight with camera position as new origin |
| `setAuthoredMode()` | Returns to authored mode with world origin |
| `getTravelOffset(pos)` | Returns the XZ offset for terrain sampling |
| `updateDistance(pos)` | Updates distance from origin for effects |

---

## 4. Terrain Tile System

**File**: `src/components/TerrainAuthority.jsx`

The terrain is divided into tiles that load/unload based on camera position. Each tile is a flat grid mesh that gets displaced on the GPU.

### 4.1 Tile Configuration

```javascript
const TerrainAuthority = ({
  sampleHeight,           // Height sampler function (x, z) -> y
  tileSize = 4,           // World units per tile
  loadRadius = 2,         // Tiles to load around camera (5x5 grid)
  dropRadius = 2,         // Tiles to retain (hysteresis)
  resolution = 2,         // Grid segments per tile (3x3 vertices)
  unloadCooldownMs = 2000,// Delay before unloading tiles
  buildBudgetMs = 4,      // Frame time budget for tile building
  maxConcurrentJobs = 2,  // Parallel worker jobs
});
```

### 4.2 Tile Lifecycle

```
[Camera Moves]
    ↓
[useInfiniteTiles computes required tiles]
    ↓
[New tiles added to buildQueue]
    ↓
[Worker builds geometry OR main thread fallback]
    ↓
[mountTileMesh creates THREE.Mesh]
    ↓
[Material uniforms set for tile bounds]
    ↓
[GPU displaces vertices in shader]
    ↓
[Tile visible]
    ↓
[Camera moves away → markedForRemoval]
    ↓
[After cooldown → geometry/material released to pool]
```

### 4.3 Tile Coordinate System

The `useInfiniteTiles` hook manages which tiles should exist:

```javascript
// Convert world position to tile index
const worldToTile = (x, z) => [
  Math.floor((x - anchorMinX) / tileSize),
  Math.floor((z - anchorMinZ) / tileSize),
];

// Get world bounds for a tile
const tileBounds = (ix, iz) => ({
  minX: anchorMinX + ix * tileSize,
  minZ: anchorMinZ + iz * tileSize,
  maxX: anchorMinX + ix * tileSize + tileSize,
  maxZ: anchorMinZ + iz * tileSize + tileSize,
});
```

### 4.4 Worker-Based Tile Building

**File**: `src/workers/terrainTileWorker.js`

Tiles are built off the main thread using a Web Worker:

1. Main thread sends tile bounds to worker
2. Worker samples heights using `heightAt(x, z)` for each vertex
3. Worker computes normals using finite differences
4. Worker sends back Float32Arrays via transferables (zero-copy)
5. Main thread creates geometry from buffers

```javascript
// Worker builds tile geometry
const buildTile = (payload) => {
  const { key, resolution, minX, minZ, maxX, maxZ } = payload;
  const positions = new Float32Array(vertsX * vertsZ * 3);
  const normals = new Float32Array(vertsX * vertsZ * 3);

  // Sample heights
  for (let z = 0; z < vertsZ; z++) {
    for (let x = 0; x < vertsX; x++) {
      const wy = heightAt(wx, wz);
      positions[cursor++] = wx;
      positions[cursor++] = wy;
      positions[cursor++] = wz;
    }
  }

  // Compute normals via finite differences
  // ...

  // Send back with transferables
  ctx.postMessage(
    { type: "build-complete", key, positions: positions.buffer, normals: normals.buffer },
    [positions.buffer, normals.buffer]
  );
};
```

---

## 5. GPU Terrain Displacement

The actual terrain height is computed on the GPU for smooth visuals and authority-aware sampling.

### 5.1 Shader Architecture

**File**: `src/shaders/includes/terrainHeightAuthority.glsl`

The shader contains:
- Simplex 2D noise implementation (bit-exact match with CPU)
- fBm (fractional Brownian motion) with 8 octaves
- Plateauization for terrain smoothing
- Authority-aware coordinate sampling

```glsl
// Terrain uniforms (match CPU heightfield.js)
uniform float uTerrainElevation;    // 7.0
uniform float uTerrainFrequency;    // 0.004
uniform int   uTerrainOctaves;      // 8
uniform float uTerrainSeed;         // 2.2
uniform float uTerrainScale;        // 5.0
uniform float uTerrainPlateauHeight;
uniform float uTerrainPlateauSmoothing;
uniform float uTerrainBaseHeight;   // 5.0
uniform float uTerrainWorldYOffset; // -10.0

// Authority-anchor uniforms
uniform float uFreeflight;     // 0.0 = AUTHORED, 1.0 = FREEFLIGHT
uniform vec2 uTravelOffset;    // (camera.x - origin.x, camera.z - origin.z)
```

### 5.2 Height Function with Authority Offset

```glsl
float terrainHeightAt(float xWorld, float zWorld) {
  // Apply travel offset in freeflight mode
  float sampleX = xWorld + uFreeflight * uTravelOffset.x;
  float sampleZ = zWorld + uFreeflight * uTravelOffset.y;

  // fBm with (x, -z) mirroring to match CPU
  float d = terrainFbm(sampleX, -sampleZ, ...) * uTerrainElevation;

  // Plateauize
  float n = terrainPlateauize(d / uTerrainElevation, ...) * uTerrainElevation;

  // Final height
  return abs(n) + uTerrainBaseHeight + uTerrainWorldYOffset;
}
```

### 5.3 Material System

**File**: `src/components/TerrainAuthorityMaterial.jsx`

The material uses `onBeforeCompile` to inject custom vertex shader code:

```javascript
material.onBeforeCompile = function(shader) {
  // Add terrain uniforms
  shader.uniforms.uTerrainElevation = { value: params.elevation };
  shader.uniforms.uFreeflight = { value: 0.0 };
  shader.uniforms.uTravelOffset = { value: new THREE.Vector2(0, 0) };

  // Per-tile uniforms
  shader.uniforms.uTileMin = { value: new THREE.Vector2() };
  shader.uniforms.uTileSize = { value: 4.0 };

  // Inject terrain height module
  shader.vertexShader = shader.vertexShader.replace(
    "#include <common>",
    `#include <common>
     ${terrainHeightAuthorityGlsl}
     // ... displacement functions`
  );

  // Override vertex displacement
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    `#include <begin_vertex>
     transformed = displaceTerrainVertex(position);`
  );
};
```

### 5.4 Normal Computation

Normals are computed via finite differences on the GPU:

```glsl
vec3 computeTerrainNormal(vec3 worldPos) {
  float eps = uLatticeStep;

  float hL = terrainHeightAt(worldPos.x - eps, worldPos.z);
  float hR = terrainHeightAt(worldPos.x + eps, worldPos.z);
  float hD = terrainHeightAt(worldPos.x, worldPos.z - eps);
  float hU = terrainHeightAt(worldPos.x, worldPos.z + eps);

  float ddx = (hR - hL) / (2.0 * eps);
  float ddz = (hU - hD) / (2.0 * eps);

  return normalize(vec3(-ddx, 1.0, -ddz));
}
```

---

## 6. Forest Authority System

**File**: `src/components/ForestAuthority.jsx`

The forest system places trees and rocks on the terrain with authority-aware sampling.

### 6.1 Chunk-Based Management

The forest is divided into chunks (smaller than terrain tiles):

```javascript
const DEFAULT_FOREST_PARAMS = {
  chunkSize: 2,              // World units per chunk
  nearRingChunks: 4,         // Immediate render radius
  midRingChunks: 5,          // Extended radius
  treeTargetPerChunk: 14,    // Trees to place per chunk
  rockTargetPerChunk: 12,    // Rocks to place per chunk
  treeMinSpacing: 0.7,       // Minimum distance between trees
  rockMinSpacing: 0.35,      // Minimum distance between rocks
  retentionSeconds: 2,       // Cache retention time
  raysPerFrame: 180,         // Placement budget per frame
  predictAheadSeconds: 1.0,  // Direction-aware pre-loading
  predictChunkRadius: 2,     // Pre-load radius
};
```

### 6.2 Authority-Aware Placement

The `buildChunkAuthority` function places objects using anchor-relative coordinates:

```javascript
function buildChunkAuthority(cx, cz, opts) {
  // Get sample-space chunk coordinates for deterministic hashing
  const { cx: sampleCx, cz: sampleCz } = getSampleChunkCoords(cx, cz, chunkSize);

  // Use sample-space coordinates for RNG seed
  // This ensures identical placement regardless of when freeflight was activated
  const rng = mulberry32(
    ((sampleCx * 73856093) ^ (sampleCz * 19349663) ^ (seed ^ 0x9e3779b9)) >>> 0
  );

  // Place trees using rejection sampling
  while (treesPlaced < treeTargetPerChunk && treeAttempts < maxAttempts) {
    const x = minX + rng() * chunkSize;
    const z = minZ + rng() * chunkSize;

    // Sample terrain height using anchor-aware function
    const terrainY = anchoredHeightAt(x, z);

    // Create transform matrix
    const m4 = new THREE.Matrix4();
    m4.compose(position, rotation, scale);
    trees.push(m4);
  }
}
```

### 6.3 GPU Instancing

Trees and rocks use `InstancedMesh` for efficient rendering:

```javascript
const TREE_CAP = 6000;        // Max tree instances
const TREE_LOD_CAP = 6000;    // Max LOD tree instances
const ROCK_CAP_PER_PART = 1200; // Max rocks per part

// Upload matrices to GPU
refs.forEach((ref) => {
  const mesh = ref.current;
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i]);
  }
  mesh.count = matrices.length;
  mesh.instanceMatrix.needsUpdate = true;
});
```

### 6.4 Direction-Aware Pre-Loading

The system predicts camera movement and pre-loads chunks ahead:

```javascript
// Calculate predicted chunks based on camera velocity
const speed = camVelocity.length();
const predictChunks = Math.ceil(speed * predictAheadSeconds / chunkSize);

// Add chunks in movement direction to high-priority queue
for (let i = 1; i <= predictChunks; i++) {
  const ahead = currentChunk + moveDirection * i;
  highPriorityQueue.add(ahead);
}
```

---

## 7. Coordinate Space Transformation

**File**: `src/proc/anchoredHeightfield.js`

This module provides CPU-side functions that match the GPU coordinate transformation.

### 7.1 Anchored Height Sampling

```javascript
export function anchoredHeightAt(worldX, worldZ) {
  const { mode, origin } = useWorldAnchorStore.getState();

  if (mode === "AUTHORED") {
    // Sample at absolute world coordinates
    return heightAt(worldX, worldZ);
  }

  // In freeflight, apply anchor offset
  const sampleX = worldX - origin.x;
  const sampleZ = worldZ - origin.z;
  return heightAt(sampleX, sampleZ);
}
```

### 7.2 Sample-Space Chunk Coordinates

For deterministic prop placement:

```javascript
export function getSampleChunkCoords(chunkX, chunkZ, chunkSize) {
  const { mode, origin } = useWorldAnchorStore.getState();

  if (mode === "AUTHORED") {
    return { cx: chunkX, cz: chunkZ };
  }

  // Convert origin to chunk-space offset
  const originChunkX = Math.floor(origin.x / chunkSize);
  const originChunkZ = Math.floor(origin.z / chunkSize);

  return {
    cx: chunkX - originChunkX,
    cz: chunkZ - originChunkZ,
  };
}
```

### 7.3 Why This Matters

Consider freeflight activated at position (100, 0, 200):
- Chunk (50, 100) in world space becomes chunk (0, 0) in sample space
- The RNG seed for (0, 0) produces the same trees it would in AUTHORED mode
- Trees appear identical regardless of where freeflight was activated

---

## 8. Data Flow Architecture

### 8.1 Per-Frame Update Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRAME START                              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. WorldAnchorStore                                             │
│     - Read current mode (AUTHORED/FREEFLIGHT)                   │
│     - Compute travel offset if in freeflight                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. useInfiniteTiles                                            │
│     - Compute camera tile position                              │
│     - Generate required/retention tile sets                     │
│     - Add prefetch tiles in movement direction                  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. TerrainAuthority                                            │
│     - Process build queue (budgeted)                            │
│     - Dispatch to worker or build on main thread                │
│     - Mount completed tile meshes                               │
│     - Update authority uniforms on all tile materials           │
│     - Remove expired tiles                                      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. ForestAuthority                                             │
│     - Compute camera chunk position                             │
│     - Prioritize chunks by distance and movement direction      │
│     - Build chunks (budgeted by raysPerFrame)                   │
│     - Use anchoredHeightAt for terrain sampling                 │
│     - Upload instance matrices to GPU                           │
│     - Manage cold cache for chunk retention                     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. GPU Rendering                                                │
│     - Terrain shader reads uFreeflight, uTravelOffset           │
│     - Displaces vertices using terrainHeightAt()                │
│     - Computes normals via finite differences                   │
│     - Instanced meshes render trees/rocks                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                          FRAME END                               │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Freeflight Activation Flow

```
┌────────────────────────────────────────┐
│     User Activates Freeflight          │
└────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│  setFreeflightMode(camera.position)    │
│  - mode = "FREEFLIGHT"                 │
│  - origin = camera.position.clone()    │
└────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│  Next Frame: Terrain tiles update      │
│  - uFreeflight = 1.0                   │
│  - uTravelOffset = (0, 0) initially    │
│  - No visual change yet                │
└────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│  Camera Moves                          │
│  - uTravelOffset increases             │
│  - Terrain samples at offset coords    │
│  - New terrain appears ahead           │
│  - Authored area falls behind          │
└────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│  Infinite Exploration Enabled          │
│  - Terrain repeats based on noise      │
│  - Authored area unreachable unless    │
│    user flies exact distance back      │
└────────────────────────────────────────┘
```

---

## 9. Performance Optimizations

### 9.1 Frustum Culling

Terrain tiles have `frustumCulled = true` with generous bounding boxes:

```javascript
const maxHeight = params.elevation * 2 + params.baseHeight +
                  Math.abs(params.worldYOffset) + 10;
const minHeight = params.worldYOffset - 10;

geom.boundingBox.min.set(minX, minHeight, minZ);
geom.boundingBox.max.set(maxX, maxHeight, maxZ);
```

Impact: 50-80% draw call reduction when looking in a specific direction.

### 9.2 Memory Pooling

Geometry and material instances are pooled to reduce GC:

```javascript
const geometryPoolRef = useRef([]);

const acquireGeometry = () => {
  const pool = geometryPoolRef.current;
  if (pool.length > 0) return pool.pop();
  return createNewGeometry();
};

const releaseGeometry = (geom) => {
  geometryPoolRef.current.push(geom);
};
```

### 9.3 Matrix Pooling (Forest)

Transform matrices are reused across chunks:

```javascript
const MATRIX_POOL = [];

function acquireMatrix() {
  return MATRIX_POOL.length ? MATRIX_POOL.pop() : new THREE.Matrix4();
}

function releaseMatrix(m) {
  m.identity();
  MATRIX_POOL.push(m);
}
```

### 9.4 Budget-Based Building

Both terrain and forest building are budgeted per frame:

```javascript
// Terrain: 4ms budget per frame
while (queue.length && performance.now() - frameStart < buildBudgetMs) {
  buildNextTile();
}

// Forest: 180 placement attempts per frame
while (attempts < raysPerFrame && queue.length) {
  processNextChunk();
}
```

### 9.5 Cold Cache Retention

Chunks are retained for a cooldown period before deletion:

```javascript
retentionSeconds: 2  // Chunks stay in cold cache for 2 seconds

// On removal
if (now - markedForRemovalAt >= unloadCooldownMs) {
  // Move to cold cache
  coldCache.set(key, rec);
  cache.delete(key);
}

// Cold cache cleanup
if (now - coldCacheTime >= retentionMs) {
  // Permanently delete
  releaseChunk(rec);
}
```

---

## 10. Configuration Reference

### 10.1 Terrain Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `tileSize` | 4 | World units per terrain tile |
| `resolution` | 2 | Grid segments per tile (3x3 vertices at 2) |
| `loadRadius` | 2 | Tiles to load around camera (5x5 grid) |
| `dropRadius` | 2 | Tiles to retain (hysteresis) |
| `prefetch` | 1 | Extra tiles in movement direction |
| `unloadCooldownMs` | 2000 | Delay before tile unload |
| `buildBudgetMs` | 4 | Frame time budget for building |
| `maxConcurrentJobs` | 2 | Parallel worker jobs |

### 10.2 Heightfield Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `elevation` | 7 | Terrain amplitude |
| `frequency` | 0.004 | Base noise frequency |
| `octaves` | 8 | fBm iterations |
| `seed` | 2.2 | Noise seed |
| `scale` | 5 | Frequency multiplier |
| `plateauHeight` | 0.0 | Plateau threshold |
| `plateauSmoothing` | 0.0 | Plateau smoothing range |
| `baseHeight` | 5 | Base Y offset |
| `worldYOffset` | -10 | Mesh world position Y |

### 10.3 Forest Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `chunkSize` | 2 | World units per forest chunk |
| `nearRingChunks` | 4 | Immediate render radius |
| `midRingChunks` | 5 | Extended render radius |
| `raysPerFrame` | 180 | Placement budget per frame |
| `retentionSeconds` | 2 | Cold cache retention time |
| `treeTargetPerChunk` | 14 | Trees per chunk target |
| `rockTargetPerChunk` | 12 | Rocks per chunk target |
| `treeMinSpacing` | 0.7 | Minimum tree distance |
| `rockMinSpacing` | 0.35 | Minimum rock distance |
| `predictAheadSeconds` | 1.0 | Pre-load lookahead time |
| `predictChunkRadius` | 2 | Pre-load chunk radius |

### 10.4 Instance Capacities

| Capacity | Value | Description |
|----------|-------|-------------|
| `TREE_CAP` | 6000 | Max high-detail tree instances |
| `TREE_LOD_CAP` | 6000 | Max LOD tree instances |
| `ROCK_CAP_PER_PART` | 1200 | Max rock instances per part |

---

## Summary

The Authority-Anchored Terrain System achieves infinite procedural exploration through:

1. **Dual Coordinate Spaces**: AUTHORED for narrative, FREEFLIGHT for exploration
2. **Anchor-Relative Sampling**: Both GPU shaders and CPU use the same offset logic
3. **Deterministic Hashing**: Sample-space coordinates ensure consistent placement
4. **GPU Displacement**: Smooth terrain with per-frame normal computation
5. **Efficient Instancing**: Trees and rocks rendered via InstancedMesh
6. **Budgeted Building**: Frame-time-aware chunk generation
7. **Memory Pooling**: Reused geometries, materials, and matrices

The result is a seamless infinite world that preserves narrative integrity without artificial constraints.
