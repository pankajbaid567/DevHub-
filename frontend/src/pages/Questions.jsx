import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import { HelpCircle, Plus, Search, Filter, TrendingUp, Clock, MessageCircle, User } from 'lucide-react';

const Questions = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  const questions = [
    {
      id: 1,
      title: 'How to optimize React state updates for better performance?',
      content: 'I have a React app with complex state management and I\'m experiencing performance issues...',
      author: 'john_dev',
      votes: 15,
      answers: 3,
      views: 234,
      tags: ['react', 'performance', 'state'],
      createdAt: '2 hours ago',
      hasAcceptedAnswer: true
    },
    {
      id: 2,
      title: 'Best practices for API error handling in Node.js?',
      content: 'What are the recommended patterns for handling errors in Express.js applications...',
      author: 'api_master',
      votes: 8,
      answers: 1,
      views: 156,
      tags: ['nodejs', 'express', 'error-handling'],
      createdAt: '4 hours ago',
      hasAcceptedAnswer: false
    },
    {
      id: 3,
      title: 'TypeScript generic constraints with utility types',
      content: 'I\'m trying to create a generic function that works with specific object shapes...',
      author: 'ts_ninja',
      votes: 12,
      answers: 2,
      views: 189,
      tags: ['typescript', 'generics', 'types'],
      createdAt: '1 day ago',
      hasAcceptedAnswer: false
    }
  ];

  const filteredQuestions = questions.filter(q => 
    q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Questions</h1>
            <p className="text-slate-600 dark:text-slate-300 mt-2">
              Get help from the developer community
            </p>
          </div>
          <Link
            to="/questions/new"
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Ask Question
          </Link>
        </div>

        {/* Search and Filters */}
        <Card className="p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search questions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white"
              >
                <option value="all">All Questions</option>
                <option value="unanswered">Unanswered</option>
                <option value="trending">Trending</option>
                <option value="recent">Recent</option>
              </select>
              <button className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <Filter className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>
        </Card>

        {/* Questions List */}
        <div className="space-y-4">
          {filteredQuestions.map((question) => (
            <Card key={question.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Link
                      to={`/questions/${question.id}`}
                      className="text-lg font-semibold text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      {question.title}
                    </Link>
                    {question.hasAcceptedAnswer && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">
                        Solved
                      </span>
                    )}
                  </div>
                  
                  <p className="text-slate-600 dark:text-slate-300 mb-3 line-clamp-2">
                    {question.content}
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mb-3">
                    {question.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        <span>{question.votes} votes</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-4 w-4" />
                        <span>{question.answers} answers</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>{question.views} views</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>{question.author}</span>
                      <span>•</span>
                      <Clock className="h-4 w-4" />
                      <span>{question.createdAt}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Load More */}
        <div className="text-center mt-8">
          <button className="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            Load More Questions
          </button>
        </div>
      </div>
    </div>
  );
};

export default Questions;