# Procedural Terrain Generation: Optimization Alternatives

This document outlines alternative approaches to procedural terrain generation that could replace or enhance the current tile-based system while preserving the existing terrain shape (Simplex noise fBm with plateau smoothing).

## Current System Analysis

### How It Works
- **Tiled Grid**: Infinite terrain divided into fixed-size tiles (4 world units)
- **GPU Displacement**: Flat grid geometry with vertex shader displacement
- **Height Function**: Simplex 2D noise with Fractional Brownian Motion (fBm)
- **Per-Tile Materials**: Each tile clones the base material for unique uniforms

### Current Limitations
1. **Fixed Resolution**: All tiles have same vertex density regardless of distance
2. **Tile Boundaries**: Potential seams at tile edges (mitigated by shared height function)
3. **Material Overhead**: Cloning materials per tile increases memory
4. **No LOD**: Distant tiles render at same quality as near tiles
5. **Worker Bottleneck**: Single worker limits parallel tile generation

---

## Alternative Approach 1: Geometry Clipmaps

### Overview
Geometry Clipmaps use a set of nested, concentric grids centered on the camera. Each level has the same vertex count but covers progressively larger areas, providing automatic LOD.

### Architecture
```
Level 0: 64x64 vertices covering 64x64 units (1 unit/vertex) - highest detail
Level 1: 64x64 vertices covering 128x128 units (2 units/vertex)
Level 2: 64x64 vertices covering 256x256 units (4 units/vertex)
...
Level N: 64x64 vertices covering 2^N * 64 units
```

### Implementation for This Project

```javascript
// ClipMapTerrain.jsx
class GeometryClipmap {
  constructor(levels = 6, gridSize = 64) {
    this.levels = levels;
    this.gridSize = gridSize;
    this.rings = [];

    for (let i = 0; i < levels; i++) {
      this.rings.push({
        geometry: this.createRingGeometry(i),
        scale: Math.pow(2, i),
        material: this.createMaterial(i)
      });
    }
  }

  createRingGeometry(level) {
    // Create hollow ring (donut) for levels > 0
    // Level 0 is a full grid
    if (level === 0) {
      return new THREE.PlaneGeometry(
        this.gridSize, this.gridSize,
        this.gridSize - 1, this.gridSize - 1
      );
    }

    // Higher levels are rings that surround inner levels
    return this.createHollowRing(level);
  }

  update(cameraPosition) {
    // Snap each level to grid alignment
    for (let i = 0; i < this.levels; i++) {
      const scale = Math.pow(2, i);
      const snapX = Math.floor(cameraPosition.x / scale) * scale;
      const snapZ = Math.floor(cameraPosition.z / scale) * scale;
      this.rings[i].mesh.position.set(snapX, 0, snapZ);
    }
  }
}
```

### Preserving Current Height Function
```glsl
// Same terrainHeightAt() function from current implementation
float terrainHeightAt(float x, float z) {
  // Existing Simplex fBm implementation
  float h = 0.0;
  float amp = uTerrainElevation;
  float freq = uTerrainFrequency;

  for (int i = 0; i < uTerrainOctaves; i++) {
    h += amp * abs(simplex2D(vec2(x, z) * freq + uTerrainSeed));
    amp *= 0.5;
    freq *= uTerrainScale;
  }

  // Plateau smoothing
  h = plateauize(h, uTerrainPlateauHeight, uTerrainPlateauSmoothing);

  return h + uTerrainBaseHeight + uTerrainWorldYOffset;
}
```

### Advantages
- **Automatic LOD**: Detail decreases naturally with distance
- **Fixed Memory**: Same geometry count regardless of view distance
- **No Tile Management**: No loading/unloading logic needed
- **Smooth Transitions**: Geomorphing blends between LOD levels

### Disadvantages
- **Complexity**: Ring geometry and stitching requires careful implementation
- **Update Cost**: Must update positions every frame as camera moves

---

## Alternative Approach 2: CDLOD (Continuous Distance-Dependent LOD)

### Overview
CDLOD uses a quadtree structure with GPU morphing between LOD levels. It's highly efficient and used in many AAA games.

### Architecture
```
Quadtree Node:
├── Size: World space extent
├── LOD Level: 0 (highest) to N (lowest)
├── Children: 4 child nodes (if subdivided)
└── Render: Single draw call per visible node
```

### Implementation Concept

