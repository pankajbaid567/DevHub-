import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import { Code, Plus, Search, Filter, Star, Copy, Eye, User, Clock, ChevronDown, ChevronUp, Check } from 'lucide-react';

const Snippets = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [expandedSnippets, setExpandedSnippets] = useState(new Set());
  const [copiedSnippets, setCopiedSnippets] = useState(new Set());

  const snippets = [
    {
      id: 1,
      title: 'Custom React Hook for API calls',
      description: 'A reusable hook for handling API requests with loading states and error handling',
      language: 'javascript',
      author: 'react_dev',
      stars: 24,
      views: 156,
      code: `import { useState, useEffect } from 'react';

const useApi = (url) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);

  return { data, loading, error };
};`,
      tags: ['react', 'hooks', 'api'],
      createdAt: '2 days ago'
    },
    {
      id: 2,
      title: 'Python decorator for timing functions',
      description: 'Simple decorator to measure function execution time',
      language: 'python',
      author: 'python_guru',
      stars: 18,
      views: 89,
      code: `import time
from functools import wraps

def timer(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f'{func.__name__} took {end - start:.4f} seconds')
        return result
    return wrapper

@timer
def slow_function():
    time.sleep(1)
    return 'Done!'`,
      tags: ['python', 'decorator', 'performance'],
      createdAt: '1 week ago'
    },
    {
      id: 3,
      title: 'CSS Grid responsive layout',
      description: 'Flexible grid layout that adapts to different screen sizes',
      language: 'css',
      author: 'css_master',
      stars: 31,
      views: 203,
      code: `.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  padding: 1rem;
}

.grid-item {
  background: #f0f0f0;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

@media (max-width: 768px) {
  .grid-container {
    grid-template-columns: 1fr;
  }
}`,
      tags: ['css', 'grid', 'responsive'],
      createdAt: '3 days ago'
    }
  ];

  const languages = ['all', 'javascript', 'python', 'css', 'typescript', 'java', 'go'];

  const filteredSnippets = snippets.filter(snippet => {
    const matchesSearch = snippet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         snippet.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLanguage = selectedLanguage === 'all' || snippet.language === selectedLanguage;
    return matchesSearch && matchesLanguage;
  });

  const copyToClipboard = async (code, snippetId) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedSnippets(prev => new Set([...prev, snippetId]));
      // Remove the copied state after 2 seconds
      setTimeout(() => {
        setCopiedSnippets(prev => {
          const newSet = new Set(prev);
          newSet.delete(snippetId);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const toggleExpand = (snippetId) => {
    setExpandedSnippets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(snippetId)) {
        newSet.delete(snippetId);
      } else {
        newSet.add(snippetId);
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Code Snippets</h1>
            <p className="text-slate-600 dark:text-slate-300 mt-2">
              Discover and share useful code snippets
            </p>
          </div>
          <Link
            to="/snippets/new"
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Share Snippet
          </Link>
        </div>

        {/* Search and Filters */}
        <Card className="p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search snippets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white capitalize"
            >
              {languages.map(lang => (
                <option key={lang} value={lang} className="capitalize">
                  {lang === 'all' ? 'All Languages' : lang}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Snippets Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSnippets.map((snippet) => (
            <Card key={snippet.id} className="p-6 flex flex-col h-full">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <Link
                    to={`/snippets/${snippet.id}`}
                    className="font-semibold text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors mb-1 block"
                  >
                    {snippet.title}
                  </Link>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                    {snippet.description}
                  </p>
                </div>
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-300 capitalize">
                  {snippet.language}
                </span>
              </div>

              {/* Code Preview */}
              <div className="relative mb-4 flex-1">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-200 dark:bg-slate-700 border-b border-slate-300 dark:border-slate-600">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 capitalize">
                      {snippet.language}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(snippet.code, snippet.id)}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-600 rounded transition-colors"
                        title={copiedSnippets.has(snippet.id) ? "Copied!" : "Copy to clipboard"}
                      >
                        {copiedSnippets.has(snippet.id) ? (
                          <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                        ) : (
                          <Copy className="h-3 w-3 text-slate-600 dark:text-slate-300" />
                        )}
                      </button>
                      <button
                        onClick={() => toggleExpand(snippet.id)}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-600 rounded transition-colors"
                        title={expandedSnippets.has(snippet.id) ? "Collapse" : "Expand"}
                      >
                        {expandedSnippets.has(snippet.id) ? (
                          <ChevronUp className="h-3 w-3 text-slate-600 dark:text-slate-300" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-slate-600 dark:text-slate-300" />
                        )}
                      </button>
                    </div>
                  </div>
                  <pre className={`p-3 text-xs overflow-x-auto text-slate-800 dark:text-slate-200 ${expandedSnippets.has(snippet.id) ? '' : 'max-h-32'}`}>
                    <code>
                      {expandedSnippets.has(snippet.id) 
                        ? snippet.code 
                        : `${snippet.code.substring(0, 200)}${snippet.code.length > 200 ? '...' : ''}`
                      }
                    </code>
                  </pre>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-4">
                {snippet.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4" />
                    <span>{snippet.stars}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    <span>{snippet.views}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>{snippet.author}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Load More */}
        <div className="text-center mt-8">
          <button className="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            Load More Snippets
          </button>
        </div>
      </div>
    </div>
  );
};

export default Snippets;