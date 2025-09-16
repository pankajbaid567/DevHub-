import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import { 
  TrendingUp, 
  Target, 
  Award, 
  BookOpen, 
  Code, 
  Database, 
  Globe, 
  Smartphone,
  Server,
  Palette,
  Brain,
  Zap,
  Star,
  ArrowRight,
  Plus,
  ChevronRight,
  Trophy,
  Calendar,
  Clock,
  CheckCircle,
  PlayCircle,
  BarChart3,
  Users,
  Lightbulb,
  Rocket
} from 'lucide-react';

const Skills = () => {
  const { isAuthenticated, user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSkill, setSelectedSkill] = useState(null);

  const skillCategories = [
    { id: 'all', name: 'All Skills', icon: Target },
    { id: 'frontend', name: 'Frontend', icon: Globe },
    { id: 'backend', name: 'Backend', icon: Server },
    { id: 'mobile', name: 'Mobile', icon: Smartphone },
    { id: 'database', name: 'Database', icon: Database },
    { id: 'design', name: 'Design', icon: Palette },
    { id: 'ai', name: 'AI/ML', icon: Brain },
  ];

  const skills = [
    // Frontend
    { 
      id: 1, 
      name: 'React.js', 
      category: 'frontend', 
      level: 'Advanced', 
      progress: 85, 
      color: 'from-blue-500 to-blue-600',
      icon: Code,
      learners: '12.5K',
      duration: '6 weeks',
      rating: 4.8,
      description: 'Master modern React development with hooks, context, and advanced patterns'
    },
    { 
      id: 2, 
      name: 'TypeScript', 
      category: 'frontend', 
      level: 'Intermediate', 
      progress: 65, 
      color: 'from-blue-600 to-blue-700',
      icon: Code,
      learners: '8.2K',
      duration: '4 weeks',
      rating: 4.7,
      description: 'Add type safety to your JavaScript with TypeScript fundamentals'
    },
    { 
      id: 3, 
      name: 'Tailwind CSS', 
      category: 'frontend', 
      level: 'Intermediate', 
      progress: 70, 
      color: 'from-cyan-500 to-cyan-600',
      icon: Palette,
      learners: '15.3K',
      duration: '3 weeks',
      rating: 4.9,
      description: 'Build beautiful, responsive UIs with utility-first CSS framework'
    },
    
    // Backend
    { 
      id: 4, 
      name: 'Node.js', 
      category: 'backend', 
      level: 'Advanced', 
      progress: 90, 
      color: 'from-green-500 to-green-600',
      icon: Server,
      learners: '18.7K',
      duration: '8 weeks',
      rating: 4.8,
      description: 'Build scalable server-side applications with Node.js and Express'
    },
    { 
      id: 5, 
      name: 'Python', 
      category: 'backend', 
      level: 'Advanced', 
      progress: 88, 
      color: 'from-yellow-500 to-yellow-600',
      icon: Code,
      learners: '25.1K',
      duration: '10 weeks',
      rating: 4.9,
      description: 'Master Python for web development, automation, and data science'
    },
    { 
      id: 6, 
      name: 'GraphQL', 
      category: 'backend', 
      level: 'Intermediate', 
      progress: 55, 
      color: 'from-pink-500 to-pink-600',
      icon: Database,
      learners: '6.8K',
      duration: '5 weeks',
      rating: 4.6,
      description: 'Build efficient APIs with GraphQL query language and resolvers'
    },

    // Database
    { 
      id: 7, 
      name: 'PostgreSQL', 
      category: 'database', 
      level: 'Intermediate', 
      progress: 72, 
      color: 'from-blue-700 to-blue-800',
      icon: Database,
      learners: '9.4K',
      duration: '6 weeks',
      rating: 4.7,
      description: 'Master advanced database concepts and optimization techniques'
    },
    { 
      id: 8, 
      name: 'MongoDB', 
      category: 'database', 
      level: 'Intermediate', 
      progress: 68, 
      color: 'from-green-600 to-green-700',
      icon: Database,
      learners: '11.2K',
      duration: '5 weeks',
      rating: 4.6,
      description: 'Work with NoSQL databases and document-based data modeling'
    },

    // Mobile
    { 
      id: 9, 
      name: 'React Native', 
      category: 'mobile', 
      level: 'Beginner', 
      progress: 35, 
      color: 'from-purple-500 to-purple-600',
      icon: Smartphone,
      learners: '14.6K',
      duration: '8 weeks',
      rating: 4.7,
      description: 'Build cross-platform mobile apps with React Native'
    },
    { 
      id: 10, 
      name: 'Flutter', 
      category: 'mobile', 
      level: 'Beginner', 
      progress: 25, 
      color: 'from-blue-400 to-blue-500',
      icon: Smartphone,
      learners: '12.8K',
      duration: '10 weeks',
      rating: 4.8,
      description: 'Create beautiful native mobile apps with Google\'s Flutter framework'
    },

    // AI/ML
    { 
      id: 11, 
      name: 'Machine Learning', 
      category: 'ai', 
      level: 'Beginner', 
      progress: 20, 
      color: 'from-indigo-500 to-indigo-600',
      icon: Brain,
      learners: '22.3K',
      duration: '12 weeks',
      rating: 4.9,
      description: 'Learn the fundamentals of machine learning and AI development'
    },
    { 
      id: 12, 
      name: 'TensorFlow', 
      category: 'ai', 
      level: 'Beginner', 
      progress: 15, 
      color: 'from-orange-500 to-orange-600',
      icon: Brain,
      learners: '16.7K',
      duration: '10 weeks',
      rating: 4.7,
      description: 'Build and deploy machine learning models with TensorFlow'
    }
  ];

  const achievements = [
    { name: 'Quick Learner', description: 'Completed 5 skills in 30 days', icon: Zap, earned: true },
    { name: 'Full Stack', description: 'Mastered both frontend and backend', icon: Trophy, earned: true },
    { name: 'Code Master', description: 'Reached advanced level in 3 skills', icon: Award, earned: false },
    { name: 'Team Player', description: 'Helped 50+ developers learn', icon: Users, earned: false }
  ];

  const learningPath = [
    { 
      title: 'Frontend Fundamentals', 
      skills: ['HTML/CSS', 'JavaScript', 'React.js'], 
      completed: true,
      duration: '8 weeks'
    },
    { 
      title: 'Backend Development', 
      skills: ['Node.js', 'Databases', 'APIs'], 
      completed: true,
      duration: '10 weeks'
    },
    { 
      title: 'Advanced Frontend', 
      skills: ['TypeScript', 'State Management', 'Testing'], 
      completed: false,
      duration: '6 weeks'
    },
    { 
      title: 'DevOps & Deployment', 
      skills: ['Docker', 'AWS', 'CI/CD'], 
      completed: false,
      duration: '8 weeks'
    }
  ];

  const filteredSkills = selectedCategory === 'all' 
    ? skills 
    : skills.filter(skill => skill.category === selectedCategory);

  const skillStats = {
    totalSkills: skills.length,
    completedSkills: skills.filter(s => s.progress >= 80).length,
    inProgressSkills: skills.filter(s => s.progress > 0 && s.progress < 80).length,
    averageProgress: Math.round(skills.reduce((acc, skill) => acc + skill.progress, 0) / skills.length)
  };

  return (
    <div className="skills-page">
      <div className="skills-container">
        {/* Header */}
        <div className="skills-header">
          <div className="skills-badge">
            <Rocket className="w-4 h-4 mr-2" />
            Skill Development Hub
          </div>
          <h1 className="skills-title">
            Master Your{' '}
            <span className="skills-title-accent">
              Tech Skills
            </span>
          </h1>
          <p className="skills-subtitle">
            Track your progress, discover new technologies, and advance your career with personalized learning paths
          </p>
        </div>

        {/* Stats Overview */}
        {isAuthenticated && (
          <div className="stats-overview">
            <Card variant="elevated" className="stat-overview-card">
              <div className="stat-icon-container bg-gradient-to-br from-primary-500 to-primary-600">
                <Target className="h-6 w-6 text-white" />
              </div>
              <div className="stat-number">{skillStats.totalSkills}</div>
              <div className="stat-label">Total Skills</div>
            </Card>

            <Card variant="elevated" className="stat-overview-card">
              <div className="stat-icon-container bg-gradient-to-br from-success-500 to-success-600">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
              <div className="stat-number">{skillStats.completedSkills}</div>
              <div className="stat-label">Mastered</div>
            </Card>

            <Card variant="elevated" className="stat-overview-card">
              <div className="stat-icon-container bg-gradient-to-br from-warning-500 to-warning-600">
                <PlayCircle className="h-6 w-6 text-white" />
              </div>
              <div className="stat-number">{skillStats.inProgressSkills}</div>
              <div className="stat-label">In Progress</div>
            </Card>

            <Card variant="elevated" className="stat-overview-card">
              <div className="stat-icon-container bg-gradient-to-br from-purple-500 to-purple-600">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div className="stat-number">{skillStats.averageProgress}%</div>
              <div className="stat-label">Avg Progress</div>
            </Card>
          </div>
        )}

        <div className="skills-content">
          {/* Sidebar */}
          <div className="skills-sidebar">
            {/* Category Filter */}
            <Card variant="elevated" className="category-filter">
              <h3 className="filter-title">Categories</h3>
              <div className="category-list">
                {skillCategories.map(({ id, name, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setSelectedCategory(id)}
                    className={`category-item ${
                      selectedCategory === id ? 'active' : ''
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* Learning Path */}
            {isAuthenticated && (
              <Card variant="elevated" className="learning-path-card">
                <h3 className="learning-path-heading">Learning Path</h3>
                <div className="learning-path-list">
                  {learningPath.map((path, index) => (
                    <div key={index} className="relative">
                      <div className={`learning-path-item ${path.completed ? 'completed' : ''}`}>
                        <div className={`learning-path-status ${path.completed ? 'completed' : 'pending'}`}>
                          {path.completed ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </div>
                        <div className="learning-path-content">
                          <h4 className="learning-path-title">{path.title}</h4>
                          <p className="learning-path-meta">{path.duration} • {path.skills.join(', ')}</p>
                        </div>
                      </div>
                      {index < learningPath.length - 1 && (
                        <div className="learning-path-connector"></div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Achievements */}
            {isAuthenticated && (
              <Card variant="elevated" className="achievements-card">
                <h3 className="achievements-heading">Achievements</h3>
                <div className="achievements-list">
                  {achievements.map((achievement, index) => (
                    <div key={index} className={`achievement-item ${achievement.earned ? 'earned' : 'locked'}`}>
                      <div className="achievement-icon">
                        <achievement.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="achievement-name">{achievement.name}</p>
                        <p className="achievement-desc">{achievement.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Skills Grid */}
            <div className="skills-grid">
              {filteredSkills.map((skill) => (
                <Card 
                  key={skill.id} 
                  variant="elevated" 
                  hover 
                  className="skill-card"
                  onClick={() => setSelectedSkill(skill)}
                >
                  <div className="skill-header">
                    <div className="skill-info">
                      <div className={`skill-icon-container bg-gradient-to-br ${skill.color}`}>
                        <skill.icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="skill-details">
                        <h3 className="skill-name">
                          {skill.name}
                        </h3>
                        <p className="skill-level">
                          {skill.level} Level
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="skill-arrow" />
                  </div>

                  <p className="skill-description">
                    {skill.description}
                  </p>

                  {/* Progress Bar */}
                  <div className="skill-progress">
                    <div className="progress-header">
                      <span className="progress-label">Progress</span>
                      <span className="progress-value">{skill.progress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div 
                        className={`progress-fill bg-gradient-to-r ${skill.color}`}
                        style={{ width: `${skill.progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="skill-stats">
                    <div className="skill-stats-left">
                      <div className="skill-stat">
                        <Users className="h-4 w-4" />
                        <span>{skill.learners}</span>
                      </div>
                      <div className="skill-stat">
                        <Clock className="h-4 w-4" />
                        <span>{skill.duration}</span>
                      </div>
                    </div>
                    <div className="skill-rating">
                      <Star className="rating-star" />
                      <span className="rating-number">{skill.rating}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Call to Action */}
            {!isAuthenticated && (
              <Card variant="gradient" className="cta-card">
                <div className="max-w-2xl mx-auto">
                  <div className="cta-icon-container">
                    <Lightbulb className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="cta-title">
                    Ready to accelerate your learning?
                  </h3>
                  <p className="cta-text">
                    Join DevHub+ to track your progress, get personalized recommendations, and connect with a community of learners.
                  </p>
                  <div className="cta-actions">
                    <button className="cta-button-primary">
                      <Plus className="mr-2 h-5 w-5" />
                      Start Learning Today
                    </button>
                    <button className="cta-button-secondary">
                      Explore Skills
                      <ChevronRight className="ml-2 h-5 w-5" />
                    </button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Skills;