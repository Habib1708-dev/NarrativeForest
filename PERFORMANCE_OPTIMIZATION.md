# Narrative Forest: Performance Optimization Roadmap

## Executive Summary

This document identifies performance-heavy components in the Narrative Forest React Three Fiber application and provides actionable solutions prioritized by impact.

---

## Project Overview

- **Tech Stack**: React 19, React Three Fiber 9.3, Three.js 0.178, Zustand, GSAP
- **Key Features**: Infinite procedural terrain, 6000+ instanced trees, atmospheric effects, post-processing
- **Target**: 60fps on mid-range hardware

---

## Performance Bottleneck Summary

| Priority | Component | Issue | Impact |
|----------|-----------|-------|--------|
| **P0** | FogParticles.jsx:438 | Array allocation in JSX `.map()` | GC pressure every render |
| **P0** | CameraControllerR3F.jsx:31 | Float32Array in JSX | Re-allocation on render |
| **P1** | Stars.jsx:44-143 | Full useEffect re-run on any control change | Shader recompile |
| **P1** | ForestDynamicSampled.jsx | 6 useFrame hooks | Callback overhead |
| **P2** | TerrainTiled.jsx:368 | Frustum culling disabled | GPU overdraw |
| **P2** | Multiple components | Missing React.memo | Wasted reconciliation |

---

## Critical Files to Modify

1. `src/components/FogParticles.jsx` - Array allocation fix
2. `src/components/CameraControllerR3F.jsx` - Memoize Float32Array
3. `src/components/Stars.jsx` - Split useEffect, optimize shader patching
4. `src/components/ForestDynamicSampled.jsx` - Consolidate useFrame hooks
5. `src/components/TerrainTiled.jsx` - Improve frustum culling strategy

---

## Phase 1: Quick Wins (High Impact, Low Effort)

### 1.1 FogParticles.jsx - Line 438

**Problem**: Creates new array `[position[0], position[1], position[2]]` inside `.map()` on every render.

**Current Code**:
```javascript
{instances.map(({ position, scaleJitter }, i) => {
  const s = scaleFalloffWithSize ? size * scaleJitter : size;
  const pos = [position[0], position[1], position[2]]; // NEW ARRAY EVERY RENDER
```

**Solution**: Use the position array directly (Billboard accepts arrays):
```javascript
{instances.map(({ position, scaleJitter }, i) => {
  const s = scaleFalloffWithSize ? size * scaleJitter : size;
  // Use position directly - no spread needed
  <Billboard position={position} ... />
```

### 1.2 CameraControllerR3F.jsx - Lines 28-41

**Problem**: Creates new `Float32Array` inside JSX on every render of CameraWaypointGizmos.

**Current Code**:
```javascript
<bufferAttribute
  attach="attributes-position"
  array={
    new Float32Array([
      w.position[0], w.position[1], w.position[2],
      w.orientation.lookAt[0], w.orientation.lookAt[1], w.orientation.lookAt[2],
    ])
  }
```

**Solution**: Memoize the geometry arrays per waypoint:
```javascript
function CameraWaypointGizmos() {
  const waypoints = useCameraStore((s) => s.waypoints);
  const gizmos = useCameraStore((s) => s.gizmos);

  // Memoize Float32Arrays per waypoint
  const lineArrays = useMemo(() => {
    return waypoints.map((w) => {
      if (!("lookAt" in w.orientation)) return null;
      return new Float32Array([
        w.position[0], w.position[1], w.position[2],
        w.orientation.lookAt[0], w.orientation.lookAt[1], w.orientation.lookAt[2],
      ]);
    });
  }, [waypoints]);

  return (
    <group>
      {waypoints.map((w, idx) => {
        // ... use lineArrays[idx] instead of creating new array
      })}
    </group>
  );
}
```

### 1.3 Stars.jsx - Split useEffect

