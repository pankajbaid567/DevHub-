import React from 'react';

const ColorContrastChecker = () => {
  // Test color combinations for WCAG 2.1 AA compliance (4.5:1 ratio minimum)
  const colorTests = [
    { bg: '#0f172a', text: '#ffffff', name: 'Dark bg + White text' },
    { bg: '#1e293b', text: '#f1f5f9', name: 'Steel-800 + Primary-100' },
    { bg: '#64748b', text: '#ffffff', name: 'Steel-500 + White' },
    { bg: '#f59e0b', text: '#ffffff', name: 'Accent-500 + White' },
    { bg: '#ef4444', text: '#ffffff', name: 'Error-500 + White' },
    { bg: '#22c55e', text: '#ffffff', name: 'Success-500 + White' },
    { bg: '#ffffff', text: '#0f172a', name: 'White + Dark text' },
    { bg: '#f8fafc', text: '#334155', name: 'Primary-50 + Steel-700' },
  ];

  // Calculate contrast ratio using WCAG formula
  const getLuminance = (hex) => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;

    const sRGB = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  };

  const getContrastRatio = (bg, text) => {
    const l1 = getLuminance(bg);
    const l2 = getLuminance(text);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  return (
    <div className="p-6 bg-white dark:bg-slate-900 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">
        WCAG 2.1 AA Color Contrast Compliance
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {colorTests.map(({ bg, text, name }, index) => {
          const ratio = getContrastRatio(bg, text);
          const passes = ratio >= 4.5;
          
          return (
            <div
              key={index}
              className="p-4 rounded-lg border"
              style={{ backgroundColor: bg, color: text }}
            >
              <div className="font-semibold">{name}</div>
              <div className="text-sm opacity-90">
                Ratio: {ratio.toFixed(2)}:1
              </div>
              <div className={`text-xs font-bold ${passes ? 'text-green-400' : 'text-red-400'}`}>
                {passes ? '✓ PASSES WCAG AA' : '✗ FAILS WCAG AA'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Recommended Fixes:
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Use white text on colored backgrounds (buttons, cards)</li>
          <li>• Ensure minimum 4.5:1 contrast for normal text</li>
          <li>• Use 3:1 ratio minimum for large text (18pt+ or 14pt+ bold)</li>
          <li>• Test both light and dark mode combinations</li>
        </ul>
      </div>
    </div>
  );
};

export default ColorContrastChecker;