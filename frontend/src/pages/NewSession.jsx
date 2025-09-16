import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import api from '../services/api';
import { 
  ArrowLeft, 
  Video, 
  Users, 
  Clock, 
  Globe, 
  Lock, 
  Code, 
  Calendar,
  Mic,
  Camera,
  Monitor,
  BookOpen
} from 'lucide-react';

const NewSession = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    language: 'javascript',
    sessionType: 'live-coding',
    privacy: 'public',
    maxParticipants: 20,
    scheduledFor: '',
    duration: 60,
    tags: []
  });
  const [currentTag, setCurrentTag] = useState('');
  const [errors, setErrors] = useState({});

  const sessionTypes = [
    { value: 'live-coding', label: 'Live Coding', icon: Code, description: 'Code together in real-time' },
    { value: 'tutorial', label: 'Tutorial', icon: BookOpen, description: 'Educational session with screen sharing' },
    { value: 'workshop', label: 'Workshop', icon: Users, description: 'Interactive learning session' },
    { value: 'code-review', label: 'Code Review', icon: Video, description: 'Review and discuss code' }
  ];

  const languages = [
    'javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'csharp',
    'php', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'dart', 'scala',
    'html', 'css', 'sql', 'other'
  ];

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) : value
    }));
    
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

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Session title is required';
    } else if (formData.title.length < 5) {
      newErrors.title = 'Title must be at least 5 characters long';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length < 20) {
      newErrors.description = 'Description must be at least 20 characters long';
    }

    if (formData.maxParticipants < 2 || formData.maxParticipants > 100) {
      newErrors.maxParticipants = 'Participants must be between 2 and 100';
    }

    if (formData.duration < 15 || formData.duration > 480) {
      newErrors.duration = 'Duration must be between 15 minutes and 8 hours';
    }

    if (formData.scheduledFor) {
      const scheduledDate = new Date(formData.scheduledFor);
      const now = new Date();
      if (scheduledDate <= now) {
        newErrors.scheduledFor = 'Scheduled time must be in the future';
      }
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
      const sessionData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        language: formData.language,
        sessionType: formData.sessionType,
        privacy: formData.privacy,
        maxParticipants: formData.maxParticipants,
        duration: formData.duration,
        tags: formData.tags,
        scheduledFor: formData.scheduledFor || null
      };

      const response = await api.post('/sessions', sessionData);
      
      // Navigate to the new session or sessions list
      navigate('/sessions', { 
        state: { message: 'Session created successfully!' }
      });
    } catch (error) {
      console.error('Failed to create session:', error);
      setErrors({
        submit: error.response?.data?.error || 'Failed to create session. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const startInstantSession = async () => {
    if (!formData.title.trim()) {
      setErrors({ title: 'Session title is required for instant session' });
      return;
    }

    setIsSubmitting(true);

    try {
      const sessionData = {
        title: formData.title.trim(),
        description: formData.description.trim() || 'Instant coding session',
        language: formData.language,
        sessionType: formData.sessionType,
        privacy: formData.privacy,
        maxParticipants: formData.maxParticipants,
        duration: formData.duration,
        tags: formData.tags,
        startNow: true
      };

      const response = await api.post('/sessions', sessionData);
      
      // Navigate directly to the session room
      navigate(`/sessions/${response.data.session.id}`, {
        state: { isHost: true }
      });
    } catch (error) {
      console.error('Failed to start instant session:', error);
      setErrors({
        submit: error.response?.data?.error || 'Failed to start session. Please try again.'
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
            onClick={() => navigate('/sessions')}
            className="inline-flex items-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Sessions
          </button>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Start a New Session</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2">
            Create a collaborative coding session with video conferencing
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Session Details
                  </h3>
                  
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Session Title *
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      placeholder="e.g., Building a React Chat App"
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
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Description *
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder="Describe what you'll be teaching or working on..."
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

                  {/* Session Type */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                      Session Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {sessionTypes.map((type) => {
                        const Icon = type.icon;
                        return (
                          <label
                            key={type.value}
                            className={`relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
                              formData.sessionType === type.value
                                ? 'border-primary-600 ring-2 ring-primary-600 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <input
                              type="radio"
                              name="sessionType"
                              value={type.value}
                              checked={formData.sessionType === type.value}
                              onChange={handleInputChange}
                              className="sr-only"
                            />
                            <div className="flex items-start">
                              <Icon className="h-5 w-5 text-primary-600 dark:text-primary-400 mr-3 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="text-sm font-medium text-slate-900 dark:text-white">
                                  {type.label}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {type.description}
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Language and Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Primary Language
                      </label>
                      <select
                        name="language"
                        value={formData.language}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white capitalize"
                      >
                        {languages.map(lang => (
                          <option key={lang} value={lang} className="capitalize">
                            {lang === 'other' ? 'Other' : lang}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Privacy
                      </label>
                      <select
                        name="privacy"
                        value={formData.privacy}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                      </select>
                    </div>
                  </div>

                  {/* Participants and Duration */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Max Participants
                      </label>
                      <input
                        type="number"
                        name="maxParticipants"
                        value={formData.maxParticipants}
                        onChange={handleInputChange}
                        min="2"
                        max="100"
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white ${
                          errors.maxParticipants 
                            ? 'border-red-300 dark:border-red-600' 
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      />
                      {errors.maxParticipants && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.maxParticipants}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Duration (minutes)
                      </label>
                      <input
                        type="number"
                        name="duration"
                        value={formData.duration}
                        onChange={handleInputChange}
                        min="15"
                        max="480"
                        step="15"
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white ${
                          errors.duration 
                            ? 'border-red-300 dark:border-red-600' 
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      />
                      {errors.duration && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.duration}</p>
                      )}
                    </div>
                  </div>

                  {/* Schedule (Optional) */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Schedule For Later (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      name="scheduledFor"
                      value={formData.scheduledFor}
                      onChange={handleInputChange}
                      min={new Date().toISOString().slice(0, 16)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white ${
                        errors.scheduledFor 
                          ? 'border-red-300 dark:border-red-600' 
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    />
                    {errors.scheduledFor && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.scheduledFor}</p>
                    )}
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Leave empty to start immediately
                    </p>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Tags (Optional)
                    </label>
                    
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
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={currentTag}
                        onChange={(e) => setCurrentTag(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddTag(e)}
                        placeholder="Add a tag"
                        disabled={formData.tags.length >= 5}
                        className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        disabled={!currentTag.trim() || formData.tags.length >= 5}
                        className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Submit Error */}
                {errors.submit && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">{errors.submit}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    type="button"
                    onClick={startInstantSession}
                    disabled={isSubmitting}
                    className="flex-1 flex items-center justify-center px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Video className="h-5 w-5 mr-2" />
                    {isSubmitting ? 'Starting...' : 'Start Now'}
                  </button>
                  
                  {formData.scheduledFor && (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 flex items-center justify-center px-6 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Calendar className="h-5 w-5 mr-2" />
                      {isSubmitting ? 'Scheduling...' : 'Schedule Session'}
                    </button>
                  )}
                </div>
              </form>
            </Card>
          </div>

          {/* Preview/Tips Sidebar */}
          <div className="space-y-6">
            {/* Session Preview */}
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                Session Preview
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center text-slate-600 dark:text-slate-400">
                  <Users className="h-4 w-4 mr-2" />
                  Up to {formData.maxParticipants} participants
                </div>
                <div className="flex items-center text-slate-600 dark:text-slate-400">
                  <Clock className="h-4 w-4 mr-2" />
                  {formData.duration} minutes duration
                </div>
                <div className="flex items-center text-slate-600 dark:text-slate-400">
                  {formData.privacy === 'public' ? (
                    <Globe className="h-4 w-4 mr-2" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}
                  {formData.privacy === 'public' ? 'Public session' : 'Private session'}
                </div>
                <div className="flex items-center text-slate-600 dark:text-slate-400">
                  <Code className="h-4 w-4 mr-2" />
                  {formData.language} session
                </div>
              </div>
            </Card>

            {/* Features */}
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                Session Features
              </h3>
              <div className="space-y-3">
                <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                  <Video className="h-4 w-4 mr-3 text-green-600" />
                  HD Video Conferencing
                </div>
                <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                  <Mic className="h-4 w-4 mr-3 text-green-600" />
                  Crystal Clear Audio
                </div>
                <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                  <Monitor className="h-4 w-4 mr-3 text-green-600" />
                  Screen Sharing
                </div>
                <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                  <Code className="h-4 w-4 mr-3 text-green-600" />
                  Real-time Code Editor
                </div>
                <div className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                  <Users className="h-4 w-4 mr-3 text-green-600" />
                  Live Chat
                </div>
              </div>
            </Card>

            {/* Tips */}
            <Card className="p-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
                Tips for Great Sessions
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                <li>• Test your camera and microphone beforehand</li>
                <li>• Use a descriptive title and detailed description</li>
                <li>• Prepare your code examples in advance</li>
                <li>• Interact with participants through chat</li>
                <li>• Keep sessions focused and well-paced</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewSession;