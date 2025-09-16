import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeSelector = ({ className = '' }) => {
  const { theme, setTheme, systemPreference } = useTheme();
  
  const themes = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor }
  ];

  const handleThemeChange = (themeId) => {
    if (themeId === 'system') {
      setTheme(systemPreference);
      localStorage.setItem('theme-preference', 'system');
    } else {
      setTheme(themeId);
      localStorage.setItem('theme-preference', themeId);
    }
  };

  const getCurrentTheme = () => {
    const preference = localStorage.getItem('theme-preference');
    if (preference === 'system') return 'system';
    return theme;
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center space-x-1 bg-white dark:bg-slate-800 rounded-lg p-1 shadow-sm border border-gray-200 dark:border-slate-700">
        {themes.map(({ id, label, icon: Icon }) => {
          const isActive = getCurrentTheme() === id;
          
          return (
            <button
              key={id}
              onClick={() => handleThemeChange(id)}
              className={`
                flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200
                ${isActive 
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm' 
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }
                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800
              `}
              aria-label={`Switch to ${label.toLowerCase()} theme`}
              aria-pressed={isActive}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeSelector;