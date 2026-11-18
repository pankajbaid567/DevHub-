import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import api from '../services/api';
import { ArrowLeft, Code, Type, FileText, Tag, Plus, X } from 'lucide-react';

const NewSnippet = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    code: '',
    language: 'javascript',
    tags: []
  });
  const [currentTag, setCurrentTag] = useState('');
  const [errors, setErrors] = useState({});

  const languages = [
    'javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'csharp',
    'php', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'dart', 'scala',
    'html', 'css', 'scss', 'sass', 'sql', 'bash', 'powershell',
    'json', 'xml', 'yaml', 'markdown', 'dockerfile', 'other'
  ];

  const handleInputChange = (e) => {
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

  const handleAddTag = (e) => {
    e.preventDefault();
    if (currentTag.trim() && !formData.tags.includes(currentTag.trim().toLowerCase())) {
      if (formData.tags.length < 5) {
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, currentTag.trim().toLowerCase()]
        }));
        setCurrentTag('');
      }
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddTag(e);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.length < 5) {
      newErrors.title = 'Title must be at least 5 characters long';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters long';
    }

    if (!formData.code.trim()) {
      newErrors.code = 'Code is required';
    } else if (formData.code.length < 10) {
      newErrors.code = 'Code must be at least 10 characters long';
    }

    if (!formData.language) {
      newErrors.language = 'Language is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.post('/snippets', {
        title: formData.title.trim(),
        description: formData.description.trim(),
        code: formData.code.trim(),
        language: formData.language,
        tags: formData.tags
      });

      // Navigate to snippets list
      navigate('/snippets', { 
        state: { message: 'Snippet shared successfully!' }
      });
    } catch (error) {
      console.error('Failed to create snippet:', error);
      setErrors({
        submit: error.response?.data?.error || 'Failed to create snippet. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/snippets')}
            className="inline-flex items-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Snippets
          </button>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Share a Code Snippet</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2">
            Share useful code snippets with the community
          </p>
        </div>

        {/* Tips Card */}
        <Card className="p-6 mb-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-start">
            <Code className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Sharing a good snippet
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Use a clear, descriptive title</li>
                <li>• Provide context about what the code does</li>
                <li>• Include comments in your code where helpful</li>
                <li>• Use appropriate tags for discoverability</li>
                <li>• Make sure your code is well-formatted</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Snippet Form */}
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Type className="h-4 w-4 mr-2" />
                Title
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="e.g., Custom React Hook for API calls"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white ${
                  errors.title 
                    ? 'border-red-300 dark:border-red-600' 
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.title}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <FileText className="h-4 w-4 mr-2" />
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                placeholder="Describe what this code snippet does and how to use it..."
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white resize-none ${
                  errors.description 
                    ? 'border-red-300 dark:border-red-600' 
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description}</p>
              )}
            </div>

            {/* Language */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Code className="h-4 w-4 mr-2" />
                Language
              </label>
              <select
                name="language"
                value={formData.language}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white capitalize ${
                  errors.language 
                    ? 'border-red-300 dark:border-red-600' 
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {languages.map(lang => (
                  <option key={lang} value={lang} className="capitalize">
                    {lang === 'other' ? 'Other' : lang}
                  </option>
                ))}
              </select>
              {errors.language && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.language}</p>
              )}
            </div>

            {/* Code */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Code className="h-4 w-4 mr-2" />
                Code
              </label>
              <textarea
                name="code"
                value={formData.code}
                onChange={handleInputChange}
                rows={12}
                placeholder="Paste your code here..."
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white font-mono text-sm resize-none ${
                  errors.code 
                    ? 'border-red-300 dark:border-red-600' 
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              />
              <div className="flex justify-between mt-1">
                {errors.code ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.code}</p>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Minimum 10 characters required
                  </p>
                )}
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {formData.code.length} characters
                </p>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Tag className="h-4 w-4 mr-2" />
                Tags (Optional)
              </label>
              
              {/* Current Tags */}
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-300"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-2 text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add Tag Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentTag}
                  onChange={(e) => setCurrentTag(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Add a tag (e.g., react, hooks, utility)"
                  disabled={formData.tags.length >= 5}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  disabled={!currentTag.trim() || formData.tags.length >= 5}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Add up to 5 tags to help others discover your snippet ({formData.tags.length}/5)
              </p>
            </div>

            {/* Submit Error */}
            {errors.submit && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">{errors.submit}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => navigate('/snippets')}
                className="px-6 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Sharing...' : 'Share Snippet'}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default NewSnippet;