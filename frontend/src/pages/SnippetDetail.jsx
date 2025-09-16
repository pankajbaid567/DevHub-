import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Card from '../components/Card';
import api from '../services/api';
import { 
  ArrowLeft, 
  Copy, 
  Star, 
  Eye, 
  User, 
  Clock, 
  Check,
  Download
} from 'lucide-react';

const SnippetDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [snippet, setSnippet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSnippet();
  }, [id]);

  const fetchSnippet = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/snippets/${id}`);
      setSnippet(response.data.snippet);
    } catch (error) {
      console.error('Failed to fetch snippet:', error);
      setError('Failed to load snippet');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const downloadSnippet = () => {
    if (!snippet) return;
    
    const element = document.createElement('a');
    const file = new Blob([snippet.code], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${snippet.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${getFileExtension(snippet.language)}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getFileExtension = (language) => {
    const extensions = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      csharp: 'cs',
      php: 'php',
      ruby: 'rb',
      go: 'go',
      rust: 'rs',
      swift: 'swift',
      kotlin: 'kt',
      dart: 'dart',
      scala: 'scala',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      sql: 'sql',
      bash: 'sh',
      powershell: 'ps1',
      json: 'json',
      xml: 'xml',
      yaml: 'yml',
      markdown: 'md',
      dockerfile: 'dockerfile'
    };
    return extensions[language] || 'txt';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
            <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
            <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !snippet) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Snippet Not Found
            </h2>
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              {error || 'The snippet you\'re looking for doesn\'t exist.'}
            </p>
            <Link
              to="/snippets"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Snippets
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/snippets')}
            className="inline-flex items-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Snippets
          </button>
        </div>

        {/* Snippet */}
        <Card className="p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {snippet.title}
              </h1>
              {snippet.description && (
                <p className="text-slate-600 dark:text-slate-300 mb-4">
                  {snippet.description}
                </p>
              )}
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-300 capitalize flex-shrink-0">
              {snippet.language}
            </span>
          </div>

          {/* Tags */}
          {snippet.tags && snippet.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {snippet.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Code Block */}
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden mb-6">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-200 dark:bg-slate-700 border-b border-slate-300 dark:border-slate-600">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400 capitalize">
                {snippet.language}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(snippet.code)}
                  className="inline-flex items-center px-3 py-1 text-sm bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors"
                  title={copied ? "Copied!" : "Copy to clipboard"}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1 text-green-600 dark:text-green-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={downloadSnippet}
                  className="inline-flex items-center px-3 py-1 text-sm bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors"
                  title="Download as file"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <pre className="p-4 text-sm text-slate-800 dark:text-slate-200">
                <code>{snippet.code}</code>
              </pre>
            </div>
          </div>

          {/* Snippet Stats */}
          <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4" />
                <span>{snippet.stars || 0} stars</span>
              </div>
              <div className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                <span>{snippet.views || 0} views</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{snippet.user?.username}</span>
              <span>•</span>
              <Clock className="h-4 w-4" />
              <span>{new Date(snippet.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SnippetDetail;