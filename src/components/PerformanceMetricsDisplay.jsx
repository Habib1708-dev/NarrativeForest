/**
 * Performance Metrics Display Component
 * 
 * Displays real-time performance metrics in the UI.
 * Only visible in debug mode.
 */

import { useEffect, useState } from 'react';
import { useDebugStore } from '../state/useDebugStore';
import performanceMonitor from '../utils/performanceMonitor';

export default function PerformanceMetricsDisplay() {
  const isDebugMode = useDebugStore((state) => state.isDebugMode);
  const [metrics, setMetrics] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!isDebugMode) return;

    const updateMetrics = () => {
      setMetrics(performanceMonitor.getMetrics());
      setSummary(performanceMonitor.getSummary());
    };

    // Initial update
    updateMetrics();

    // Listen for updates
    const removeListener = performanceMonitor.addListener(() => {
      updateMetrics();
    });

    // Update periodically
    const interval = setInterval(updateMetrics, 500);

    return () => {
      removeListener();
      clearInterval(interval);
    };
  }, [isDebugMode]);

  if (!isDebugMode || !metrics) return null;

  const formatTime = (ms) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        padding: '16px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        maxWidth: '400px',
        maxHeight: '600px',
        overflow: 'auto',
        zIndex: 10000,
        border: '1px solid rgba(255, 255, 255, 0.2)',
      }}
    >
      <div style={{ marginBottom: '12px', fontWeight: 'bold', fontSize: '14px' }}>
        📊 Performance Metrics
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Overall</div>
        <div>Time to First Frame: {formatTime(metrics.overall.timeToFirstFrame)}</div>
        <div>Time to Interactive: {formatTime(metrics.overall.timeToInteractive)}</div>
        <div>Total Load Time: {formatTime(metrics.overall.totalLoadTime)}</div>
      </div>

      {summary && summary.slowestComponents.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Slowest Components</div>
          {summary.slowestComponents.map((item, idx) => (
            <div key={idx} style={{ fontSize: '11px', marginBottom: '4px' }}>
              {item.name}: {formatTime(item.duration)}
            </div>
          ))}
        </div>
      )}

      {summary && summary.slowestGLBs.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Slowest GLB Loads</div>
          {summary.slowestGLBs.map((item, idx) => (
            <div key={idx} style={{ fontSize: '11px', marginBottom: '4px' }}>
              {item.url.split('/').pop()}: {formatTime(item.duration)} ({formatSize(item.size)})
            </div>
          ))}
        </div>
      )}

      {Object.keys(metrics.systemInitTimes).length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>System Init</div>
          {Object.entries(metrics.systemInitTimes).map(([name, duration]) => (
            <div key={name} style={{ fontSize: '11px', marginBottom: '4px' }}>
              {name}: {formatTime(duration)}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '12px', fontSize: '10px', opacity: 0.7 }}>
        <button
          onClick={() => {
            performanceMonitor.logMetrics();
            console.log('Full metrics:', performanceMonitor.exportMetrics());
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '10px',
          }}
        >
          Log to Console
        </button>
      </div>
    </div>
  );
}