```javascript
// CDLODTerrain.jsx
class CDLODNode {
  constructor(x, z, size, level, maxLevel) {
    this.x = x;
    this.z = z;
    this.size = size;
    this.level = level;
    this.maxLevel = maxLevel;
    this.children = null;
  }

  shouldSubdivide(cameraPos, lodRanges) {
    const dist = this.distanceToCamera(cameraPos);
    return this.level < this.maxLevel && dist < lodRanges[this.level];
  }

  selectLOD(cameraPos, lodRanges, visibleNodes) {
    if (!this.isInFrustum()) return;

    if (this.shouldSubdivide(cameraPos, lodRanges)) {
      this.ensureChildren();
      for (const child of this.children) {
        child.selectLOD(cameraPos, lodRanges, visibleNodes);
      }
    } else {
      visibleNodes.push(this);
    }
  }
}

class CDLODTerrain {
  constructor(worldSize = 1024, maxLevel = 8) {
    this.root = new CDLODNode(0, 0, worldSize, 0, maxLevel);
    this.gridMesh = this.createGridMesh(32); // Shared geometry
    this.lodRanges = this.computeLODRanges();
  }

  render(camera) {
    const visibleNodes = [];
    this.root.selectLOD(camera.position, this.lodRanges, visibleNodes);

    // Instance render all visible nodes
    for (const node of visibleNodes) {
      this.renderNode(node);
    }
  }
}
```

### GPU Morphing Shader
```glsl
// Smooth transition between LOD levels
uniform float uMorphFactor; // 0.0 to 1.0 based on distance

vec3 morphVertex(vec3 position, float morphFactor) {
  // Vertices at even grid positions stay fixed
  // Odd vertices morph toward their even neighbors
  vec2 fracPart = fract(position.xz * 0.5) * 2.0;

  if (fracPart.x > 0.5 || fracPart.y > 0.5) {
    // This is an "odd" vertex - morph it
    vec3 morphTarget = getEvenNeighborPosition(position);
    return mix(position, morphTarget, morphFactor);
  }

  return position;
}
```

### Advantages
- **Optimal Triangle Usage**: Only renders what's needed
- **Smooth Morphing**: No popping between LOD levels
- **Frustum Culling**: Natural quadtree culling
- **Scalable**: Works for huge terrains

### Disadvantages
- **Implementation Complexity**: Quadtree management and stitching
- **Memory for Tree**: Quadtree nodes use memory

---

## Alternative Approach 3: GPU Tessellation

### Overview
Use hardware tessellation shaders to dynamically subdivide a coarse mesh based on camera distance. This is the most modern approach for WebGPU/WebGL 2.0+.

### Architecture
```
Coarse Grid (16x16 patches)
    ↓
Tessellation Control Shader (determines subdivision level)
    ↓
Tessellation Evaluation Shader (generates vertices)
    ↓
Fragment Shader (shading)
```

### Implementation (WebGL 2 with Extensions / WebGPU)

```glsl
// Tessellation Control Shader (conceptual - WebGPU)
@tessellation_control
fn tcs_main(
  @builtin(primitive_id) prim_id: u32,
  @location(0) position: vec3<f32>
) -> TessLevels {
  let dist = distance(position, uCameraPosition);

  // Higher tessellation for closer patches
  let tessLevel = clamp(
    uMaxTessellation / (dist * uTessDistanceFactor),
    1.0,
    uMaxTessellation
  );

  return TessLevels(tessLevel, tessLevel, tessLevel, tessLevel);
}

// Tessellation Evaluation Shader
@tessellation_evaluation
fn tes_main(
  @builtin(tess_coord) tessCoord: vec3<f32>,
  @location(0) p0: vec3<f32>,
  @location(1) p1: vec3<f32>,
  @location(2) p2: vec3<f32>,
  @location(3) p3: vec3<f32>
) -> vec4<f32> {
  // Bilinear interpolation
  let pos = mix(
    mix(p0, p1, tessCoord.x),
    mix(p3, p2, tessCoord.x),
    tessCoord.y
  );

  // Apply height displacement
  let height = terrainHeightAt(pos.x, pos.z);

  return vec4(pos.x, height, pos.z, 1.0);
}
```

### Three.js Implementation (Simulation without Hardware Tessellation)

