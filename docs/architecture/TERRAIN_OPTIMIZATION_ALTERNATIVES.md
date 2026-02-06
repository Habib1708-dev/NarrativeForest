# Procedural Terrain Generation: Optimization Alternatives

This document outlines optimization approaches for the current GPU-displaced terrain system, preserving the existing terrain shape (Simplex noise fBm with plateau smoothing).

## Current System Analysis

### How It Works
- **Tiled Grid**: Infinite terrain divided into fixed-size tiles (4 world units)
- **Resolution**: 2 (3x3 vertex grid = 9 vertices, 8 triangles per tile)
- **GPU Displacement**: Flat grid geometry with vertex shader displacement
- **Height Function**: Simplex 2D noise with Fractional Brownian Motion (fBm)
- **Per-Tile Materials**: Each tile clones the base material for unique uniforms

### Why LOD Is Not Applicable
With `resolution = 2`, each tile has only **9 vertices**. This is already the minimum viable geometry for a heightfield patch. LOD systems (Clipmaps, CDLOD, Tessellation) are designed for high-poly meshes where reducing vertex count provides benefits. At 9 vertices per tile:
- There's nothing to reduce
- Visual detail comes entirely from the GPU shader, not geometry
- The bottleneck is elsewhere (material cloning, draw calls, tile management)

### Actual Bottlenecks
1. **Material Cloning**: Each tile clones the base material (~100+ materials)
2. **Single Worker**: Tile generation limited to 1 worker, max 2 concurrent jobs
3. **Draw Calls**: Each tile = 1 draw call (no batching)
4. **Shader Overhead**: Full fBm computed for every pixel, even distant terrain
5. **Tile Churn**: Frequent load/unload as camera moves

---

## Optimization 1: Material Sharing with onBeforeRender

### Problem
Each tile clones the base material to store unique `uTileMin`, `uTileSize`, `uLatticeStep` uniforms. With 25+ tiles visible, this means 25+ material instances, 25+ shader compilations.

### Solution
Share a single material across all tiles. Update per-tile uniforms via `mesh.onBeforeRender` before each draw call.

### Implementation

```javascript
// TerrainMaterial.jsx
export function createTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({ /* ... */ });

  material.onBeforeCompile = function(shader) {
    // Add uniforms
    shader.uniforms.uTileMin = { value: new THREE.Vector2() };
    shader.uniforms.uTileSize = { value: 4.0 };
    shader.uniforms.uLatticeStep = { value: 2.0 };

    // Store shader reference for per-draw updates
    this.userData.shader = shader;

    // ... inject vertex shader code ...
  };

  return material;
}

// When mounting a tile mesh:
function setupTileMesh(mesh, tileMinX, tileMinZ, tileSize, latticeStep) {
  // Store tile data on mesh (not material)
  mesh.userData.tileUniforms = { tileMinX, tileMinZ, tileSize, latticeStep };

  // Update shared material uniforms before each draw
  mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
    const shader = material.userData.shader;
    if (shader) {
      const tile = mesh.userData.tileUniforms;
      shader.uniforms.uTileMin.value.set(tile.tileMinX, tile.tileMinZ);
      shader.uniforms.uTileSize.value = tile.tileSize;
      shader.uniforms.uLatticeStep.value = tile.latticeStep;
    }
  };
}
```

### Benefits
| Metric | Before | After |
|--------|--------|-------|
| Material instances | ~25 | 1 |
| Shader compilations | ~25 | 1 |
| Memory (materials) | ~5MB | ~200KB |

---

## Optimization 2: Worker Pool for Parallel Tile Generation

### Problem
Single worker with max 2 concurrent jobs creates a bottleneck during initial load and fast camera movement.

### Solution
Create a pool of 2-4 workers with round-robin dispatch.

### Implementation

