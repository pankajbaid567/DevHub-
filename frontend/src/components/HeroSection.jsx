import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  ArrowRight, 
  Zap, 
  Shield, 
  Users, 
  TrendingUp,
  Sparkles,
  PlayCircle,
  Star
} from 'lucide-react';

const HeroSection = () => {
  const { isAuthenticated } = useAuth();

  const stats = [
    { label: 'Active Developers', value: '50K+', icon: Users },
    { label: 'Code Snippets', value: '1M+', icon: TrendingUp },
    { label: 'Success Rate', value: '99%', icon: Shield },
    { label: 'AI Responses', value: '<1s', icon: Zap }
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-primary-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-primary-900/20">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient Orbs */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-gradient-to-r from-primary-400/20 to-accent-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-gradient-to-r from-accent-400/20 to-primary-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary-300/10 to-accent-300/10 rounded-full blur-3xl"></div>
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDM3LCA5OSwgMjM1LCAwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30 dark:opacity-10"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/30 dark:to-accent-900/30 border border-primary-200/50 dark:border-primary-700/50 rounded-full text-sm font-semibold text-primary-700 dark:text-primary-300 animate-fade-in-up">
            <Sparkles className="h-4 w-4" />
            <span>Introducing DevHub+ AI Assistant</span>
            <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div>
          </div>

          {/* Main Headlines */}
          <div className="space-y-6 animate-fade-in-up delay-200">
            <h1 className="text-display-2xl md:text-display-xl font-black text-slate-900 dark:text-white leading-tight">
              The Ultimate{' '}
              <span className="text-gradient-primary">Developer</span>
              {' '}Platform
            </h1>
            <h2 className="text-display-lg md:text-display-md font-bold text-gradient-accent leading-tight">
              Code. Learn. Collaborate. Excel.
            </h2>
          </div>

          {/* Subheading */}
          <p className="text-body-lg md:text-heading-md text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed animate-fade-in-up delay-300">
            Join the world's most advanced developer community. Get instant answers, 
            share code snippets, connect with mentors, and accelerate your coding journey 
            with AI-powered assistance.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 animate-fade-in-up delay-400">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="btn btn-primary btn-xl group"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="btn btn-primary btn-xl group"
                >
                  <span>Start Building Today</span>
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  to="/login"
                  className="btn btn-outline btn-xl group"
                >
                  <PlayCircle className="h-5 w-5" />
                  <span>Watch Demo</span>
                </Link>
              </>
            )}
          </div>

          {/* Trust Indicators */}
          <div className="pt-12 animate-fade-in-up delay-500">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-6">
              Trusted by developers worldwide
            </p>
            <div className="flex items-center justify-center space-x-2 mb-8">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} className="h-5 w-5 text-amber-400 fill-current" />
              ))}
              <span className="ml-2 text-sm font-semibold text-slate-600 dark:text-slate-400">
                4.9/5 from 10,000+ reviews
              </span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 animate-fade-in-up delay-600">
            {stats.map(({ label, value, icon: Icon }, index) => (
              <div
                key={label}
                className="card card-glass p-6 text-center hover:scale-105 transition-transform duration-300"
                style={{ animationDelay: `${600 + index * 100}ms` }}
              >
                <div className="flex justify-center mb-3">
                  <div className="p-3 bg-gradient-to-br from-primary-500 to-accent-500 rounded-2xl">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                  {value}
                </div>
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-slate-300 dark:border-slate-600 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-slate-400 dark:bg-slate-500 rounded-full mt-2 animate-pulse"></div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;