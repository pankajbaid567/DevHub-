import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, UserPlus, Github, Mail, Lock, User, AlertCircle, CheckCircle } from 'lucide-react';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

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

    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
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
      await register(formData.name, formData.email, formData.password);
      navigate('/dashboard');
    } catch (error) {
      setErrors({
        general: error.response?.data?.message || 'Registration failed. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrength = () => {
    const password = formData.password;
    if (!password) return { strength: 0, text: '', color: '' };
    
    let strength = 0;
    if (password.length >= 6) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z\d]/.test(password)) strength++;

    const levels = [
      { text: 'Very Weak', color: 'bg-red-500' },
      { text: 'Weak', color: 'bg-orange-500' },
      { text: 'Fair', color: 'bg-yellow-500' },
      { text: 'Good', color: 'bg-blue-500' },
      { text: 'Strong', color: 'bg-green-500' }
    ];

    return { strength, ...levels[Math.min(strength, 4)] };
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-logo">
            <UserPlus className="h-6 w-6" />
          </div>
          <h2 className="auth-title">
            Create your account
          </h2>
          <p className="auth-subtitle">
            Already have an account?{' '}
            <Link to="/login" className="btn-link font-bold">
              Sign in here
            </Link>
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

            {/* Name Field */}
            <div>
              <label htmlFor="name" className="input-label">
                Full Name
              </label>
              <div className="input-wrapper">
                <div className="input-icon-left">
                  <User className="h-5 w-5" />
                </div>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`input has-left-icon ${errors.name ? 'border-red-400' : ''}`}
                  placeholder="John Doe"
                />
              </div>
              {errors.name && (
                <p className="form-error">
                  {errors.name}
                </p>
              )}
            </div>

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
                  placeholder="you@example.com"
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
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`input has-left-icon ${errors.password ? 'border-red-400' : ''}`}
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (<EyeOff className="h-5 w-5" />) : (<Eye className="h-5 w-5" />)}
                </button>
              </div>
              
              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 font-bold">
                      Password strength: {passwordStrength.text}
                    </span>
                  </div>
                  <div className="w-full bg-slate-600 rounded-full h-1">
                    <div
                      className={`h-1 rounded-full transition-all ${passwordStrength.color}`}
                      style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
              
              {errors.password && (
                <p className="form-error">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="input-label">
                Confirm Password
              </label>
              <div className="input-wrapper">
                <div className="input-icon-left">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`input has-left-icon ${errors.confirmPassword ? 'border-red-400' : ''}`}
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (<EyeOff className="h-5 w-5" />) : (<Eye className="h-5 w-5" />)}
                </button>
              </div>
              
              {/* Password Match Indicator */}
              {formData.confirmPassword && formData.password && (
                <div className="mt-2 flex items-center">
                  {formData.password === formData.confirmPassword ? (
                    <div className="flex items-center text-green-400">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      <span className="text-xs font-bold">Passwords match</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-red-400">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      <span className="text-xs font-bold">Passwords don't match</span>
                    </div>
                  )}
                </div>
              )}
              
              {errors.confirmPassword && (
                <p className="form-error">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {/* Terms and Conditions */}
            <div className="flex items-center">
              <input
                id="agree-terms"
                name="agree-terms"
                type="checkbox"
                required
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-slate-300 rounded bg-slate-100"
              />
              <label htmlFor="agree-terms" className="ml-2 block text-sm font-bold text-gray-300">
                I agree to the{' '}
                <Link to="/terms" className="btn-link font-black">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="btn-link font-black">
                  Privacy Policy
                </Link>
              </label>
            </div>

            {/* Submit Button */}
            <button type="submit" disabled={isLoading} className="btn btn-primary w-full btn-xl">
              {isLoading ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <UserPlus className="-ml-1 mr-2 h-5 w-5 text-white" />
              )}
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>

            {/* Divider */}
            <div className="auth-divider text-center">
              <span className="auth-divider-label">Or continue with</span>
            </div>

            {/* Social Login */}
            <button type="button" className="social-btn">
              <Github className="h-5 w-5 mr-2" />
              GitHub
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register;