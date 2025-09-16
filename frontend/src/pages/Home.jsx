import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SkipNav from '../components/SkipNav';
import HeroSection from '../components/HeroSection';
import FeatureCards from '../components/FeatureCards';
import Card from '../components/Card';
import { 
  ArrowRight,
  Star,
  Zap,
  Code,
  Users,
  TrendingUp,
  CheckCircle,
  PlayCircle,
  Sparkles,
  Rocket,
  Shield,
  Globe,
  Heart
} from 'lucide-react';

// Company logos data
const companyLogos = [
  { name: 'Google' },
  { name: 'Meta' },
  { name: 'Netflix' },
  { name: 'Spotify' },
  { name: 'Uber' },
  { name: 'Airbnb' }
];

// Testimonials data
const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Senior Frontend Developer',
    company: 'Google',
    avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
    rating: 5,
    content: 'DevHub+ transformed my development workflow. The AI-powered tools and collaborative features helped me ship features 3x faster.'
  },
  {
    name: 'Marcus Rodriguez',
    role: 'Full Stack Engineer',
    company: 'Meta',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    rating: 5,
    content: 'The best investment I made for my career. The learning paths and project templates are incredibly well-structured.'
  },
  {
    name: 'Emily Johnson',
    role: 'DevOps Specialist',
    company: 'Netflix',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
    rating: 5,
    content: 'Game-changer for our team productivity. The deployment automation and monitoring tools saved us countless hours.'
  }
];

const Home = () => {
  const { isAuthenticated } = useAuth();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <>
      <SkipNav />
      <main id="main-content" className="min-h-screen">
        {/* Premium Hero Section */}
        <HeroSection />
        
        {/* Premium Feature Cards */}
        <FeatureCards />

        {/* Enhanced Stats Section */}
        <section className="section-padding bg-gradient-to-br from-slate-50 via-white to-primary-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <div className="container-premium">
            <div className={`text-center mb-16 ${isVisible ? 'animate-fade-in' : 'opacity-0'}`}>
              <h2 className="text-display-1 gradient-text-premium mb-6">
                Trusted by 50,000+ Developers
              </h2>
              <p className="text-body-large text-slate-600 dark:text-slate-400 max-w-3xl mx-auto">
                Join the fastest-growing developer community and accelerate your coding journey
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
              {[
                { icon: Users, value: '50K+', label: 'Active Developers', color: 'text-blue-500' },
                { icon: Code, value: '2M+', label: 'Code Snippets', color: 'text-green-500' },
                { icon: TrendingUp, value: '99.9%', label: 'Uptime', color: 'text-purple-500' },
                { icon: Rocket, value: '24/7', label: 'AI Support', color: 'text-orange-500' }
              ].map((stat, index) => (
                <div key={index} className={`card-premium p-8 text-center group hover:scale-105 transition-all duration-300 ${isVisible ? 'animate-slide-up' : 'opacity-0'}`} 
                     style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 mb-4 group-hover:scale-110 transition-transform`}>
                    <stat.icon className={`h-8 w-8 ${stat.color}`} />
                  </div>
                  <div className="text-display-2 font-black text-slate-900 dark:text-white mb-2">{stat.value}</div>
                  <div className="text-caption">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
        
        {/* Trusted By Section */}
        <section className="section-padding bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div className="container-premium text-center">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-8">
              Trusted by developers at
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center opacity-60 hover:opacity-100 transition-opacity duration-300">
              {companyLogos.map(({ name }) => (
                <div key={name} className="flex items-center justify-center">
                  <div className="text-2xl font-bold text-slate-400 dark:text-slate-600">
                    {name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
                {/* Premium Testimonials */}
  <section className="section-padding bg-white dark:bg-slate-900 relative overflow-hidden">
          {/* Background Elements */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50/30 via-transparent to-accent-50/30 dark:from-primary-900/10 dark:to-accent-900/10"></div>
          <div className="absolute top-1/4 -left-32 w-64 h-64 bg-gradient-to-r from-primary-400/20 to-accent-400/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-gradient-to-r from-accent-400/20 to-primary-400/20 rounded-full blur-3xl"></div>

          <div className="container-premium relative">
            <div className={`text-center mb-16 ${isVisible ? 'animate-fade-in' : 'opacity-0'}`}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-100 to-accent-100 dark:from-primary-900/30 dark:to-accent-900/30 rounded-full mb-6">
                <Sparkles className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">Developer Stories</span>
              </div>
              <h2 className="text-display-1 gradient-text-premium mb-6">
                Loved by 50,000+ Developers Worldwide
              </h2>
              <p className="text-body-large text-slate-600 dark:text-slate-400 max-w-3xl mx-auto">
                Join the community that's transforming how developers learn, build, and grow their careers
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <div key={index} className={`card-premium p-8 group hover:scale-105 transition-all duration-300 card-glow ${isVisible ? 'animate-slide-up' : 'opacity-0'}`}
                     style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="flex items-center space-x-1 mb-6">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400 drop-shadow-sm" />
                    ))}
                  </div>
                  <blockquote className="text-slate-700 dark:text-slate-300 mb-8 leading-relaxed text-lg font-medium">
                    "{testimonial.content}"
                  </blockquote>
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <img
                        src={testimonial.avatar}
                        alt={testimonial.name}
                        className="w-14 h-14 rounded-2xl object-cover border-2 border-primary-200 dark:border-primary-700"
                      />
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center">
                        <CheckCircle className="h-3 w-3 text-white" />
                      </div>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-lg">
                        {testimonial.name}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                        {testimonial.role} at <span className="text-primary-600 dark:text-primary-400 font-semibold">{testimonial.company}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="section-padding bg-gradient-to-br from-primary-600 via-primary-700 to-accent-600 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDIwIDAgTCAwIDAgMCAyMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-20"></div>
          <div className="container-premium text-center relative max-w-4xl">
            <h2 className="text-display-lg font-bold mb-6">
              Ready to level up your coding journey?
            </h2>
            <p className="text-body-large opacity-90 mb-8 max-w-2xl mx-auto">
              Join 50,000+ developers who are already building better software with DevHub+. 
              Get started for free and unlock your potential.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {!isAuthenticated ? (
                <>
                  <Link
                    to="/register"
                    className="btn btn-secondary btn-xl"
                  >
                    <Zap className="h-5 w-5" />
                    <span>Start Free Today</span>
                  </Link>
                  <Link
                    to="/login"
                    className="btn btn-outline btn-xl bg-white/10 border-white/30 text-white hover:bg-white hover:text-primary-600"
                  >
                    <span>Sign In</span>
                  </Link>
                </>
              ) : (
                <Link
                  to="/dashboard"
                  className="btn btn-secondary btn-xl"
                >
                  <ArrowRight className="h-5 w-5" />
                  <span>Go to Dashboard</span>
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
};

export default Home;