**Problem**: The useEffect (lines 44-143) has ALL visual controls in its dependency array, causing shader re-patching when any control changes.

**Current Dependencies** (lines 133-143):
```javascript
}, [cutoffEnabled, cutoffY, radius, depth, count, factor, saturation, fade, speed]);
```

**Solution**: Split into two effects - one for shader patching (run once), one for uniform updates:

```javascript
// Effect 1: Patch shader ONCE on mount
useEffect(() => {
  const root = groupRef.current;
  if (!root) return;
  // ... shader patching logic ...
}, []); // Empty deps - run once

// Effect 2: Update uniforms reactively (no shader recompile)
useEffect(() => {
  const uniforms = uniformsRef.current;
  if (uniforms.cutoffEnabled) {
    uniforms.cutoffEnabled.value = cutoffEnabled ? 1 : 0;
  }
  if (uniforms.cutoffY) {
    uniforms.cutoffY.value = cutoffY;
  }
}, [cutoffEnabled, cutoffY]);
```

**Note**: The existing useFrame already handles uniform updates (lines 146-154), so the heavy useEffect can have minimal dependencies.

---

## Phase 2: Medium-Term Improvements

### 2.1 ForestDynamicSampled.jsx - Consolidate useFrame Hooks

**Problem**: 6 separate useFrame hooks create callback overhead.

**Current Hooks**:
- Line 387: Chunk cell tracking
- Line 437: Drop chunk retention
- Line 455: Build cadence
- Line 540: Proxy
- Line 587: Apply instancing (priority 1)
- Line 593: Initial ready check

**Solution**: Consolidate into single orchestrator:
```javascript
useFrame((state, delta) => {
  const { camera } = state;
  const now = performance.now();

  // Phase 0: Track camera chunk
  trackCameraChunk(camera);

  // Phase 1: Retention (throttled every 10 frames)
  if (frameCount++ % 10 === 0) {
    manageRetention(now);
  }

  // Phase 2: Build within budget
  processBuildQueue(raysPerFrame);

  // Phase 3: Apply instancing if dirty
  if (needsRefreshRef.current) {
    applyInstancing();
    needsRefreshRef.current = false;
  }
});
```

### 2.2 Add React.memo to Heavy Components

**Components to wrap**:
- `TerrainTiled` - Complex, rarely re-renders from parent
- `ForestDynamicSampled` - Large component tree
- `CameraWaypointGizmos` - Conditional render, gizmo-only updates

```javascript
export default React.memo(TerrainTiled, (prevProps, nextProps) => {
  return (
    prevProps.sampleHeight === nextProps.sampleHeight &&
    prevProps.tileSize === nextProps.tileSize &&
    prevProps.loadRadius === nextProps.loadRadius
  );
});
```

### 2.3 Replace Object.entries in Hot Paths

**Location**: ForestDynamicSampled.jsx line 547

```javascript
// BEFORE (creates iterator)
for (const [key, mode] of Object.entries(modesRef.current)) {

// AFTER (no allocation)
const modes = modesRef.current;
for (const key in modes) {
  if (Object.hasOwn(modes, key)) {
    const mode = modes[key];
    // ...
  }
}
```

---

## Phase 3: Architectural Improvements

### 3.1 Shader Warmup System

Pre-compile shaders during loading to avoid runtime jank:

```javascript
// src/utils/shaderWarmup.js
export async function warmupShaders(gl, materials) {
  const rt = new THREE.WebGLRenderTarget(1, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();

  for (const material of materials) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    scene.add(mesh);
    gl.setRenderTarget(rt);
    gl.render(scene, camera);
    scene.remove(mesh);
    mesh.geometry.dispose();
  }

  gl.setRenderTarget(null);
  rt.dispose();
}
```

### 3.2 Worker Pool for Parallel Terrain Generation

Current implementation uses single worker with job queue. Could benefit from parallel worker pool:

