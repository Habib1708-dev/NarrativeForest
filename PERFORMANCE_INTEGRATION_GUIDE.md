# Performance Monitor Integration Guide

This guide shows how to integrate the performance monitoring system into your components.

## Quick Start

### 1. Add Performance Metrics Display to Home Page

In `src/pages/Home.jsx`, add:

```jsx
import PerformanceMetricsDisplay from "../components/PerformanceMetricsDisplay";

export default function Home() {
  // ... existing code ...

  return (
    <>
      {/* ... existing components ... */}
      <PerformanceMetricsDisplay />
      {/* ... rest of components ... */}
    </>
  );
}
```

### 2. Track Component Mount Times

In any component, use the hook:

```jsx
import { usePerformanceMonitor } from "../utils/usePerformanceMonitor";

export default function MyComponent() {
  const { markStart, markEnd } = usePerformanceMonitor("MyComponent");

  useEffect(() => {
    markStart("initialization");
    // ... initialization code ...
    markEnd("initialization");
  }, []);

  // Component automatically tracks mount time
  return <div>...</div>;
}
```

### 3. Track GLB Loading

For components that load GLB files:

```jsx
import { useGLTF } from "@react-three/drei";
import { useGLBLoadTracker } from "../utils/usePerformanceMonitor";
import performanceMonitor from "../utils/performanceMonitor";

export default function MyModel() {
  const url = "/models/my-model.glb";

  // Track GLB loading
  useGLBLoadTracker(url);

  const { scene } = useGLTF(url);

  useEffect(() => {
    // Mark when GLB is fully loaded and processed
    if (scene) {
      performanceMonitor.endGLBLoad(url);
    }
  }, [scene, url]);

  return <primitive object={scene} />;
}
```

## Integration Examples

### Example 1: TerrainTiled Component

```jsx
import { usePerformanceMonitor } from "../utils/usePerformanceMonitor";
import performanceMonitor from "../utils/performanceMonitor";

const TerrainTiled = forwardRef(function TerrainTiled(props, ref) {
  const { markStart, markEnd } = usePerformanceMonitor("TerrainTiled");

  useEffect(() => {
    markStart("worker-init");

    // ... worker initialization ...

    const workerInitTime = performance.now();
    // ... create worker ...
    const workerInitDuration = performance.now() - workerInitTime;
    performanceMonitor.markSystemInit("terrain-worker", workerInitDuration);

    markEnd("worker-init");
  }, []);

  useFrame(() => {
    // Track first tile generation
    if (firstTileGenerated && !firstTileTracked) {
      markStart("first-tile");
      // ... first tile logic ...
      markEnd("first-tile");
      firstTileTracked = true;
    }
  });

  // ... rest of component ...
});
```

### Example 2: ForestDynamicSampled Component

```jsx
import { usePerformanceMonitor } from "../utils/usePerformanceMonitor";
import performanceMonitor from "../utils/performanceMonitor";

export default function ForestDynamicSampled(props) {
  const { markStart, markEnd } = usePerformanceMonitor("ForestDynamicSampled");

  // Track GLB loads
  const highParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1.glb");
  const lodParts = useInstancedTree("/models/tree/Spruce_Fir/Spruce1LOD.glb");
  const rockParts = useInstancedRocks("/models/cabin/MateriallessRock.glb");

  useEffect(() => {
    // Mark when all GLBs are loaded
    if (highParts.length > 0 && lodParts.length > 0 && rockParts.length > 0) {
      markEnd("glb-loads");
    }
  }, [highParts, lodParts, rockParts]);

  useFrame(() => {
    // Track first chunk generation
    if (firstChunkGenerated && !firstChunkTracked) {
      markStart("first-chunk");
      // ... first chunk logic ...
      markEnd("first-chunk");
      firstChunkTracked = true;
    }
  });

  // ... rest of component ...
}
```

### Example 3: Experience Component

```jsx
import { usePerformanceMonitor } from "../utils/usePerformanceMonitor";
import performanceMonitor from "../utils/performanceMonitor";
import { useFrame } from "@react-three/fiber";

export default function Experience() {
  const { markStart, markEnd } = usePerformanceMonitor("Experience");
  const firstFrameRef = useRef(true);

  useEffect(() => {
    markStart("scene-setup");
    // ... scene setup ...
    markEnd("scene-setup");
  }, []);

  useFrame(() => {
    if (firstFrameRef.current) {
      performanceMonitor.markTimeToFirstFrame();
      firstFrameRef.current = false;
    }
  });

  useEffect(() => {
    // Mark time to interactive when forest is ready
    const handleForestReady = () => {
      performanceMonitor.markTimeToInteractive();
      performanceMonitor.markTotalLoadTime();
    };

    window.addEventListener("forest-ready", handleForestReady);
    return () => window.removeEventListener("forest-ready", handleForestReady);
  }, []);

  // ... rest of component ...
}
```

## Viewing Metrics

### In Browser Console

The metrics are automatically logged when you:

1. Open the browser console
2. Type: `window.__performanceMonitor.logMetrics()`
3. Or call: `window.__performanceMonitor.getSummary()`

### In UI (Debug Mode)

The `PerformanceMetricsDisplay` component shows real-time metrics in the bottom-right corner when debug mode is enabled (Ctrl+D).

### Export Metrics

To export metrics as JSON:

```javascript
const metrics = window.__performanceMonitor.exportMetrics();
console.log(metrics);
// Or download as file
const blob = new Blob([metrics], { type: "application/json" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "performance-metrics.json";
a.click();
```

## Key Metrics to Track

1. **Component Mount Times** - How long each component takes to mount
2. **GLB Load Times** - Individual model file loading durations
3. **System Init Times** - Worker initialization, etc.
4. **Time to First Frame** - When the first frame renders
5. **Time to Interactive** - When the scene is fully ready
6. **Total Load Time** - Complete loading duration

## Best Practices

1. **Track Early** - Add monitoring at the start of development, not after
2. **Track Key Operations** - Focus on expensive operations (GLB loads, workers, large computations)
3. **Use Markers** - Use `markStart`/`markEnd` for custom operations
4. **Don't Overdo It** - Don't track every tiny operation, focus on bottlenecks
5. **Compare Before/After** - Always measure before and after optimizations

## Troubleshooting

### Metrics not showing?

- Make sure debug mode is enabled (Ctrl+D)
- Check browser console for errors
- Verify `PerformanceMetricsDisplay` is added to Home component

### GLB times not tracking?

- Ensure `useGLBLoadTracker` is called before `useGLTF`
- Check that `performanceMonitor.endGLBLoad()` is called after GLB is fully loaded

### Component times seem wrong?

- Component mount time is automatically tracked by the hook
- For custom timing, use `markStart`/`markEnd` manually
