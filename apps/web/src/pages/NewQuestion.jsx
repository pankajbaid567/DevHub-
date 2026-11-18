import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import api from '../services/api';
import { ArrowLeft, Plus, X, HelpCircle, Tag, Type, FileText } from 'lucide-react';

const NewQuestion = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    tags: []
  });
  const [currentTag, setCurrentTag] = useState('');
  const [errors, setErrors] = useState({});

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
    } else if (formData.title.length < 10) {
      newErrors.title = 'Title must be at least 10 characters long';
    }

    if (!formData.body.trim()) {
      newErrors.body = 'Question body is required';
    } else if (formData.body.length < 30) {
      newErrors.body = 'Question body must be at least 30 characters long';
    }

    if (formData.tags.length === 0) {
      newErrors.tags = 'At least one tag is required';
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
      const response = await api.post('/questions', {
        title: formData.title.trim(),
        body: formData.body.trim(),
        tags: formData.tags
      });

      // Navigate to the new question or questions list
      navigate('/questions', { 
        state: { message: 'Question posted successfully!' }
      });
    } catch (error) {
      console.error('Failed to create question:', error);
      setErrors({
        submit: error.response?.data?.error || 'Failed to create question. Please try again.'
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
            onClick={() => navigate('/questions')}
            className="inline-flex items-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Questions
          </button>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Ask a Question</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2">
            Get help from the developer community
          </p>
        </div>

        {/* Tips Card */}
        <Card className="p-6 mb-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-start">
            <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Writing a good question
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Make your title specific and searchable</li>
                <li>• Provide context and what you've tried</li>
                <li>• Include relevant code snippets</li>
                <li>• Use appropriate tags to categorize your question</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Question Form */}
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
                placeholder="e.g., How to optimize React state updates for better performance?"
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

            {/* Body */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <FileText className="h-4 w-4 mr-2" />
                Question Details
              </label>
              <textarea
                name="body"
                value={formData.body}
                onChange={handleInputChange}
                rows={8}
                placeholder="Describe your problem in detail. Include what you've tried, expected behavior, and any error messages..."
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white resize-none ${
                  errors.body 
                    ? 'border-red-300 dark:border-red-600' 
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              />
              <div className="flex justify-between mt-1">
                {errors.body ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.body}</p>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Minimum 30 characters required
                  </p>
                )}
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {formData.body.length} characters
                </p>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Tag className="h-4 w-4 mr-2" />
                Tags
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
                  placeholder="Add a tag (e.g., react, javascript, nodejs)"
                  disabled={formData.tags.length >= 5}
                  className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white ${
                    errors.tags 
                      ? 'border-red-300 dark:border-red-600' 
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
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
              
              <div className="flex justify-between mt-1">
                {errors.tags ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.tags}</p>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Add up to 5 tags to categorize your question
                  </p>
                )}
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {formData.tags.length}/5 tags
                </p>
              </div>
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
                onClick={() => navigate('/questions')}
                className="px-6 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Posting...' : 'Post Question'}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default NewQuestion;