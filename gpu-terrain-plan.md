# GPU Terrain Plan (Keep Tiling, Move Height to GPU)

## Goals
- Keep your existing **tile streaming / retention / loadRadius / dropRadius** logic.
- Stop doing per-vertex CPU height generation + normal computation.
- Still support **CPU-side height queries** for placing trees/rocks (or move that placement to GPU later).
- Preserve determinism: the same `(x,z) -> height` should match on CPU and GPU.

## Big Idea
Each tile becomes a **flat grid mesh** (same as today, but **no CPU displacement**).  
The **vertex shader** displaces vertices by evaluating the terrain height function on the GPU:

`y = height(x, z)`

Normals are computed in the shader (either analytic if possible, or via finite differences).

Your existing tiling system still:
- decides which tile keys exist
- creates/removes meshes
- handles pooling/indices/LOD
- sets per-tile uniforms (tile origin / bounds / LOD step)

## Architecture Overview

### 1) Tile Meshes (CPU)
- For each tile, create a `BufferGeometry` grid:
  - positions are a flat plane in XZ (y=0)
  - indices are static (Uint16Array when possible)
  - **no CPU height writes** to `position.array`
- Each tile uses a shared **ShaderMaterial** (or custom material) with per-tile uniforms:
  - `uTileMin (vec2)` or `uTileOrigin (vec2)`
  - `uTileSize (float)`
  - `uSeg (int)` or `uStep (float)` if needed
  - terrain params (noise seeds, scales, octaves, etc.)

### 2) Vertex Shader (GPU Displacement)
**Inputs**
- local grid coordinates for the tile (either from position attribute or derived from `uv`)
- tile origin and tile size uniforms

**Output**
- displaced world position with computed height

Pseudo:
- `worldXZ = uTileMin + localXZ * uTileSize`
- `h = terrainHeight(worldXZ)`
- `posWorld = vec3(worldXZ.x, h, worldXZ.y)`
- `gl_Position = projectionMatrix * viewMatrix * vec4(posWorld, 1.0)`

### 3) Shader Normals (GPU)
Compute normals in one of these ways:

#### Option A — Finite Differences (practical, matches your worker logic)
Use small offsets in X and Z:
- `hL = height(x - eps, z)`
- `hR = height(x + eps, z)`
- `hD = height(x, z - eps)`
- `hU = height(x, z + eps)`

Then:
- `dhdx = (hR - hL) / (2*eps)`
- `dhdz = (hU - hD) / (2*eps)`
- `normal = normalize(vec3(-dhdx, 1.0, -dhdz))`

Pick `eps` carefully:
- `eps = uTileSize / float(uSeg)` (your lattice step) is usually ideal.

#### Option B — Screen-space derivatives (fast but view-dependent)
In fragment shader:
- use `dFdx/dFdy` on world position to compute normal  
Good for some stylized looks, but can be less stable than finite differences.

**Recommendation:** Start with **Option A** for correctness/consistency.

## Keeping Tiling Logic (What stays the same)
Your current system can stay almost identical:
- tile keying, required/retention sets
- buildQueue cadence, maxConcurrentTiles
- pooling for geometries and meshes
- fade-in logic
- culling by distance, load/unload cooldown

**What changes:**
- Worker no longer needs to generate vertex buffers.
- No `positions.buffer` / `normals.buffer` transfers.
- Tile “build” becomes “create mesh with shader + uniforms”.

You may still keep a worker, but only for:
- batched CPU height sampling for placements
- procedural generation of instance lists (trees/rocks) per tile

## The “Placement Problem” (Trees/Rocks Need Height on CPU)

Even with GPU terrain, you still need heights for:
- placing instanced foliage / rocks
- physics/raycast approximations (optional)
- gameplay interactions (if any)

The key insight:
- **Terrain vertices are huge in count** (expensive on CPU).
- **Placement queries are sparse** (few per tile), so CPU can still sample cheaply.

### Strategy 1 (Recommended First): CPU height sampling for placements only
- Keep the same `heightAt(x,z)` JS function.
- Use it only when you need object placement.
- Cache heights on the same lattice key system you already implemented.

Why this is good:
- You remove the massive per-vertex work.
- Placement calls are usually **orders of magnitude fewer** than vertices.
- Deterministic: CPU and GPU use same formula/params.

**Implementation tip**
- When a tile becomes “ready”, generate its placement points (N trees, M rocks) in a worker:
  - pick points using a deterministic RNG seeded by tile key
  - call `heightAt(x,z)` for those points only
  - return transforms for instanced meshes