```javascript
class TerrainWorkerPool {
  constructor(size = navigator.hardwareConcurrency || 4) {
    this.workers = Array.from({ length: size }, () =>
      new Worker(new URL("../workers/terrainTileWorker.js", import.meta.url))
    );
    this.available = [...this.workers];
  }
  // ... pool management
}
```

### 3.3 Custom Frustum Culling for GPU-Displaced Geometry

Since terrain uses GPU vertex displacement, CPU bounds are unreliable. Options:
1. Use worker-computed minY/maxY per tile for tighter bounds
2. Implement manual frustum test in useFrame with accurate world bounds
3. GPU-based occlusion queries

---

## Existing Optimizations (Preserve These)

The codebase already has excellent patterns:

| Pattern | Location | Description |
|---------|----------|-------------|
| Vector/Matrix reuse | ForestDynamicSampled.jsx:40-44 | TMP_POS, TMP_SCALE, TMP_QUAT |
| Matrix pooling | ForestDynamicSampled.jsx:39-54 | acquireMatrix/releaseMatrix |
| Height caching | TerrainTiled.jsx:249-264 | BigInt keys avoid string allocation |
| Geometry pooling | TerrainTiled.jsx:266-338 | Reuse BufferGeometry instances |
| Typed arrays | TerrainTiled.jsx:318-320 | Uint16Array for indices < 65536 |
| Uniform caching | Stars.jsx:8-9 | Avoid per-frame material traversal |
| Frame budgets | TerrainTiled.jsx:36, ForestDynamicSampled.jsx:101 | 4ms terrain, 150 rays/frame |
| Web Workers | TerrainTiled.jsx:129 | Off-main-thread mesh generation |

---

## Verification Methodology

### Performance Metrics to Track

| Metric | Target | Tool |
|--------|--------|------|
| FPS | 60 stable | r3f-perf (already integrated) |
| Frame time | < 16ms | Performance.now() |
| JS Heap | < 200MB | DevTools Memory |
| GC Pauses | < 5ms | DevTools Performance |
| Draw Calls | < 100 | gl.drawCalls |

### Testing Steps

1. **Before changes**: Record 30-second session with DevTools Performance
2. **Identify GC patterns**: Look for frequent minor GC from array allocations
3. **After each fix**: Re-record and compare:
   - Frame time variance
   - GC frequency
   - Heap growth rate
4. **Test on target hardware**:
   - Low-end: Integrated GPU, 8GB RAM
   - Mid-range: GTX 1060 / RX 580
   - High-end: RTX 3070+ / M1 Pro+

### Using Existing Performance Monitor

```javascript
// Already available via performanceMonitor.js
const metrics = window.__performanceMonitor.getMetrics();
console.table({
  'Time to Interactive': metrics.overall.timeToInteractive,
  'Component Mount Times': metrics.componentMountTimes,
  'GLB Load Times': metrics.glbLoadTimes,
});
```

---

## Implementation Priority Order

### Week 1 - Quick Wins
- [ ] FogParticles.jsx array fix
- [ ] CameraControllerR3F.jsx memoization
- [ ] Stars.jsx effect splitting

### Week 2-3 - Medium Fixes
- [ ] ForestDynamicSampled useFrame consolidation
- [ ] Add React.memo to heavy components
- [ ] Replace Object.entries in hot paths

### Month 2+ - Architectural
- [ ] Shader warmup system
- [ ] Worker pool implementation
- [ ] Custom frustum culling

---

## Summary

The Narrative Forest codebase already demonstrates excellent performance practices (matrix pooling, typed arrays, web workers, frame budgets). The main opportunities are:

1. **Immediate**: Fix array allocations in render paths (FogParticles, CameraController)
2. **Short-term**: Optimize shader patching lifecycle (Stars), consolidate useFrame hooks
3. **Long-term**: Implement shader warmup, worker pool, custom frustum culling

Focus on Phase 1 quick wins first - they provide highest impact with minimal risk.
