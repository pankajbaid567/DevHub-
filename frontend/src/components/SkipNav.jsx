import React from 'react';

const SkipNav = () => {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-accent-600 text-white px-4 py-2 rounded-lg font-semibold focus:outline-none focus:ring-4 focus:ring-accent-500 focus:ring-offset-2 transition-all duration-200"
      tabIndex={0}
    >
      Skip to main content
    </a>
  );
};

export default SkipNav;