### Strategy 2: GPU-generated Heightmap per Tile + CPU readback (only if needed)
If placements become very dense and CPU sampling becomes a bottleneck:
- Render the height function into a floating-point texture for each tile (or a shared atlas).
- Read back small textures via `readPixels` (careful: can stall GPU).
- Use that heightmap for many placements.

Downside:
- readback is slow/stall-prone; avoid if you can.
- complexity higher than Strategy 1.

### Strategy 3: GPU-driven placement (advanced, later)
- Keep trees/rocks as instanced meshes.
- In the instance vertex shader, compute height from `(x,z)` and adjust Y on GPU.
- CPU only chooses XZ positions + random seed; no CPU height needed.
- Best performance long-term, but requires more shader work + careful culling.

**Suggested roadmap:** Strategy 1 now, Strategy 3 later.

## LOD and Seams (Important for Tiled GPU Terrain)
With tiled displacement, you must ensure seams match at tile borders.

To avoid cracks:
- Use the same lattice step per LOD level and ensure borders align.
- If neighboring tiles have different LODs:
  - add “skirt” geometry (a downward border strip), or
  - stitch edges by matching vertex counts on borders, or
  - restrict LOD transitions (only change LOD in rings)

**Start simple:**
- single LOD first (same `seg` for all tiles)
- then add LOD once the base is stable

## Culling and Bounding Volumes
Your old CPU bounding box/sphere logic was per-tile from vertex heights.
On GPU terrain, CPU doesn’t know exact minY/maxY unless it samples.

Options:
1) **Approx bounding volumes** (recommended initially):
   - bounding box: use `[minX,maxX]`, `[minZ,maxZ]`, and a safe Y range like `[-Ymax, +Ymax]`
   - bounding sphere: similarly conservative
2) **Sample a few points per tile** to estimate minY/maxY (cheap):
   - sample corners + center (5 points) using CPU heightAt
   - build a tighter bound without scanning vertices

This keeps frustum culling reasonably correct without heavy CPU work.

## Rollout Plan (Phased)

### Phase 0 — Prep
- Move all terrain parameters into a shared struct so both CPU and GPU use the same values.
- Define a “terrain function contract”:
  - inputs: world x,z
  - outputs: height, optional gradient

### Phase 1 — GPU Displacement (single LOD)
- Replace CPU position writes with a flat grid geometry.
- Implement ShaderMaterial with vertex displacement.
- Implement shader normals with finite differences.
- Confirm lighting matches your current look.

### Phase 2 — Placement via CPU Sampling (worker)
- On tile ready, generate placement points (trees/rocks) per tile.
- Sample CPU heightAt only for these points.
- Spawn instances; cache results per tile key.

### Phase 3 — Bounds + Culling Improvements
- Use 5-point sampling per tile for minY/maxY bounds.
- Optimize raycasts:
  - either use a simplified CPU collider mesh (low-res)
  - or raymarch height function (advanced)
  - or accept approximate raycast using heightAt along ray steps (depends on needs)

### Phase 4 — Optional LOD + Skirts
- Add LOD rings and skirt/stitch strategy.
- Keep seams clean across LOD transitions.

### Phase 5 — Optional GPU-driven placement
- Move instance Y offset to GPU.
- CPU chooses XZ + seed only.

## Key Risks / Gotchas
- **Shader cost**: height function runs per-vertex, and normal sampling runs multiple height calls per vertex.
  - Mitigation: simplify noise, reduce octaves, use fewer normal samples, or precompute a height texture.
- **Precision differences** between JS and GLSL can cause tiny mismatch.
  - Mitigation: keep formulas similar, avoid trig-heavy functions with big ranges, and use consistent scaling.
- **Raycasting**: GPU displacement is not reflected in CPU geometry.
  - Mitigation: use `heightAt` for “ground hit” queries rather than mesh raycast.

## Expected Wins
- Huge reduction in main-thread CPU spikes from per-tile vertex builds.
- Less GC churn from typed array creation/transfers.
- Better “tile arrival” smoothness.

## What we should decide together next
1) Which height function are you using (noise types, octaves, warping)?
2) Is lighting realism critical, or is stylized lighting OK?
3) Do you need precise raycast collisions on terrain, or is “heightAt sampling” enough?
4) Do you plan LOD soon, or keep a single seg for now?
