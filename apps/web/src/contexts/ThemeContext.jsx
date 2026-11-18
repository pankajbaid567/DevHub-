import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'cyberpunk',
  toggleTheme: () => {},
  setTheme: () => {},
  systemPreference: 'light',
  isCyberpunk: true
});

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    // Check localStorage first
    const stored = localStorage.getItem('theme');
    if (stored && (stored === 'light' || stored === 'dark' || stored === 'cyberpunk')) {
      return stored;
    }
    
    // Default to cyberpunk for the new theme
    return 'cyberpunk';
  });

  const [systemPreference, setSystemPreference] = useState(() => 
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    
    // Remove all theme classes
    root.classList.remove('dark', 'cyber-theme');
    body.classList.remove('cyber-theme');
    
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'cyberpunk') {
      root.classList.add('dark', 'cyber-theme');
      body.classList.add('cyber-theme');
    }

    // Store in localStorage
    localStorage.setItem('theme', theme);
    
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      const themeColors = {
        light: '#ffffff',
        dark: '#0f172a',
        cyberpunk: '#0a0a0a'
      };
      metaThemeColor.setAttribute('content', themeColors[theme] || themeColors.cyberpunk);
    }
  }, [theme]);

  const setTheme = (newTheme) => {
    if (newTheme === 'light' || newTheme === 'dark' || newTheme === 'cyberpunk') {
      setThemeState(newTheme);
    }
  };

  const toggleTheme = () => {
    setThemeState(current => {
      switch (current) {
        case 'light':
          return 'dark';
        case 'dark':
          return 'cyberpunk';
        case 'cyberpunk':
          return 'light';
        default:
          return 'cyberpunk';
      }
    });
  };

  const value = {
    theme,
    toggleTheme,
    setTheme,
    systemPreference,
    isCyberpunk: theme === 'cyberpunk'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};