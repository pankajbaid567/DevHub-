import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SkipNav from '../components/SkipNav';
import HeroSection from '../components/HeroSection';
import FeatureCards from '../components/FeatureCards';
import Card from '../components/Card';
import { 
  ArrowRight,
  Star,
  Zap
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

  return (
    <>
      <SkipNav />
      <main id="main-content" className="min-h-screen">
        {/* Premium Hero Section */}
        <HeroSection />
        
        {/* Premium Feature Cards */}
        <FeatureCards />
        
        {/* Trusted By Section */}
        <section className="py-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
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
        <section className="py-24 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-display-lg font-bold text-slate-900 dark:text-white mb-4">
                Loved by <span className="text-gradient-primary">developers</span> worldwide
              </h2>
              <p className="text-body-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
                Join thousands of developers who have accelerated their careers with DevHub+
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <Card 
                  key={index} 
                  className="p-8 hover:scale-105 transition-transform duration-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-amber-400 fill-current" />
                    ))}
                  </div>
                  <blockquote className="text-slate-600 dark:text-slate-300 mb-6 italic">
                    "{testimonial.content}"
                  </blockquote>
                  <div className="flex items-center">
                    <img 
                      src={testimonial.avatar} 
                      alt={testimonial.name}
                      className="w-12 h-12 rounded-full mr-4"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {testimonial.name}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        {testimonial.role} at {testimonial.company}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-24 bg-gradient-to-br from-primary-600 via-primary-700 to-accent-600 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDIwIDAgTCAwIDAgMCAyMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-20"></div>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
            <h2 className="text-display-lg font-bold mb-6">
              Ready to level up your coding journey?
            </h2>
            <p className="text-body-lg opacity-90 mb-8 max-w-2xl mx-auto">
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