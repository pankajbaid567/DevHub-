import React, { lazy, Suspense, Component } from 'react';
import Card from './Card';

// Lazy load all page components
const Home = lazy(() => import('../pages/Home'));
const Login = lazy(() => import('../pages/Login'));
const Register = lazy(() => import('../pages/Register'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Questions = lazy(() => import('../pages/Questions'));
const Snippets = lazy(() => import('../pages/Snippets'));
const Sessions = lazy(() => import('../pages/Sessions'));
const Mentor = lazy(() => import('../pages/Mentor'));
const Resume = lazy(() => import('../pages/Resume'));
const Skills = lazy(() => import('../pages/Skills'));
const NotFound = lazy(() => import('../pages/NotFound'));

// Enhanced Loading Component
const PageLoader = ({ text = 'Loading...' }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <Card className="p-8 text-center max-w-sm mx-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {text}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        This won't take long...
      </p>
      {/* Progress indicator */}
      <div className="mt-4 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
        <div className="bg-primary-600 h-1 rounded-full animate-pulse" style={{ width: '60%' }}></div>
      </div>
    </Card>
  </div>
);

// Error Boundary Component
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Component Error:', error, errorInfo);
    
    // Send error to monitoring service
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: error.toString(),
        fatal: false
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <Card className="max-w-md mx-4 text-center p-8">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Something went wrong
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
              >
                Refresh Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Try Again
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Error Details (Development)
                </summary>
                <pre className="mt-2 p-4 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for lazy loading with error boundary
const withLazyLoading = (Component, loadingText) => {
  return (props) => (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader text={loadingText} />}>
        <Component {...props} />
      </Suspense>
    </ErrorBoundary>
  );
};

// Export enhanced components
export const LazyHome = withLazyLoading(Home, 'Loading DevHub+...');
export const LazyLogin = withLazyLoading(Login, 'Loading login page...');
export const LazyRegister = withLazyLoading(Register, 'Loading registration...');
export const LazyDashboard = withLazyLoading(Dashboard, 'Loading dashboard...');
export const LazyQuestions = withLazyLoading(Questions, 'Loading questions...');
export const LazySnippets = withLazyLoading(Snippets, 'Loading code snippets...');
export const LazySessions = withLazyLoading(Sessions, 'Loading sessions...');
export const LazyMentor = withLazyLoading(Mentor, 'Loading AI Mentor...');
export const LazyResume = withLazyLoading(Resume, 'Loading resume tools...');
export const LazySkills = withLazyLoading(Skills, 'Loading skills tracker...');
export const LazyNotFound = withLazyLoading(NotFound, 'Loading page...');

// Export core components
export { PageLoader, ErrorBoundary };

// Service Worker Registration
export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      console.log('ServiceWorker registration successful');
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            if (confirm('A new version of DevHub+ is available. Reload to update?')) {
              window.location.reload();
            }
          }
        });
      });
      
      return registration;
    } catch (error) {
      console.error('ServiceWorker registration failed:', error);
    }
  }
};