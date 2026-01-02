/**
 * Performance Monitoring Utility
 * 
 * Tracks component loading times, asset loading, and overall performance metrics.
 * Use this to identify bottlenecks in the loading process.
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      componentMountTimes: {},
      glbLoadTimes: {},
      systemInitTimes: {},
      customMarkers: {},
      overall: {
        appStartTime: performance.now(),
        timeToFirstFrame: null,
        timeToInteractive: null,
        totalLoadTime: null,
      },
    };
    
    this.activeTimers = new Map();
    this.listeners = new Set();
  }

  /**
   * Mark the start of a component mount
   */
  startComponentMount(componentName) {
    const key = `component_${componentName}`;
    this.activeTimers.set(key, performance.now());
  }

  /**
   * Mark the end of a component mount
   */
  endComponentMount(componentName) {
    const key = `component_${componentName}`;
    const startTime = this.activeTimers.get(key);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.metrics.componentMountTimes[componentName] = duration;
      this.activeTimers.delete(key);
      this.notifyListeners('componentMount', { componentName, duration });
    }
  }

  /**
   * Track GLB file loading
   */
  startGLBLoad(url) {
    const key = `glb_${url}`;
    this.activeTimers.set(key, performance.now());
    
    if (!this.metrics.glbLoadTimes[url]) {
      this.metrics.glbLoadTimes[url] = {
        startTime: performance.now(),
        endTime: null,
        duration: null,
        size: null,
      };
    }
  }

  /**
   * Mark GLB load completion
   */
  endGLBLoad(url, size = null) {
    const key = `glb_${url}`;
    const startTimeFromTimer = this.activeTimers.get(key);
    const existing = this.metrics.glbLoadTimes[url];
    if (!existing) return;

    const endTime = performance.now();
    const effectiveStart =
      startTimeFromTimer ??
      (typeof existing.startTime === "number" ? existing.startTime : null);
    const duration =
      typeof effectiveStart === "number" ? endTime - effectiveStart : null;

    this.metrics.glbLoadTimes[url] = {
      ...existing,
      endTime,
      duration,
      size,
    };

    this.activeTimers.delete(key);
    this.notifyListeners("glbLoad", { url, duration, size });
  }

  /**
   * Track system initialization (workers, etc.)
   */
  markSystemInit(systemName, duration) {
    this.metrics.systemInitTimes[systemName] = duration;
    this.notifyListeners('systemInit', { systemName, duration });
  }

  /**
   * Custom performance marker
   */
  markStart(markerName) {
    const key = `marker_${markerName}`;
    this.activeTimers.set(key, performance.now());
  }

  /**
   * End custom performance marker
   */
  markEnd(markerName) {
    const key = `marker_${markerName}`;
    const startTime = this.activeTimers.get(key);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.metrics.customMarkers[markerName] = duration;
      this.activeTimers.delete(key);
      this.notifyListeners('marker', { markerName, duration });
    }
  }

  /**
   * Mark time to first frame
   */
  markTimeToFirstFrame() {
    if (!this.metrics.overall.timeToFirstFrame) {
      this.metrics.overall.timeToFirstFrame = 
        performance.now() - this.metrics.overall.appStartTime;
      this.notifyListeners('timeToFirstFrame', this.metrics.overall.timeToFirstFrame);
    }
  }

  /**
   * Mark time to interactive
   */
  markTimeToInteractive() {
    if (!this.metrics.overall.timeToInteractive) {
      this.metrics.overall.timeToInteractive = 
        performance.now() - this.metrics.overall.appStartTime;
      this.notifyListeners('timeToInteractive', this.metrics.overall.timeToInteractive);
    }
  }

  /**
   * Mark total load time
   */
  markTotalLoadTime() {
    if (!this.metrics.overall.totalLoadTime) {
      this.metrics.overall.totalLoadTime = 
        performance.now() - this.metrics.overall.appStartTime;
      this.notifyListeners('totalLoadTime', this.metrics.overall.totalLoadTime);
    }
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get summary of loading times
   */
  getSummary() {
    const summary = {
      overall: this.metrics.overall,
      slowestComponents: [],
      slowestGLBs: [],
      totalGLBLoadTime: 0,
      totalComponentMountTime: 0,
    };

    // Find slowest components
    const componentEntries = Object.entries(this.metrics.componentMountTimes)
      .map(([name, duration]) => ({ name, duration }))
      .sort((a, b) => b.duration - a.duration);
    summary.slowestComponents = componentEntries.slice(0, 5);

    // Find slowest GLB loads
    const glbEntries = Object.entries(this.metrics.glbLoadTimes)
      .filter(([_, data]) => data.duration !== null)
      .map(([url, data]) => ({ url, duration: data.duration, size: data.size }))
      .sort((a, b) => b.duration - a.duration);
    summary.slowestGLBs = glbEntries.slice(0, 5);

    // Calculate totals
    summary.totalGLBLoadTime = glbEntries.reduce((sum, item) => sum + item.duration, 0);
    summary.totalComponentMountTime = componentEntries.reduce(
      (sum, item) => sum + item.duration,
      0
    );

    return summary;
  }

  /**
   * Log metrics to console
   */
  logMetrics() {
    console.group('📊 Performance Metrics');
    
    console.group('Overall');
    console.table(this.metrics.overall);
    console.groupEnd();

    if (Object.keys(this.metrics.componentMountTimes).length > 0) {
      console.group('Component Mount Times');
      console.table(this.metrics.componentMountTimes);
      console.groupEnd();
    }

    if (Object.keys(this.metrics.glbLoadTimes).length > 0) {
      console.group('GLB Load Times');
      const glbTable = Object.entries(this.metrics.glbLoadTimes).map(([url, data]) => ({
        url: url.split('/').pop(),
        duration: data.duration ? `${data.duration.toFixed(2)}ms` : 'loading...',
        size: data.size ? `${(data.size / 1024).toFixed(2)}KB` : 'unknown',
      }));
      console.table(glbTable);
      console.groupEnd();
    }

    if (Object.keys(this.metrics.systemInitTimes).length > 0) {
      console.group('System Initialization');
      console.table(this.metrics.systemInitTimes);
      console.groupEnd();
    }

    if (Object.keys(this.metrics.customMarkers).length > 0) {
      console.group('Custom Markers');
      console.table(this.metrics.customMarkers);
      console.groupEnd();
    }

    console.group('Summary');
    console.table(this.getSummary());
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics() {
    return JSON.stringify(this.getMetrics(), null, 2);
  }

  /**
   * Add event listener
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach((callback) => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Performance monitor listener error:', error);
      }
    });
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      componentMountTimes: {},
      glbLoadTimes: {},
      systemInitTimes: {},
      customMarkers: {},
      overall: {
        appStartTime: performance.now(),
        timeToFirstFrame: null,
        timeToInteractive: null,
        totalLoadTime: null,
      },
    };
    this.activeTimers.clear();
  }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  window.__performanceMonitor = performanceMonitor;
}

export default performanceMonitor;

