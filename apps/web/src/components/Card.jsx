import React from 'react';

const Card = ({ 
  children, 
  className = '', 
  hover = false, 
  padding = 'p-6',
  variant = 'default',
  glass = false,
  loading = false,
  featured = false,
  glow = false,
  interactive = false,
  role,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...props 
}) => {
  const baseClasses = `
    card-premium transition-all duration-300 ease-out focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-2
    ${padding}
  `;

  const variantClasses = {
    default: `
      bg-white dark:bg-slate-900
      border-slate-200/50 dark:border-slate-700/50
      shadow-sm hover:shadow-lg
    `,
    elevated: `
      bg-white dark:bg-slate-900 
      border-slate-200/50 dark:border-slate-700/50
      shadow-lg hover:shadow-xl hover:-translate-y-1
    `,
    ghost: `
      bg-slate-50/80 dark:bg-slate-800/30 
      border-slate-200/40 dark:border-slate-700/30
      backdrop-blur-sm shadow-sm hover:shadow-md
    `,
    gradient: `
      bg-gradient-to-br from-white to-slate-50/50
      dark:from-slate-900 dark:to-slate-800/50
      border-slate-200/50 dark:border-slate-700/40
      shadow-lg hover:shadow-xl
    `,
    premium: `
      card-premium hover:scale-105 hover:-translate-y-2
      shadow-xl hover:shadow-2xl
    `
  };

  const hoverClasses = hover ? `
    card-interactive cursor-pointer
    hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-2
    hover:border-primary-200 dark:hover:border-primary-700/50
  ` : '';

  const glassClasses = glass ? `
    glass dark:glass-dark
    backdrop-blur-premium
  ` : '';

  if (loading) {
    return (
      <div
        className={`
          ${baseClasses}
          ${glass ? glassClasses : variantClasses[variant]}
          ${className}
          animate-pulse
        `}
        role="status"
        aria-label="Loading content"
        {...props}
      >
        <div className="space-y-4">
          <div className="h-4 bg-gray-300 dark:bg-slate-600 rounded w-3/4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-300 dark:bg-slate-600 rounded w-full"></div>
            <div className="h-3 bg-gray-300 dark:bg-slate-600 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  const conditionalClasses = [
    interactive && 'card-interactive cursor-pointer',
    featured && 'card-featured',
    glow && 'card-glow'
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`
        ${baseClasses}
        ${glass ? glassClasses : variantClasses[variant]}
        ${hoverClasses}
        ${conditionalClasses}
        ${className}
      `}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;