```javascript
// TessellatedTerrain.jsx - Software tessellation fallback
class AdaptiveTerrain {
  constructor() {
    this.patches = [];
    this.patchSize = 64;
    this.baseMesh = this.createBasePatch();
  }

  createBasePatch() {
    // Create patch with multiple LOD geometries
    return {
      lod0: new THREE.PlaneGeometry(this.patchSize, this.patchSize, 64, 64),
      lod1: new THREE.PlaneGeometry(this.patchSize, this.patchSize, 32, 32),
      lod2: new THREE.PlaneGeometry(this.patchSize, this.patchSize, 16, 16),
      lod3: new THREE.PlaneGeometry(this.patchSize, this.patchSize, 8, 8),
    };
  }

  selectLOD(distance) {
    if (distance < 50) return 'lod0';
    if (distance < 100) return 'lod1';
    if (distance < 200) return 'lod2';
    return 'lod3';
  }
}
```

### Advantages
- **Minimal CPU Work**: GPU handles subdivision
- **Continuous LOD**: Smooth detail changes
- **Low Memory**: Only coarse mesh stored
- **Future-Proof**: WebGPU native support

### Disadvantages
- **Browser Support**: Tessellation not in WebGL 2
- **Requires WebGPU**: Full implementation needs WebGPU
- **Fallback Needed**: Must support non-tessellation path

---

## Alternative Approach 4: Hybrid Chunked LOD

### Overview
Combines the simplicity of chunks with LOD selection. Each chunk has multiple pre-computed geometry levels.

### Architecture
```
World Grid:
├── Chunk (0,0): [LOD0, LOD1, LOD2, LOD3]
├── Chunk (0,1): [LOD0, LOD1, LOD2, LOD3]
├── Chunk (1,0): [LOD0, LOD1, LOD2, LOD3]
└── ...

Selection: Pick LOD based on distance to camera
Stitching: T-junction removal at LOD boundaries
```

### Implementation

```javascript
// HybridLODTerrain.jsx
const LOD_LEVELS = [
  { resolution: 64, distance: 0 },
  { resolution: 32, distance: 50 },
  { resolution: 16, distance: 100 },
  { resolution: 8, distance: 200 },
];

function HybridLODTerrain({ chunkSize = 64, viewDistance = 300 }) {
  const chunksRef = useRef(new Map());
  const geometryCache = useRef(new Map());

  // Pre-generate geometry for each LOD level
  const getGeometry = useCallback((lodLevel) => {
    const key = `lod${lodLevel}`;
    if (!geometryCache.current.has(key)) {
      const res = LOD_LEVELS[lodLevel].resolution;
      geometryCache.current.set(key, createTerrainGeometry(chunkSize, res));
    }
    return geometryCache.current.get(key);
  }, [chunkSize]);

  useFrame(({ camera }) => {
    chunksRef.current.forEach((chunk, key) => {
      const dist = chunk.mesh.position.distanceTo(camera.position);
      const targetLOD = selectLODLevel(dist);

      if (chunk.currentLOD !== targetLOD) {
        // Swap geometry
        chunk.mesh.geometry = getGeometry(targetLOD);
        chunk.currentLOD = targetLOD;
      }
    });
  });

  return <group>{/* Render chunks */}</group>;
}

function selectLODLevel(distance) {
  for (let i = LOD_LEVELS.length - 1; i >= 0; i--) {
    if (distance >= LOD_LEVELS[i].distance) return i;
  }
  return 0;
}
```

### Stitching Solution
```glsl
// Vertex shader modification for seamless LOD transitions
uniform int uNeighborLOD[4]; // [north, east, south, west]
uniform float uChunkSize;

vec3 stitchVertex(vec3 pos, vec2 localUV) {
  // Check if on edge
  bool onNorth = localUV.y > 0.99;
  bool onSouth = localUV.y < 0.01;
  bool onEast = localUV.x > 0.99;
  bool onWest = localUV.x < 0.01;

  // If neighbor has lower LOD, snap to their grid
  if (onNorth && uNeighborLOD[0] > currentLOD) {
    pos.xz = snapToLowerLOD(pos.xz, uNeighborLOD[0]);
  }
  // ... repeat for other edges

  return pos;
}
```

### Advantages
- **Simple Concept**: Easy to understand and debug
- **Predictable Performance**: Fixed geometry per LOD
- **Works with Current System**: Evolutionary upgrade path

### Disadvantages
- **Geometry Swapping**: Can cause small hitches
- **Stitching Complexity**: Edge cases at LOD boundaries
- **Memory**: Stores multiple LOD geometries

---

## Alternative Approach 5: Compute Shader Terrain (WebGPU)

### Overview
Use compute shaders to generate terrain geometry directly on GPU, eliminating CPU-GPU data transfer.

### Architecture
```
Compute Shader:
1. Generate vertex positions from noise
2. Compute normals
3. Output to vertex buffer

Render:
- Direct draw from compute output
- Zero CPU geometry processing
```

