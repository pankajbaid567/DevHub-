import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import api from '../services/api';
import { 
  ArrowLeft, 
  TrendingUp, 
  MessageCircle, 
  User, 
  Clock, 
  CheckCircle2,
  Edit,
  Reply
} from 'lucide-react';

const QuestionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);

  useEffect(() => {
    fetchQuestion();
  }, [id]);

  const fetchQuestion = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/questions/${id}`);
      setQuestion(response.data.question);
    } catch (error) {
      console.error('Failed to fetch question:', error);
      setError('Failed to load question');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSubmit = async (e) => {
    e.preventDefault();
    if (!answerText.trim()) return;

    setIsSubmittingAnswer(true);
    try {
      await api.post('/answers', {
        body: answerText.trim(),
        questionId: parseInt(id)
      });
      setAnswerText('');
      // Refresh question to show new answer
      await fetchQuestion();
    } catch (error) {
      console.error('Failed to submit answer:', error);
      setError('Failed to submit answer');
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
            <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
            <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Question Not Found
            </h2>
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              {error || 'The question you\'re looking for doesn\'t exist.'}
            </p>
            <Link
              to="/questions"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Questions
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
            onClick={() => navigate('/questions')}
            className="inline-flex items-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Questions
          </button>
        </div>

        {/* Question */}
        <Card className="p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white pr-4">
              {question.title}
            </h1>
            {question.hasAcceptedAnswer && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 flex-shrink-0">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Solved
              </span>
            )}
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none mb-6">
            <div className="whitespace-pre-wrap">{question.body}</div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {question.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Question Stats */}
          <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                <span>{question.votes || 0} votes</span>
              </div>
              <div className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4" />
                <span>{question.answers?.length || 0} answers</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{question.user?.username}</span>
              <span>•</span>
              <Clock className="h-4 w-4" />
              <span>{new Date(question.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </Card>

        {/* Answers */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
            {question.answers?.length ? `${question.answers.length} Answer${question.answers.length > 1 ? 's' : ''}` : 'No Answers Yet'}
          </h2>
          
          {question.answers?.map((answer) => (
            <Card key={answer.id} className="p-6 mb-4">
              <div className="prose prose-slate dark:prose-invert max-w-none mb-4">
                <div className="whitespace-pre-wrap">{answer.body}</div>
              </div>
              
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    <span>{answer.votes || 0} votes</span>
                  </div>
                  {answer.isAccepted && (
                    <span className="inline-flex items-center text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Accepted
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>{answer.user?.username}</span>
                  <span>•</span>
                  <Clock className="h-4 w-4" />
                  <span>{new Date(answer.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Answer Form */}
        {user && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Your Answer
            </h3>
            <form onSubmit={handleAnswerSubmit}>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Write your answer here..."
                rows={6}
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-slate-800 dark:text-white resize-none"
                required
              />
              <div className="flex justify-end mt-4">
                <button
                  type="submit"
                  disabled={isSubmittingAnswer || !answerText.trim()}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmittingAnswer ? 'Posting...' : 'Post Answer'}
                </button>
              </div>
            </form>
          </Card>
        )}

        {!user && (
          <Card className="p-6 text-center">
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              You need to be signed in to post an answer.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Sign In
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
};

export default QuestionDetail;