import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import { Eye, EyeOff, LogIn, Github, Mail, Lock, AlertCircle } from 'lucide-react';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || '/dashboard';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      await login(formData.email, formData.password);
      navigate(from, { replace: true });
    } catch (error) {
      setErrors({
        general: error.response?.data?.message || 'Login failed. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container animate-fade-in">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo" style={{ width: '4rem', height: '4rem', borderRadius: '1rem' }}>
            <LogIn className="h-8 w-8" />
          </div>
          <h2 className="auth-title">Welcome Back</h2>
          <p className="auth-subtitle">Sign in to your DevHub+ account</p>
          <p className="auth-subtitle">
            Don't have an account?{' '}
            <Link to="/register" className="btn-link font-bold">Create one now</Link>
          </p>
        </div>

        {/* Form */}
        <div className="auth-card">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* General Error */}
            {errors.general && (
              <div className="bg-red-50/80 border border-red-200 rounded-lg p-4 backdrop-blur-sm">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                  <div className="ml-3">
                    <p className="text-sm text-red-700 font-bold">
                      {errors.general}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="input-label">
                Email address
              </label>
              <div className="input-wrapper">
                <div className="input-icon-left">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`input has-left-icon ${errors.email ? 'border-red-400' : ''}`}
                  placeholder="Enter your email address"
                />
              </div>
              {errors.email && (
                <p className="form-error">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="input-label">
                Password
              </label>
              <div className="input-wrapper">
                <div className="input-icon-left">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`input has-left-icon ${errors.password ? 'border-red-400' : ''}`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (<EyeOff className="h-5 w-5" />) : (<Eye className="h-5 w-5" />)}
                </button>
              </div>
              {errors.password && (
                <p className="form-error">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Remember me and Forgot password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-slate-300 rounded dark:border-slate-600 dark:bg-slate-800"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-300">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <Link
                  to="/forgot-password"
                  className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>

            {/* Submit Button */}
            <button type="submit" disabled={isLoading} className="btn btn-primary w-full btn-xl">
              {isLoading ? (
                <div className="flex items-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>Signing you in...</div>
              ) : (
                'Sign in to DevHub+'
              )}
            </button>

            {/* Divider */}
            <div className="auth-divider text-center">
              <span className="auth-divider-label">Or continue with</span>
            </div>

            {/* Social Login */}
            <button type="button" className="social-btn">
              <Github className="h-5 w-5 mr-2" /> Continue with GitHub
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-4">
          By signing in, you agree to our{' '}
          <Link to="/terms" className="btn-link">Terms of Service</Link>{' '}and{' '}
          <Link to="/privacy" className="btn-link">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;