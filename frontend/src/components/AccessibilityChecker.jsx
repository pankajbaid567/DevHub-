import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';

const AccessibilityChecker = () => {
  const [results, setResults] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  const checkAccessibility = async () => {
    setIsScanning(true);
    const checks = [];

    // Check 1: Page has proper heading hierarchy
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let hasH1 = false;
    let headingOrder = true;
    let lastLevel = 0;

    headings.forEach((heading) => {
      const level = parseInt(heading.tagName.charAt(1));
      if (level === 1) hasH1 = true;
      if (level > lastLevel + 1) headingOrder = false;
      lastLevel = level;
    });

    checks.push({
      id: 'heading-hierarchy',
      title: 'Heading Hierarchy',
      status: hasH1 && headingOrder ? 'pass' : 'fail',
      message: hasH1 && headingOrder 
        ? 'Proper heading hierarchy found' 
        : 'Missing h1 or improper heading order',
      level: 'A'
    });

    // Check 2: Images have alt text
    const images = document.querySelectorAll('img');
    const imagesWithoutAlt = Array.from(images).filter(img => !img.alt);
    
    checks.push({
      id: 'alt-text',
      title: 'Image Alt Text',
      status: imagesWithoutAlt.length === 0 ? 'pass' : 'fail',
      message: imagesWithoutAlt.length === 0 
        ? 'All images have alt text' 
        : `${imagesWithoutAlt.length} images missing alt text`,
      level: 'A'
    });

    // Check 3: Form inputs have labels
    const inputs = document.querySelectorAll('input, textarea, select');
    const inputsWithoutLabels = Array.from(inputs).filter(input => {
      const hasLabel = document.querySelector(`label[for="${input.id}"]`) || 
                     input.getAttribute('aria-label') || 
                     input.getAttribute('aria-labelledby');
      return !hasLabel && input.type !== 'hidden';
    });

    checks.push({
      id: 'form-labels',
      title: 'Form Labels',
      status: inputsWithoutLabels.length === 0 ? 'pass' : 'fail',
      message: inputsWithoutLabels.length === 0 
        ? 'All form inputs have labels' 
        : `${inputsWithoutLabels.length} inputs missing labels`,
      level: 'A'
    });

    // Check 4: Color contrast (simplified check)
    const colorContrastCheck = () => {
      const elements = document.querySelectorAll('*');
      let lowContrastElements = 0;

      Array.from(elements).slice(0, 100).forEach(el => {
        const styles = window.getComputedStyle(el);
        const bgColor = styles.backgroundColor;
        const textColor = styles.color;
        
        // Simple heuristic - this would need a proper contrast calculation library
        if (bgColor !== 'rgba(0, 0, 0, 0)' && textColor && 
            bgColor.includes('rgb') && textColor.includes('rgb')) {
          // Simplified contrast check - in real implementation, use a proper library
          const bgLum = getBrightness(bgColor);
          const textLum = getBrightness(textColor);
          const contrast = Math.abs(bgLum - textLum);
          
          if (contrast < 125) { // Simplified threshold
            lowContrastElements++;
          }
        }
      });

      return lowContrastElements;
    };

    const lowContrastCount = colorContrastCheck();
    checks.push({
      id: 'color-contrast',
      title: 'Color Contrast',
      status: lowContrastCount === 0 ? 'pass' : 'warning',
      message: lowContrastCount === 0 
        ? 'No obvious contrast issues found' 
        : `${lowContrastCount} potential contrast issues`,
      level: 'AA'
    });

    // Check 5: Focus indicators
    const focusableElements = document.querySelectorAll(
      'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    
    let focusIndicatorCount = 0;
    focusableElements.forEach(el => {
      const styles = window.getComputedStyle(el, ':focus');
      if (styles.outline !== 'none' || styles.boxShadow !== 'none') {
        focusIndicatorCount++;
      }
    });

    checks.push({
      id: 'focus-indicators',
      title: 'Focus Indicators',
      status: focusIndicatorCount > focusableElements.length * 0.8 ? 'pass' : 'warning',
      message: `${focusIndicatorCount}/${focusableElements.length} elements have focus indicators`,
      level: 'AA'
    });

    // Check 6: Skip navigation
    const skipLinks = document.querySelectorAll('a[href^="#"]:first-child');
    const hasSkipNav = Array.from(skipLinks).some(link => 
      link.textContent.toLowerCase().includes('skip') ||
      link.textContent.toLowerCase().includes('jump')
    );

    checks.push({
      id: 'skip-navigation',
      title: 'Skip Navigation',
      status: hasSkipNav ? 'pass' : 'fail',
      message: hasSkipNav ? 'Skip navigation found' : 'No skip navigation link found',
      level: 'A'
    });

    // Check 7: ARIA attributes
    const elementsWithAria = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby], [role]');
    checks.push({
      id: 'aria-attributes',
      title: 'ARIA Attributes',
      status: elementsWithAria.length > 10 ? 'pass' : 'warning',
      message: `${elementsWithAria.length} elements with ARIA attributes found`,
      level: 'AA'
    });

    // Check 8: Keyboard navigation
    const interactiveElements = document.querySelectorAll('button, a, input, textarea, select');
    const keyboardAccessible = Array.from(interactiveElements).filter(el => 
      el.tabIndex !== -1 && !el.disabled
    );

    checks.push({
      id: 'keyboard-navigation',
      title: 'Keyboard Navigation',
      status: keyboardAccessible.length === interactiveElements.length ? 'pass' : 'warning',
      message: `${keyboardAccessible.length}/${interactiveElements.length} elements keyboard accessible`,
      level: 'A'
    });

    setResults(checks);
    setIsScanning(false);
  };

  // Simple brightness calculation helper
  const getBrightness = (color) => {
    const rgb = color.match(/\d+/g);
    if (!rgb) return 128;
    return (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
  };

  useEffect(() => {
    // Auto-run check after component mounts
    setTimeout(() => checkAccessibility(), 1000);
  }, []);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default: return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pass': return 'border-l-green-500 bg-green-50 dark:bg-green-900/20';
      case 'fail': return 'border-l-red-500 bg-red-50 dark:bg-red-900/20';
      case 'warning': return 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
      default: return 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20';
    }
  };

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const score = results.length > 0 ? Math.round((passCount / results.length) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          WCAG 2.1 Accessibility Checker
        </h2>
        <button
          onClick={checkAccessibility}
          disabled={isScanning}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {isScanning ? 'Scanning...' : 'Re-scan Page'}
        </button>
      </div>

      {/* Score Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-3xl font-bold text-slate-900 dark:text-white">{score}%</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Overall Score</div>
        </div>
        <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="text-3xl font-bold text-green-600">{passCount}</div>
          <div className="text-sm text-green-700 dark:text-green-400">Passed</div>
        </div>
        <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <div className="text-3xl font-bold text-yellow-600">{warningCount}</div>
          <div className="text-sm text-yellow-700 dark:text-yellow-400">Warnings</div>
        </div>
        <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="text-3xl font-bold text-red-600">{failCount}</div>
          <div className="text-sm text-red-700 dark:text-red-400">Failed</div>
        </div>
      </div>

      {/* Detailed Results */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Detailed Results
        </h3>
        
        {results.map((check) => (
          <div
            key={check.id}
            className={`border-l-4 p-4 rounded-r-lg ${getStatusColor(check.status)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                {getStatusIcon(check.status)}
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white">
                    {check.title}
                  </h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {check.message}
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">
                WCAG {check.level}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
          💡 Accessibility Recommendations
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <li>• Ensure all interactive elements have focus indicators</li>
          <li>• Use semantic HTML elements (header, nav, main, aside, footer)</li>
          <li>• Provide alternative text for all meaningful images</li>
          <li>• Maintain consistent navigation and layout patterns</li>
          <li>• Test with keyboard-only navigation</li>
          <li>• Verify color contrast meets WCAG AA standards (4.5:1 ratio)</li>
          <li>• Add skip navigation links for keyboard users</li>
          <li>• Use ARIA labels and descriptions where needed</li>
        </ul>
      </div>
    </div>
  );
};

export default AccessibilityChecker;