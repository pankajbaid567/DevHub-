import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import SkipNav from '../components/SkipNav';
import { 
  HelpCircle, 
  Code, 
  MessageSquare, 
  BookOpen, 
  FileText, 
  TrendingUp,
  Plus,
  Activity,
  Clock,
  ArrowUpRight,
  Star,
  Users,
  Calendar,
  Target,
  Award,
  Zap,
  Sparkles,
  Rocket,
  Shield,
  Heart
} from 'lucide-react';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    questionsAsked: 12,
    questionsAnswered: 8,
    snippetsShared: 15,
    mentorSessions: 6,
    reputation: 145,
    streak: 7
  });

  const quickActions = [
    {
      title: 'Ask Question',
      description: 'Get help from the community',
      icon: HelpCircle,
      link: '/questions/new',
      color: 'bg-primary-600 hover:bg-primary-700',
      textColor: 'text-primary-600'
    },
    {
      title: 'Share Snippet',
      description: 'Share your code with others',
      icon: Code,
      link: '/snippets/new',
      color: 'bg-accent-500 hover:bg-accent-600',
      textColor: 'text-accent-600'
    },
    {
      title: 'Find Mentor',
      description: 'Connect with experienced developers',
      icon: MessageSquare,
      link: '/mentor',
      color: 'bg-secondary-600 hover:bg-secondary-700',
      textColor: 'text-secondary-600'
    },
    {
      title: 'Practice Skills',
      description: 'Improve your coding abilities',
      icon: BookOpen,
      link: '/skills',
      color: 'bg-accent-500 hover:bg-accent-600',
      textColor: 'text-accent-600'
    }
  ];

  const recentActivity = [
    {
      type: 'question',
      title: 'How to optimize React state updates?',
      time: '2 hours ago',
      status: 'answered',
      color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
    },
    {
      type: 'snippet',
      title: 'Custom React Hook for API calls',
      time: '1 day ago',
      status: 'shared',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
    },
    {
      type: 'session',
      title: 'Live coding: Building a chat app',
      time: '2 days ago',
      status: 'completed',
      color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300'
    },
    {
      type: 'mentor',
      title: 'Career guidance session',
      time: '3 days ago',
      status: 'completed',
      color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300'
    }
  ];

  const achievements = [
    { name: 'First Question', description: 'Asked your first question', earned: true },
    { name: 'Helper', description: 'Answered 5 questions', earned: true },
    { name: 'Code Sharer', description: 'Shared 10 snippets', earned: true },
    { name: 'Mentor Seeker', description: 'Completed 3 AI mentor sessions', earned: false }
  ];

  return (
    <>
      <SkipNav />
      <main id="main-content" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/20 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 py-8" role="main">
      <div className="container-premium">
        {/* Welcome Header */}
        <div className="mb-16 animate-fade-in">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-100 to-accent-100 dark:from-primary-900/30 dark:to-accent-900/30 rounded-full mb-8">
              <Sparkles className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">Developer Dashboard</span>
            </div>
            <h1 className="text-hero gradient-text-premium mb-6 text-shadow-soft">
              Welcome back,{' '}
              <span className="text-accent-600 dark:text-accent-400 font-black">
                {user?.name || 'Developer'}
              </span>
              ! 👋
            </h1>
            <p className="text-body-large text-slate-600 dark:text-slate-400 max-w-3xl mx-auto">
              Your personalized workspace is ready. Continue building amazing things and growing your developer skills.
            </p>
          </div>
        </div>

        {/* Stats Overview */}
                {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            <div className="card-premium p-8 group card-interactive card-glow">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-caption mb-2">Questions Asked</p>
                <p className="text-display-2 font-black text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{stats.questionsAsked}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-primary-500 to-primary-600 rounded-3xl shadow-lg group-hover:shadow-primary-500/40 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <HelpCircle className="h-7 w-7 text-white drop-shadow-sm" />
              </div>
            </div>
            <div className="flex items-center text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              +3 this week
            </div>
            <div className="mt-4 h-2 bg-gradient-to-r from-primary-500 to-primary-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
          
          <div className="card-premium p-8 group card-interactive card-glow">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-caption mb-2">Reputation Score</p>
                <p className="text-display-2 font-black text-slate-900 dark:text-white group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">{stats.reputation}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-3xl shadow-lg group-hover:shadow-yellow-500/40 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <Star className="h-7 w-7 text-white drop-shadow-sm" />
              </div>
            </div>
            <div className="flex items-center text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              +15 today
            </div>
            <div className="mt-4 h-2 bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>

          <div className="card-premium p-8 group card-interactive card-glow">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-caption mb-2">Code Snippets</p>
                <p className="text-display-2 font-black text-slate-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">{stats.snippetsShared}</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-green-500 to-green-600 rounded-3xl shadow-lg group-hover:shadow-green-500/40 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <Code className="h-7 w-7 text-white drop-shadow-sm" />
              </div>
            </div>
            <div className="flex items-center text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              +5 this month
            </div>
            <div className="mt-4 h-2 bg-gradient-to-r from-green-500 to-green-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>

                    <div className="card-premium p-8 group card-interactive card-glow">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-caption mb-2">Current Streak</p>
                <p className="text-display-2 font-black text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{stats.streak} days</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-orange-500 to-orange-600 rounded-3xl shadow-lg group-hover:shadow-orange-500/40 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
                <Target className="h-7 w-7 text-white drop-shadow-sm" />
              </div>
            </div>
            <div className="flex items-center text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
              <Zap className="h-4 w-4 mr-1" />
              Keep it up!
            </div>
            <div className="mt-4 h-2 bg-gradient-to-r from-orange-500 to-orange-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <div className="card-premium p-10 mb-8">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h2 className="text-display-2 font-black text-slate-900 dark:text-white">Quick Actions</h2>
                  <p className="text-body text-slate-600 dark:text-slate-400 mt-2">Jump into your next task and keep building</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 rounded-2xl">
                  <Plus className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                {quickActions.map(({ title, description, icon: Icon, link, color, textColor }) => (
                  <Link key={title} to={link} className="group">
                    <div className="card-premium p-6 group-hover:scale-105 transition-all duration-300 border-2 border-transparent group-hover:border-primary-200 dark:group-hover:border-primary-700/50">
                      <div className="flex items-start">
                        <div className={`p-3 rounded-2xl ${color.replace('hover:', '')} mr-4 group-hover:scale-110 transition-transform duration-300 shadow-medium`}>
                          <Icon className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className={`font-black text-lg ${textColor} dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors mb-2 drop-shadow-lg`}>
                            {title}
                          </h3>
                          <p className="text-sm text-slate-700 dark:text-slate-300 font-bold leading-relaxed drop-shadow-sm">
                            {description}
                          </p>
                        </div>
                        <ArrowUpRight className="h-5 w-5 text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-hover:scale-110 transition-all duration-300" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-slate-900 dark:text-white drop-shadow-lg">Recent Activity</h2>
                <Activity className="h-5 w-5 text-slate-400" />
              </div>
              
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start space-x-4">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white drop-shadow-sm">
                        {activity.title}
                      </p>
                      <div className="flex items-center mt-1 space-x-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${activity.color}`}>
                          {activity.status}
                        </span>
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-bold flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {activity.time}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <Link 
                  to="/activity" 
                  className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 font-black drop-shadow-sm"
                >
                  View all activity →
                </Link>
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Achievements */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-slate-900 dark:text-white drop-shadow-lg">Achievements</h2>
                <Award className="h-5 w-5 text-slate-400" />
              </div>
              
              <div className="space-y-3">
                {achievements.map((achievement, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      achievement.earned 
                        ? 'bg-yellow-100 dark:bg-yellow-900/20' 
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                      <Award className={`h-4 w-4 ${
                        achievement.earned 
                          ? 'text-yellow-600 dark:text-yellow-400' 
                          : 'text-slate-400'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black ${
                        achievement.earned 
                          ? 'text-slate-900 dark:text-white drop-shadow-sm' 
                          : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {achievement.name}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-bold">
                        {achievement.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Community Stats */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-slate-900 dark:text-white drop-shadow-lg">Community</h2>
                <Users className="h-5 w-5 text-slate-400" />
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-700 dark:text-slate-400 font-bold">Active Users</span>
                  <span className="text-sm font-black text-slate-900 dark:text-white drop-shadow-sm">1,247</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-700 dark:text-slate-400 font-bold">Questions Today</span>
                  <span className="text-sm font-black text-slate-900 dark:text-white drop-shadow-sm">89</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-700 dark:text-slate-400 font-bold">Your Rank</span>
                  <span className="text-sm font-black text-primary-600 dark:text-primary-400 drop-shadow-sm">#127</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <Link 
                  to="/leaderboard" 
                  className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 font-black drop-shadow-sm"
                >
                  View leaderboard →
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
      </main>
    </>
  );
};

export default Dashboard;