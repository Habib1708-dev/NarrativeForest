/**
 * React hooks for performance monitoring
 * 
 * These hooks wrap the performanceMonitor utility for use in React components.
 */

import { useEffect } from 'react';
import performanceMonitor from './performanceMonitor';

/**
 * Hook to track component mount time and provide performance utilities
 * 
 * @param {string} componentName - Name of the component to track
 * @returns {object} Performance monitoring utilities
 */
export function usePerformanceMonitor(componentName) {
  useEffect(() => {
    performanceMonitor.startComponentMount(componentName);

    return () => {
      performanceMonitor.endComponentMount(componentName);
    };
  }, [componentName]);

  return {
    markStart: (markerName) => performanceMonitor.markStart(markerName),
    markEnd: (markerName) => performanceMonitor.markEnd(markerName),
    getMetrics: () => performanceMonitor.getMetrics(),
    getSummary: () => performanceMonitor.getSummary(),
  };
}

/**
 * Hook to track GLB file loading
 * 
 * @param {string} url - URL of the GLB file to track
 */
export function useGLBLoadTracker(url) {
  useEffect(() => {
    performanceMonitor.startGLBLoad(url);

    // Try to get file size from fetch
    fetch(url, { method: 'HEAD' })
      .then((response) => {
        const size = response.headers.get('content-length');
        if (size) {
          performanceMonitor.endGLBLoad(url, parseInt(size, 10));
        }
      })
      .catch(() => {
        // Ignore errors, will be tracked by useGLTF
      });

    return () => {
      // Cleanup if needed
    };
  }, [url]);
}

