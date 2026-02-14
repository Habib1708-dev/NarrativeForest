# TerrainTiledOpt — How the Terrain is Built

This document explains how `TerrainTiledOpt` generates the ground you walk on. No prior graphics knowledge needed.

---

## The Big Idea

The world is too large to build all at once. Instead, we split the ground into small square **tiles** and only build the ones near the camera. As you move, new tiles appear ahead of you and old ones behind you get cleaned up.

Each tile starts as a flat grid of points. A **Web Worker** (a background thread) calculates the height of every point using math-based noise, turning the flat grid into hills and valleys. Once done, the finished tile is handed to the GPU to draw — and it never needs to be recalculated.

---

## Step by Step

### 1. Decide Which Tiles to Load

The `useInfiniteTiles` hook watches the camera position and picks which tiles are needed:

```
Camera is here: [x, z]
         ┌───┬───┬───┬───┬───┐
         │   │   │   │   │   │
         ├───┼───┼───┼───┼───┤
         │   │   │   │   │   │
         ├───┼───┼───┼───┼───┤
         │   │   │ * │   │   │   * = camera
         ├───┼───┼───┼───┼───┤
         │   │   │   │   │   │
         ├───┼───┼───┼───┼───┤
         │   │   │   │   │   │
         └───┴───┴───┴───┴───┘

Load radius = 2  →  loads a 5x5 grid around you (25 tiles)
Drop radius = 3  →  keeps a 7x7 grid alive (49 tiles)
```

The gap between load and drop radius is called **hysteresis**. It prevents tiles from flickering on and off when you stand at a tile boundary.

Tiles in the camera's forward direction are also **prefetched** early so terrain is ready before you get there.

### 2. Sort by Distance

New tiles are sorted so the **closest ones build first**. This way the ground directly under you appears before distant terrain.

### 3. Send to the Worker

Each tile is sent to a **Web Worker** — a separate CPU thread that does heavy math without freezing the game. The worker receives the tile's world-space bounds:

```
{ minX: 4, minZ: 8, maxX: 8, maxZ: 12, resolution: 4 }
```

### 4. Worker Builds the Geometry

The worker does two passes over the tile's grid of vertices:

**Pass 1 — Heights:**
For each point in the grid, compute its world position and sample the noise function to get the height (Y value). This uses fractal Brownian motion — layers of simplex noise stacked on top of each other to create natural-looking hills.

```
Flat grid (before):          Displaced grid (after):
  .   .   .   .   .           .       .   .
  .   .   .   .   .              .  .       .
  .   .   .   .   .           .    .    .     .
  .   .   .   .   .            .       .   .
  .   .   .   .   .          .    .       .
```

**Pass 2 — Normals:**
For each point, look at its neighbors to figure out which direction the surface faces. This is done with **finite differences** — comparing the height on the left vs. right and above vs. below:

```
           h_up
            |
  h_left —— P —— h_right     normal = normalize(-slope_x, 1, -slope_z)
            |
          h_down
```

The worker also tracks the lowest and highest Y values to compute an **exact bounding box** — a tight box that perfectly wraps the tile's geometry.

### 5. Send Results Back

The worker posts back:
- **Positions** — Float32Array of [x, y, z] for every vertex
- **Normals** — Float32Array of [nx, ny, nz] for every vertex
- **Bounding box** — exact min/max in all 3 axes
- **Bounding sphere** — center + radius

These arrays are transferred with **zero-copy** (the browser moves memory ownership instead of duplicating it).

### 6. Mount the Mesh

Back on the main thread:
1. Grab a recycled geometry from the **pool** (or create one if empty)
2. Copy the worker's positions and normals into the geometry's buffers
3. Set the exact bounding box and sphere on the geometry
4. Create a `THREE.Mesh` using the geometry and a **single shared material**
5. Add it to the scene

The mesh has `frustumCulled = true` — Three.js will skip drawing tiles that are off-screen, saving GPU work.

### 7. Tile Removal

When you move away, tiles outside the drop radius are marked for removal but given a **2-second cooldown**. If you turn around quickly, they're still there — no need to regenerate.

After the cooldown, the tile's geometry is returned to the pool for reuse.

---

## Why This is Fast

| What | How it helps |
|---|---|
| **Worker thread** | Height math runs on a separate CPU core. The main thread stays smooth at 60fps. |
| **Build once** | Each tile's geometry is computed once and never recalculated. The terrain doesn't change, so no work is repeated. |
| **Shared material** | All tiles use the same material. The GPU compiles **one** shader program total, not one per tile. |
| **Frustum culling** | Tiles behind the camera are not drawn. Saves roughly half the draw calls. |
| **Geometry pooling** | Old geometries are recycled instead of being destroyed and recreated. No garbage collection pressure. |
| **Build budget** | Only 4ms of tile work per frame. Even if 25 tiles are needed, they trickle in over several frames instead of causing a spike. |
| **Distance sorting** | Closest tiles build first, so the ground under you is never missing. |
| **Hysteresis + cooldown** | Prevents wasteful destroy/rebuild cycles at tile boundaries. |

---

## Key Files

| File | What it does |
|---|---|
| `src/components/terrain/TerrainTiledOpt.jsx` | Main component. Manages tile lifecycle, pooling, worker dispatch, and mesh mounting. |
| `src/components/terrain/TerrainTiledOptMaterial.jsx` | Creates the single shared material used by all tiles. |
| `src/workers/terrainTileWorker.js` | Web Worker that computes vertex positions, normals, and bounding volumes. |
| `src/hooks/useInfiniteTiles.js` | Decides which tiles to load/keep/drop based on camera position. |
| `src/proc/tileMath.js` | Tile coordinate math — converting between world and tile space. |
| `src/proc/heightfield.js` | The noise function that turns (x, z) into a height value. |

---

## How to Switch Terrain Systems

In `src/Experience.jsx`, change the `TERRAIN_MODE` constant:

```js
const TERRAIN_MODE = "opt";       // TerrainTiledOpt (recommended)
const TERRAIN_MODE = "authority";  // TerrainAuthority (anchored system)
const TERRAIN_MODE = "tiled";      // TerrainTiled (original GPU displacement)
```

All three systems accept the same props so you can swap between them to compare.
