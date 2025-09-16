import React, { useState } from 'react';
import Card from '../components/Card';
import ChatBox from '../components/ChatBox';
import { BookOpen, Code, Brain, Lightbulb, Target, Zap, Send, Loader2 } from 'lucide-react';
import { mentorAPI } from '../services/api';

const Mentor = () => {
  const [selectedTopic, setSelectedTopic] = useState('general');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversation, setConversation] = useState([
    {
      id: 1,
      type: 'ai',
      content: "Hello! I'm your AI mentor. I'm here to help you with coding questions, career advice, code reviews, and learning guidance. What would you like to work on today?",
      timestamp: new Date()
    }
  ]);

  const topics = [
    {
      id: 'general',
      name: 'General Questions',
      icon: BookOpen,
      description: 'Ask any programming or career question',
      color: 'bg-blue-500'
    },
    {
      id: 'code-review',
      name: 'Code Review',
      icon: Code,
      description: 'Get feedback on your code',
      color: 'bg-green-500'
    },
    {
      id: 'debugging',
      name: 'Debugging Help',
      icon: Brain,
      description: 'Help fixing bugs and issues',
      color: 'bg-red-500'
    },
    {
      id: 'learning',
      name: 'Learning Path',
      icon: Target,
      description: 'Get personalized learning recommendations',
      color: 'bg-purple-500'
    },
    {
      id: 'career',
      name: 'Career Advice',
      icon: Lightbulb,
      description: 'Career guidance and tips',
      color: 'bg-orange-500'
    },
    {
      id: 'optimization',
      name: 'Code Optimization',
      icon: Zap,
      description: 'Improve performance and best practices',
      color: 'bg-indigo-500'
    }
  ];

    const handleSubmit = async () => {
    if (!question.trim() && !codeSnippet.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: question,
      code: codeSnippet || null,
      topic: selectedTopic,
      timestamp: new Date()
    };

    setConversation(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    const currentQuestion = question;
    const currentCode = codeSnippet;
    
    setQuestion('');
    setCodeSnippet('');

    try {
      // Call the real AI mentor API
      const response = await mentorAPI.chat({
        topic: selectedTopic,
        question: currentQuestion,
        code: currentCode || null,
        context: null
      });

      const aiResponse = {
        id: Date.now() + 1,
        type: 'ai',
        content: response.data.response,
        timestamp: new Date(response.data.timestamp),
        modelUsed: response.data.modelUsed,
        fallbackUsed: response.data.fallbackUsed
      };
      
      setConversation(prev => [...prev, aiResponse]);
      setIsLoading(false);
    } catch (error) {
      console.error('Error getting AI response:', error);
      
      // Fallback response in case of API error
      const fallbackResponse = {
        id: Date.now() + 1,
        type: 'ai',
        content: generateFallbackResponse(selectedTopic, currentQuestion, currentCode),
        timestamp: new Date(),
        modelUsed: 'fallback',
        fallbackUsed: true
      };
      
      setConversation(prev => [...prev, fallbackResponse]);
      setIsLoading(false);
    }
  };

  const generateFallbackResponse = (topic, question, code) => {
    const responses = {
      general: "Based on your question, here's what I recommend: First, make sure you understand the fundamentals. Then, practice with small projects. Don't forget to read documentation and join developer communities for support.",
      'code-review': code 
        ? "Looking at your code, I notice a few areas for improvement:\n\n1. Consider using more descriptive variable names\n2. Add error handling for edge cases\n3. Break down complex functions into smaller, reusable pieces\n4. Add comments for complex logic\n\nOverall, your code structure is good! These improvements will make it more maintainable."
        : "I'd be happy to review your code! Please share the code snippet you'd like me to look at, and I'll provide detailed feedback on structure, best practices, and potential improvements.",
      debugging: "For debugging this issue, try these steps:\n\n1. Check the browser console for error messages\n2. Use console.log() to trace variable values\n3. Verify your data types and API responses\n4. Test with simplified test cases\n5. Use browser developer tools to inspect network requests\n\nIf you share the specific error message, I can provide more targeted help!",
      learning: "Here's a personalized learning path based on your interests:\n\n**Phase 1 (Weeks 1-4):**\n- Master JavaScript fundamentals\n- Learn DOM manipulation\n- Practice with small projects\n\n**Phase 2 (Weeks 5-8):**\n- Dive into React.js\n- Learn component lifecycle\n- Build a portfolio project\n\n**Phase 3 (Weeks 9-12):**\n- Backend development with Node.js\n- Database integration\n- Deploy your projects\n\nWould you like me to elaborate on any phase?",
      career: "For career advancement in tech, focus on:\n\n**Technical Skills:**\n- Stay current with industry trends\n- Contribute to open source projects\n- Build a strong portfolio\n\n**Soft Skills:**\n- Improve communication abilities\n- Learn to work in teams\n- Develop problem-solving mindset\n\n**Networking:**\n- Attend tech meetups and conferences\n- Engage on professional platforms\n- Find a mentor in your field\n\nWhat specific career aspect would you like to discuss further?",
      optimization: "Here are key optimization strategies:\n\n**Performance:**\n- Minimize DOM manipulations\n- Use efficient algorithms and data structures\n- Implement lazy loading for large datasets\n- Optimize images and assets\n\n**Code Quality:**\n- Follow consistent naming conventions\n- Remove dead code and unused imports\n- Use proper error handling\n- Write unit tests\n\n**Best Practices:**\n- Keep functions small and focused\n- Use modern JavaScript features appropriately\n- Implement proper caching strategies\n\nShould I dive deeper into any of these areas?"
    };

    return responses[topic] || responses.general;
  };

  return (
    <div className="section-padding">
      <div className="container-premium">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-display-1 mb-4">AI Mentor</h1>
          <p className="text-body-large text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Get personalized coding guidance, code reviews, and career advice from our AI mentor. Choose a topic below and start the conversation!
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Topics Sidebar */}
          <div className="lg:col-span-1">
            <Card className="card-premium p-6">
              <h2 className="font-semibold mb-4">
                Choose a Topic
              </h2>
              <div className="space-y-2">
                {topics.map((topic) => {
                  const Icon = topic.icon;
                  return (
                    <button
                      key={topic.id}
                      onClick={() => setSelectedTopic(topic.id)}
                      className={`w-full text-left btn ${selectedTopic === topic.id ? 'btn-secondary' : 'btn-outline'}`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`premium-icon ${topic.color} text-white flex-shrink-0`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm">
                            {topic.name}
                          </h3>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            {topic.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Quick Tips */}
            <Card className="card-premium p-6 mt-6">
              <h3 className="font-semibold mb-3">
                Quick Tips
              </h3>
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>Be specific about your questions for better responses</p>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>Include code snippets when asking for reviews</p>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full mt-2 flex-shrink-0"></div>
                  <p>Describe the context and what you've tried</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Chat Interface */}
          <div className="lg:col-span-3">
            <Card className="card-premium p-6 flex flex-col" style={{ height: '600px' }}>
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto mb-6 space-y-4">
                {conversation.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-4 rounded-lg ${
                        message.type === 'user'
                          ? 'bg-primary-gradient text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                      }`}
                    >
                      {message.type === 'ai' && (
                        <div className="flex items-center mb-2">
                          <div className="w-6 h-6 bg-primary-gradient rounded-full flex items-center justify-center mr-2">
                            <Brain className="h-3 w-3 text-white" />
                          </div>
                          <span className="text-sm font-medium">AI Mentor</span>
                        </div>
                      )}
                      
                      <div className="whitespace-pre-wrap text-sm mb-2">
                        {message.content}
                      </div>
                      
                      {message.code && (
                        <div className="mt-3 p-3 bg-slate-900 rounded-lg">
                          <pre className="text-xs text-green-400 overflow-x-auto">
                            <code>{message.code}</code>
                          </pre>
                        </div>
                      )}
                      
                      <div className="text-xs opacity-70 mt-2">
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full flex items-center justify-center">
                          <Brain className="h-3 w-3 text-white" />
                        </div>
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></div>
                          <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                {/* Code Snippet Input */}
                {(selectedTopic === 'code-review' || selectedTopic === 'debugging' || selectedTopic === 'optimization') && (
                  <div className="mb-4">
                    <label className="input-label">
                      Code Snippet (optional)
                    </label>
                    <textarea
                      value={codeSnippet}
                      onChange={(e) => setCodeSnippet(e.target.value)}
                      placeholder="Paste your code here..."
                      className="input font-mono text-sm"
                      style={{ height: '8rem' }}
                    />
                  </div>
                )}

                {/* Question Input */}
                <div className="flex space-x-4">
                  <div className="flex-1">
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder={`Ask about ${topics.find(t => t.id === selectedTopic)?.name.toLowerCase()}...`}
                      className="input resize-none"
                      style={{ height: '4rem' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                    />
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading || (!question.trim() && !codeSnippet.trim())}
                    className="btn btn-primary"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </button>
                </div>
                
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Mentor;