### WebGPU Implementation Concept

```javascript
// ComputeTerrain.js
async function createComputeTerrain(device) {
  const computeShader = `
    @group(0) @binding(0) var<storage, read_write> positions: array<vec4<f32>>;
    @group(0) @binding(1) var<storage, read_write> normals: array<vec4<f32>>;
    @group(0) @binding(2) var<uniform> params: TerrainParams;

    @compute @workgroup_size(8, 8)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
      let x = f32(id.x) * params.vertexSpacing + params.offsetX;
      let z = f32(id.y) * params.vertexSpacing + params.offsetZ;

      let height = terrainHeightAt(x, z, params);
      let normal = computeNormal(x, z, params);

      let idx = id.y * params.gridSize + id.x;
      positions[idx] = vec4(x, height, z, 1.0);
      normals[idx] = vec4(normal, 0.0);
    }
  `;

  // Create pipeline, buffers, bind groups...
  return {
    update(offsetX, offsetZ) {
      // Dispatch compute shader
      // Geometry is ready immediately for rendering
    }
  };
}
```

### Advantages
- **Maximum Performance**: Everything on GPU
- **Zero Transfer**: No CPU-GPU data movement
- **Scalable**: Compute scales with GPU cores

### Disadvantages
- **WebGPU Only**: No WebGL fallback possible
- **Browser Support**: Limited (Chrome, Edge)
- **Debugging**: GPU debugging is harder

---

## Recommended Approach for This Project

### Best Fit: Hybrid Chunked LOD with Shared Geometry

Given the current architecture (React Three Fiber, existing height function, web deployment), the **Hybrid Chunked LOD** approach offers the best balance:

1. **Minimal Code Changes**: Builds on existing tile system
2. **Immediate Benefits**: LOD reduces vertex count by 75%+ for distant terrain
3. **No Browser Limitations**: Works in all WebGL browsers
4. **Preserves Height Function**: Same noise parameters, identical terrain shape

### Implementation Roadmap

#### Phase 1: Add LOD Geometry Variants (Week 1)
```javascript
// Extend acquireGeometry to support LOD levels
const acquireGeometry = (lodLevel = 0) => {
  const resolutions = [64, 32, 16, 8];
  const resolution = resolutions[lodLevel];
  // ... create geometry with specified resolution
};
```

#### Phase 2: Distance-Based LOD Selection (Week 1)
```javascript
// In useFrame, update tile LOD based on camera distance
tiles.current.forEach((tile) => {
  const dist = tile.mesh.position.distanceTo(camera.position);
  const targetLOD = dist < 50 ? 0 : dist < 100 ? 1 : dist < 200 ? 2 : 3;
  if (tile.lod !== targetLOD) {
    swapTileLOD(tile, targetLOD);
  }
});
```

#### Phase 3: Geometry Pooling Per LOD (Week 2)
```javascript
// Separate pools for each LOD level
const geometryPools = [
  useRef([]), // LOD 0
  useRef([]), // LOD 1
  useRef([]), // LOD 2
  useRef([]), // LOD 3
];
```

#### Phase 4: Edge Stitching (Week 2)
```glsl
// Shader modification to handle LOD boundaries
// Snap edge vertices to match lower-LOD neighbors
```

### Performance Expectations

| Metric | Current | With LOD |
|--------|---------|----------|
| Vertices (typical view) | ~50,000 | ~15,000 |
| Draw Calls | ~25 tiles | ~25 tiles |
| GPU Memory | 100% | ~40% |
| Frame Time | baseline | -30% |

---

## Preserving Terrain Shape

All approaches above use the **same height function** - the terrain shape is defined by:

```javascript
// heightfield.js - This stays identical
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

The GPU shader equivalent (`terrainHeight.glsl`) also remains unchanged. Only the **mesh topology** (how vertices are arranged) changes with these optimizations - the actual terrain surface stays mathematically identical.

---

## References

1. [GPU Gems 2: Terrain Rendering Using GPU-Based Geometry Clipmaps](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)
2. [CDLOD: Continuous Distance-Dependent Level of Detail](https://github.com/fstrugar/CDLOD)
3. [WebGPU Terrain Rendering](https://webgpu.github.io/webgpu-samples/samples/terrain)
4. [Real-Time Rendering of Procedurally Generated Planets](https://www.youtube.com/watch?v=QN39W020LqU)
5. [Chunked LOD Paper](http://tulrich.com/geekstuff/chunklod.html)
