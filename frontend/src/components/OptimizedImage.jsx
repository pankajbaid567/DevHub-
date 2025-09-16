import React, { useState, useRef, useCallback } from 'react';

/**
 * Optimized Image Component with WebP support, lazy loading, and responsive sizing
 */
const OptimizedImage = ({
  src,
  alt,
  width,
  height,
  className = '',
  priority = false,
  quality = 85,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  placeholder = 'blur',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  // Generate WebP and fallback URLs
  const getOptimizedUrl = useCallback((originalSrc, format = 'webp') => {
    if (!originalSrc) return '';
    
    // If it's already a data URL or external URL, return as-is
    if (originalSrc.startsWith('data:') || originalSrc.startsWith('http')) {
      return originalSrc;
    }

    // Generate optimized URL based on your image optimization service
    const baseUrl = originalSrc.replace(/\.[^/.]+$/, ''); // Remove extension
    return `${baseUrl}.${format}?q=${quality}&w=${width || 800}&h=${height || 600}`;
  }, [quality, width, height]);

  const webpUrl = getOptimizedUrl(src, 'webp');
  const fallbackUrl = getOptimizedUrl(src, 'jpg');

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
  };

  // Generate srcSet for responsive images
  const generateSrcSet = (url, format) => {
    if (!url) return '';
    const base = url.split('?')[0];
    const params = new URLSearchParams(url.split('?')[1] || '');
    
    return [1, 2, 3].map(scale => {
      params.set('w', Math.round((width || 800) * scale));
      params.set('h', Math.round((height || 600) * scale));
      return `${base}?${params.toString()} ${scale}x`;
    }).join(', ');
  };

  if (hasError) {
    return (
      <div 
        className={`bg-gray-200 dark:bg-gray-700 flex items-center justify-center ${className}`}
        style={{ width, height }}
        role="img"
        aria-label={alt}
      >
        <span className="text-gray-400 text-sm">Failed to load image</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width, height }}>
      {/* Blur placeholder */}
      {placeholder === 'blur' && !isLoaded && (
        <div 
          className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse"
          style={{
            backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
            backgroundSize: '200px 100%',
            animation: 'shimmer 1.5s infinite'
          }}
        />
      )}

      <picture>
        {/* WebP source */}
        <source
          srcSet={generateSrcSet(webpUrl, 'webp')}
          sizes={sizes}
          type="image/webp"
        />
        
        {/* Fallback */}
        <img
          ref={imgRef}
          src={fallbackUrl}
          srcSet={generateSrcSet(fallbackUrl, 'jpg')}
          sizes={sizes}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } w-full h-full object-cover`}
          {...props}
        />
      </picture>

      {/* Loading state */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}
    </div>
  );
};

/**
 * Avatar component with optimized images
 */
export const Avatar = ({ 
  src, 
  alt, 
  size = 'md', 
  className = '', 
  fallback,
  ...props 
}) => {
  const sizes = {
    sm: { width: 32, height: 32, class: 'w-8 h-8' },
    md: { width: 48, height: 48, class: 'w-12 h-12' },
    lg: { width: 64, height: 64, class: 'w-16 h-16' },
    xl: { width: 96, height: 96, class: 'w-24 h-24' }
  };

  const { width, height, class: sizeClass } = sizes[size] || sizes.md;

  if (!src && fallback) {
    return (
      <div className={`${sizeClass} rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold ${className}`}>
        {fallback}
      </div>
    );
  }

  return (
    <OptimizedImage
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={`${sizeClass} rounded-full ${className}`}
      priority={size === 'xl'}
      {...props}
    />
  );
};

/**
 * Hero image component for landing pages
 */
export const HeroImage = ({ src, alt, className = '', ...props }) => (
  <OptimizedImage
    src={src}
    alt={alt}
    width={1200}
    height={600}
    priority={true}
    className={`w-full h-auto ${className}`}
    sizes="100vw"
    {...props}
  />
);

/**
 * Card image component
 */
export const CardImage = ({ src, alt, className = '', ...props }) => (
  <OptimizedImage
    src={src}
    alt={alt}
    width={400}
    height={200}
    className={`w-full h-48 ${className}`}
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    {...props}
  />
);

/**
 * Utility function to preload critical images
 */
export const preloadImage = (src, priority = 'high') => {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  link.fetchPriority = priority;
  
  document.head.appendChild(link);
};

/**
 * Hook for lazy loading images with Intersection Observer
 */
export const useLazyImage = (src, options = {}) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setImageSrc(src);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options
      }
    );

    const currentImg = imgRef.current;
    if (currentImg) {
      observer.observe(currentImg);
    }

    return () => {
      if (currentImg) {
        observer.unobserve(currentImg);
      }
    };
  }, [src, options]);

  const handleLoad = () => setIsLoaded(true);

  return { imgRef, imageSrc, isLoaded, handleLoad };
};

// Add shimmer animation to global styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shimmer {
      0% { transform: translateX(-200px); }
      100% { transform: translateX(400px); }
    }
  `;
  document.head.appendChild(style);
}

export default OptimizedImage;