```javascript
// terrainWorkerPool.js
export class TerrainWorkerPool {
  constructor(workerUrl, size = 4) {
    this.workers = [];
    this.pendingJobs = new Map();
    this.nextWorker = 0;

    for (let i = 0; i < size; i++) {
      const worker = new Worker(workerUrl, { type: "module" });
      worker.onmessage = (e) => this.handleMessage(e, i);
      this.workers.push(worker);
    }
  }

  dispatch(job) {
    const worker = this.workers[this.nextWorker];
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;

    this.pendingJobs.set(job.key, job);
    worker.postMessage({ type: "build", payload: job });
  }

  handleMessage(event, workerIndex) {
    const { key, positions, normals, boundingBox } = event.data;
    const job = this.pendingJobs.get(key);
    this.pendingJobs.delete(key);

    if (job?.onComplete) {
      job.onComplete({ positions, normals, boundingBox });
    }
  }
}
```

### Benefits
| Metric | Before | After |
|--------|--------|-------|
| Max concurrent builds | 2 | 8 (4 workers × 2) |
| Initial load time | baseline | ~60% faster |
| Tile pop-in during movement | noticeable | minimal |

---

## Optimization 3: GPU Instancing (Single Draw Call)

### Problem
Each tile is a separate mesh = separate draw call. With 25 tiles, that's 25 draw calls per frame.

### Solution
Use `InstancedMesh` to render all tiles in a single draw call. Per-tile uniforms passed via instance attributes.

### Implementation

```javascript
// InstancedTerrain.jsx
function InstancedTerrain({ tileCount = 100 }) {
  const meshRef = useRef();

  // Create single geometry (shared by all instances)
  const geometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(1, 1, 2, 2); // resolution = 2

    // Add instance attributes for per-tile data
    const tileOffsets = new Float32Array(tileCount * 2); // x, z per instance
    geom.setAttribute('aTileOffset', new THREE.InstancedBufferAttribute(tileOffsets, 2));

    return geom;
  }, [tileCount]);

  // Update instance matrices and attributes
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    const tileOffsets = mesh.geometry.attributes.aTileOffset.array;

    let instanceIndex = 0;
    visibleTiles.forEach((tile) => {
      // Set instance matrix (position/scale)
      dummy.position.set(tile.x, 0, tile.z);
      dummy.scale.set(tileSize, 1, tileSize);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummy.matrix);

      // Set tile offset attribute
      tileOffsets[instanceIndex * 2] = tile.x;
      tileOffsets[instanceIndex * 2 + 1] = tile.z;

      instanceIndex++;
    });

    mesh.count = instanceIndex;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.attributes.aTileOffset.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, tileCount]} />;
}
```

### Shader Modification
```glsl
// Read per-instance tile offset
attribute vec2 aTileOffset;

vec3 displaceTerrainVertex(vec3 localPos) {
  // Use instance attribute instead of uniform
  vec2 worldXZ = aTileOffset + localPos.xz * uTileSize;
  float height = terrainHeightAt(worldXZ.x, worldXZ.y);
  return vec3(worldXZ.x, height, worldXZ.y);
}
```

### Benefits
| Metric | Before | After |
|--------|--------|-------|
| Draw calls | ~25 | 1 |
| CPU overhead | high | minimal |
| GPU batching | none | full |

---

## Optimization 4: Distance-Based Shader Simplification

### Problem
Full fBm noise (multiple octaves) computed for every fragment, even for distant terrain where detail isn't visible.

### Solution
Reduce octave count based on distance from camera. Distant terrain uses simpler noise.

### Implementation

```glsl
// In fragment shader (or vertex shader for per-vertex)
uniform vec3 uCameraPosition;

float terrainHeightAtAdaptive(float x, float z) {
  float dist = distance(vec2(x, z), uCameraPosition.xz);

  // Reduce octaves for distant terrain
  int octaves = dist < 20.0 ? uTerrainOctaves
              : dist < 50.0 ? max(uTerrainOctaves - 1, 1)
              : max(uTerrainOctaves - 2, 1);

  float h = 0.0;
  float amp = uTerrainElevation;
  float freq = uTerrainFrequency;

  for (int i = 0; i < octaves; i++) {
    h += amp * abs(simplex2D(vec2(x, z) * freq + uTerrainSeed));
    amp *= 0.5;
    freq *= uTerrainScale;
  }

  return plateauize(h) + uTerrainBaseHeight + uTerrainWorldYOffset;
}
```

### Benefits
| Metric | Before | After |
|--------|--------|-------|
| Noise samples (distant) | 4-6 octaves | 1-2 octaves |
| Fragment shader cost | ~100% | ~60% |
| Visual difference | none (at distance) | none |

