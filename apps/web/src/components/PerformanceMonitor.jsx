import React, { useState, useEffect } from 'react';
import { Activity, Zap, Clock, Wifi, AlertTriangle, CheckCircle } from 'lucide-react';

const PerformanceMonitor = () => {
  const [metrics, setMetrics] = useState({});
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [vitals, setVitals] = useState({});

  useEffect(() => {
    // Monitor Core Web Vitals
    const measureCoreWebVitals = () => {
      // Largest Contentful Paint (LCP)
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        setVitals(prev => ({
          ...prev,
          lcp: lastEntry.startTime
        }));
      }).observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay (FID) - approximated with event timing
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(entry => {
          if (entry.processingStart && entry.startTime) {
            const fid = entry.processingStart - entry.startTime;
            setVitals(prev => ({
              ...prev,
              fid: fid
            }));
          }
        });
      }).observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift (CLS)
      let clsValue = 0;
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        setVitals(prev => ({
          ...prev,
          cls: clsValue
        }));
      }).observe({ entryTypes: ['layout-shift'] });
    };

    measureCoreWebVitals();
  }, []);

  const measurePerformance = async () => {
    setIsMonitoring(true);
    
    const results = {};

    // Navigation Timing
    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation) {
      results.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
      results.loadComplete = navigation.loadEventEnd - navigation.loadEventStart;
      results.ttfb = navigation.responseStart - navigation.requestStart; // Time to First Byte
      results.domInteractive = navigation.domInteractive - navigation.navigationStart;
    }

    // Resource Performance
    const resources = performance.getEntriesByType('resource');
    const totalResourceSize = resources.reduce((total, resource) => 
      total + (resource.transferSize || 0), 0
    );
    const slowResources = resources.filter(resource => resource.duration > 1000);
    
    results.totalResources = resources.length;
    results.totalResourceSize = totalResourceSize;
    results.slowResources = slowResources.length;

    // JavaScript Performance
    const scriptResources = resources.filter(r => 
      r.name.includes('.js') || r.initiatorType === 'script'
    );
    const totalScriptSize = scriptResources.reduce((total, script) => 
      total + (script.transferSize || 0), 0
    );
    
    results.scriptCount = scriptResources.length;
    results.scriptSize = totalScriptSize;

    // CSS Performance
    const styleResources = resources.filter(r => 
      r.name.includes('.css') || r.initiatorType === 'css'
    );
    const totalStyleSize = styleResources.reduce((total, style) => 
      total + (style.transferSize || 0), 0
    );
    
    results.styleCount = styleResources.length;
    results.styleSize = totalStyleSize;

    // Memory Usage (if available)
    if (performance.memory) {
      results.memoryUsed = performance.memory.usedJSHeapSize;
      results.memoryTotal = performance.memory.totalJSHeapSize;
      results.memoryLimit = performance.memory.jsHeapSizeLimit;
    }

    // Network Information (if available)
    if (navigator.connection) {
      results.connectionType = navigator.connection.effectiveType;
      results.downlink = navigator.connection.downlink;
      results.rtt = navigator.connection.rtt;
    }

    // Device Performance Hints
    results.deviceMemory = navigator.deviceMemory || 'unknown';
    results.hardwareConcurrency = navigator.hardwareConcurrency || 'unknown';

    // Paint Timing
    const paintEntries = performance.getEntriesByType('paint');
    paintEntries.forEach(entry => {
      if (entry.name === 'first-contentful-paint') {
        results.fcp = entry.startTime;
      }
      if (entry.name === 'first-paint') {
        results.fp = entry.startTime;
      }
    });

    setMetrics(results);
    setIsMonitoring(false);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (time) => {
    if (!time) return 'N/A';
    return time < 1000 ? `${Math.round(time)}ms` : `${(time / 1000).toFixed(2)}s`;
  };

  const getVitalStatus = (vital, value) => {
    const thresholds = {
      lcp: { good: 2500, poor: 4000 },
      fid: { good: 100, poor: 300 },
      cls: { good: 0.1, poor: 0.25 },
      fcp: { good: 1800, poor: 3000 }
    };

    if (!thresholds[vital] || value === undefined) return 'unknown';
    
    if (value <= thresholds[vital].good) return 'good';
    if (value <= thresholds[vital].poor) return 'needs-improvement';
    return 'poor';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'good': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'needs-improvement': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'poor': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default: return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'good': return 'border-l-green-500 bg-green-50 dark:bg-green-900/20';
      case 'needs-improvement': return 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
      case 'poor': return 'border-l-red-500 bg-red-50 dark:bg-red-900/20';
      default: return 'border-l-gray-500 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  useEffect(() => {
    // Initial measurement
    setTimeout(() => measurePerformance(), 2000);
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center">
          <Activity className="w-6 h-6 mr-2 text-primary-600" />
          Performance Monitor
        </h2>
        <button
          onClick={measurePerformance}
          disabled={isMonitoring}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {isMonitoring ? 'Measuring...' : 'Re-measure'}
        </button>
      </div>

      {/* Core Web Vitals */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
          <Zap className="w-5 h-5 mr-2 text-yellow-500" />
          Core Web Vitals
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { key: 'lcp', name: 'LCP', desc: 'Largest Contentful Paint', unit: 'ms' },
            { key: 'fid', name: 'FID', desc: 'First Input Delay', unit: 'ms' },
            { key: 'cls', name: 'CLS', desc: 'Cumulative Layout Shift', unit: '' },
            { key: 'fcp', name: 'FCP', desc: 'First Contentful Paint', unit: 'ms' }
          ].map(({ key, name, desc, unit }) => {
            const value = vitals[key] || metrics[key];
            const status = getVitalStatus(key, value);
            
            return (
              <div key={key} className={`border-l-4 p-4 rounded-r-lg ${getStatusColor(status)}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-900 dark:text-white">{name}</h4>
                  {getStatusIcon(status)}
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {value ? (unit === 'ms' ? formatTime(value) : value.toFixed(3)) : 'N/A'}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Loading Performance */}
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-blue-500" />
            Loading Performance
          </h3>
          
          <div className="space-y-3">
            {[
              { key: 'ttfb', label: 'Time to First Byte', value: metrics.ttfb },
              { key: 'domInteractive', label: 'DOM Interactive', value: metrics.domInteractive },
              { key: 'domContentLoaded', label: 'DOM Content Loaded', value: metrics.domContentLoaded },
              { key: 'loadComplete', label: 'Load Complete', value: metrics.loadComplete }
            ].map(({ key, label, value }) => (
              <div key={key} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="text-slate-700 dark:text-slate-300">{label}</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatTime(value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Resource Performance */}
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center">
            <Wifi className="w-5 h-5 mr-2 text-purple-500" />
            Resource Performance
          </h3>
          
          <div className="space-y-3">
            {[
              { key: 'totalResources', label: 'Total Resources', value: metrics.totalResources },
              { key: 'totalResourceSize', label: 'Total Size', value: formatBytes(metrics.totalResourceSize || 0) },
              { key: 'scriptCount', label: 'JavaScript Files', value: metrics.scriptCount },
              { key: 'scriptSize', label: 'JavaScript Size', value: formatBytes(metrics.scriptSize || 0) },
              { key: 'styleCount', label: 'CSS Files', value: metrics.styleCount },
              { key: 'styleSize', label: 'CSS Size', value: formatBytes(metrics.styleSize || 0) }
            ].map(({ key, label, value }) => (
              <div key={key} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="text-slate-700 dark:text-slate-300">{label}</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {value || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
          🚀 Performance Recommendations
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <li>• <strong>LCP should be under 2.5s</strong> - Optimize largest images and critical resources</li>
          <li>• <strong>FID should be under 100ms</strong> - Minimize JavaScript execution time</li>
          <li>• <strong>CLS should be under 0.1</strong> - Reserve space for dynamic content</li>
          <li>• Use lazy loading for images and non-critical resources</li>
          <li>• Implement code splitting to reduce initial bundle size</li>
          <li>• Enable compression (gzip/brotli) for text resources</li>
          <li>• Use a CDN for static assets</li>
          <li>• Implement caching strategies with Service Workers</li>
        </ul>
      </div>
    </div>
  );
};

export default PerformanceMonitor;