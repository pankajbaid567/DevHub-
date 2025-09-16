import React from 'react';
import { Link } from 'react-router-dom';
import { 
  HelpCircle, 
  Code, 
  MessageSquare, 
  Zap, 
  FileText, 
  TrendingUp,
  ArrowRight,
  Sparkles,
  Users,
  Clock,
  Award
} from 'lucide-react';

const FeatureCards = () => {
  const features = [
    {
      id: 'questions',
      title: 'Q&A Community',
      description: 'Get instant help from experienced developers worldwide. Ask questions, share knowledge, and grow together.',
      icon: HelpCircle,
      link: '/questions',
      badge: 'Popular',
      stats: '10K+ Questions',
      color: 'from-blue-500 to-cyan-500',
      bgGradient: 'from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20',
      highlights: ['Instant Answers', 'Expert Community', 'Gamification']
    },
    {
      id: 'snippets',
      title: 'Code Snippets',
      description: 'Discover, share, and organize code snippets. Build your personal library of reusable code blocks.',
      icon: Code,
      link: '/snippets',
      badge: 'Trending',
      stats: '50K+ Snippets',
      color: 'from-emerald-500 to-teal-500',
      bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20',
      highlights: ['Syntax Highlighting', 'Smart Search', 'Version Control']
    },
    {
      id: 'ai-mentor',
      title: 'AI Mentor',
      description: 'Get personalized coding guidance from our advanced AI assistant. Learn faster with intelligent recommendations.',
      icon: Zap,
      link: '/mentor',
      badge: 'AI',
      stats: '<1s Response',
      color: 'from-amber-500 to-orange-500',
      bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20',
      highlights: ['Real-time Help', 'Personalized', 'Always Available'],
      featured: true
    },
    {
      id: 'sessions',
      title: 'Live Sessions',
      description: 'Join interactive coding sessions, workshops, and pair programming with fellow developers.',
      icon: MessageSquare,
      link: '/sessions',
      badge: 'Live',
      stats: '200+ Weekly',
      color: 'from-purple-500 to-pink-500',
      bgGradient: 'from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20',
      highlights: ['Screen Sharing', 'Interactive Coding', 'Expert Mentors']
    },
    {
      id: 'resume',
      title: 'Resume Builder',
      description: 'Create stunning developer resumes with our AI-powered builder. Showcase your skills professionally.',
      icon: FileText,
      link: '/resume',
      badge: 'New',
      stats: '95% Success',
      color: 'from-indigo-500 to-purple-500',
      bgGradient: 'from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20',
      highlights: ['ATS Optimized', 'Tech-Focused', 'Real-time Preview']
    },
    {
      id: 'skills',
      title: 'Skill Tracker',
      description: 'Track your learning progress, set goals, and earn achievements as you advance in your coding journey.',
      icon: TrendingUp,
      link: '/skills',
      badge: 'Growth',
      stats: '20+ Skills',
      color: 'from-green-500 to-emerald-500',
      bgGradient: 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20',
      highlights: ['Progress Tracking', 'Achievements', 'Skill Badges']
    }
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16 animate-fade-in-up">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/30 dark:to-accent-900/30 border border-primary-200/50 dark:border-primary-700/50 rounded-full text-sm font-semibold text-primary-700 dark:text-primary-300 mb-6">
            <Sparkles className="h-4 w-4" />
            <span>Powerful Features</span>
          </div>
          <h2 className="text-display-lg font-bold text-slate-900 dark:text-white mb-4">
            Everything you need to{' '}
            <span className="text-gradient-primary">excel</span> as a developer
          </h2>
          <p className="text-body-lg text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
            From getting help with code to building your career, DevHub+ provides all the tools 
            and community support you need to succeed in your development journey.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Link
              key={feature.id}
              to={feature.link}
              className={`group block animate-fade-in-up ${
                feature.featured ? 'lg:col-span-1 md:col-span-2' : ''
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={`relative h-full p-8 bg-gradient-to-br ${feature.bgGradient} border border-slate-200/50 dark:border-slate-700/50 rounded-3xl transition-all duration-500 hover:shadow-2xl hover:scale-105 hover:-translate-y-2 group-hover:border-transparent overflow-hidden`}>
                {/* Background Pattern */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDIwIDAgTCAwIDAgMCAyMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDMpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20"></div>
                
                {/* Gradient Overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}></div>

                {/* Content */}
                <div className="relative">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className={`p-4 bg-gradient-to-br ${feature.color} rounded-2xl shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                      <feature.icon className="h-8 w-8 text-white" />
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full ${
                        feature.badge === 'AI' 
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                          : feature.badge === 'New'
                          ? 'bg-emerald-500 text-white'
                          : feature.badge === 'Live'
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'bg-primary-500 text-white'
                      }`}>
                        {feature.badge}
                      </span>
                      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-1">
                        {feature.stats}
                      </div>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="mb-6">
                    <h3 className="text-heading-lg font-bold text-slate-900 dark:text-white mb-3 group-hover:text-gradient-primary transition-all duration-300">
                      {feature.title}
                    </h3>
                    <p className="text-body text-slate-600 dark:text-slate-300 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  {/* Highlights */}
                  <div className="mb-6">
                    <div className="flex flex-wrap gap-2">
                      {feature.highlights.map((highlight, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium bg-white/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50 rounded-full"
                        >
                          {highlight}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      Explore {feature.title.toLowerCase()}
                    </span>
                    <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-hover:translate-x-1 transition-all duration-300" />
                  </div>
                </div>

                {/* Hover Glow Effect */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 blur-3xl transition-opacity duration-500 -z-10`}></div>
              </div>
            </Link>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16 animate-fade-in-up delay-600">
          <p className="text-body-lg text-slate-600 dark:text-slate-300 mb-6">
            Ready to supercharge your development workflow?
          </p>
          <Link
            to="/register"
            className="btn btn-primary btn-lg group"
          >
            <Users className="h-5 w-5" />
            <span>Join the Community</span>
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default FeatureCards;