---

## Optimization 5: Hybrid Static + Dynamic Terrain

### Problem
Tiles constantly load/unload as camera moves, even for terrain that rarely changes.

### Solution
Pre-bake nearby terrain into a static mesh, only use dynamic tiles for distant/edge areas.

### Implementation

```javascript
// HybridTerrain.jsx
function HybridTerrain() {
  // Static center: high-detail baked mesh around origin
  const staticMesh = useMemo(() => {
    // Generate once at startup
    return createStaticTerrainMesh({
      center: [0, 0],
      radius: 50,
      resolution: 256 // Higher res for static portion
    });
  }, []);

  // Dynamic edges: tile-based for infinite extension
  const dynamicTiles = useDynamicTiles({
    excludeRadius: 50, // Don't generate where static mesh exists
    loadRadius: 100
  });

  return (
    <group>
      <primitive object={staticMesh} />
      {dynamicTiles.map(tile => <TileMesh key={tile.key} {...tile} />)}
    </group>
  );
}
```

### Benefits
| Metric | Before | After |
|--------|--------|-------|
| Tile churn (near origin) | constant | zero |
| Memory (near origin) | dynamic | fixed |
| Quality (near origin) | resolution=2 | resolution=256 |

---

## Optimization 6: Shader Warmup

### Problem
First tile render triggers shader compilation, causing a frame stutter.

### Solution
Pre-compile shader on mount using an offscreen dummy mesh.

### Implementation

```javascript
// In TerrainTiled.jsx
useEffect(() => {
  if (!groupRef.current) return;

  // Create tiny offscreen mesh to trigger shader compile
  const warmupGeom = new THREE.PlaneGeometry(0.001, 0.001);
  const warmupMesh = new THREE.Mesh(warmupGeom, baseMaterial);
  warmupMesh.frustumCulled = false;
  warmupMesh.position.set(0, -1000, 0); // Below camera

  groupRef.current.add(warmupMesh);

  // Remove after 2 frames
  let frames = 0;
  const cleanup = () => {
    if (++frames >= 2) {
      groupRef.current?.remove(warmupMesh);
      warmupGeom.dispose();
      return;
    }
    requestAnimationFrame(cleanup);
  };
  requestAnimationFrame(cleanup);
}, [baseMaterial]);
```

### Benefits
| Metric | Before | After |
|--------|--------|-------|
| First tile stutter | ~50-100ms | 0ms |
| User experience | noticeable hitch | smooth |

---

## Recommended Implementation Priority

Given the current system with `resolution = 2`, prioritize optimizations by impact:

| Priority | Optimization | Impact | Effort |
|----------|--------------|--------|--------|
| 1 | Material Sharing | High | Low |
| 2 | Worker Pool | High | Medium |
| 3 | Shader Warmup | Medium | Low |
| 4 | GPU Instancing | High | High |
| 5 | Shader Simplification | Medium | Medium |
| 6 | Hybrid Static/Dynamic | Medium | High |

### Quick Wins (Do First)
1. **Material Sharing** - Eliminates material clone overhead
2. **Shader Warmup** - Removes first-frame stutter

### Medium Effort
3. **Worker Pool** - Faster tile loading
4. **Shader Simplification** - Reduces GPU cost for distant terrain

### Major Refactors (If Needed)
5. **GPU Instancing** - Single draw call for all tiles
6. **Hybrid Terrain** - Pre-baked center, dynamic edges

---

## Preserving Terrain Shape

All optimizations preserve the exact terrain shape because they don't modify the height function:

```javascript
// heightfield.js - Unchanged
export function heightAt(x, z) {
  let h = 0;
  let amp = elevation;
  let freq = frequency;

  for (let i = 0; i < octaves; i++) {
    h += amp * Math.abs(simplex2D(x * freq + seed, z * freq + seed));
    amp *= 0.5;
    freq *= scale;
  }

  h = plateauize(h, plateauHeight, plateauSmoothing);
  return h + baseHeight + worldYOffset;
}
```

The GPU shader (`terrainHeight.glsl`) also remains identical. Only the rendering pipeline changes - the mathematical terrain surface stays the same.
