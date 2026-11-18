import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import socketService from '../services/socket';
import { MessageSquare, Plus, Users, Clock, Play, Video, Code, Mic, Settings } from 'lucide-react';

const Sessions = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => {
    // Initialize socket connection
    socketService.connect();
    
    // Mock data for sessions
    setSessions([
      {
        id: 1,
        title: 'Building a React Chat App',
        description: 'Live coding session: Creating a real-time chat application with Socket.io',
        host: 'react_expert',
        participants: 12,
        maxParticipants: 20,
        status: 'live',
        language: 'javascript',
        duration: '2h 15m',
        startedAt: '45 minutes ago',
        tags: ['react', 'socket.io', 'real-time']
      },
      {
        id: 2,
        title: 'Python Data Science Workshop',
        description: 'Exploring pandas and matplotlib for data visualization',
        host: 'data_scientist',
        participants: 8,
        maxParticipants: 15,
        status: 'live',
        language: 'python',
        duration: '1h 30m',
        startedAt: '20 minutes ago',
        tags: ['python', 'pandas', 'data-science']
      },
      {
        id: 3,
        title: 'TypeScript Best Practices',
        description: 'Learn advanced TypeScript patterns and techniques',
        host: 'ts_guru',
        participants: 0,
        maxParticipants: 25,
        status: 'scheduled',
        language: 'typescript',
        scheduledFor: 'Tomorrow at 2:00 PM',
        tags: ['typescript', 'patterns', 'best-practices']
      },
      {
        id: 4,
        title: 'GraphQL API Development',
        description: 'Building scalable APIs with GraphQL and Apollo',
        host: 'api_master',
        participants: 15,
        maxParticipants: 30,
        status: 'completed',
        language: 'javascript',
        duration: '3h 00m',
        completedAt: '2 days ago',
        tags: ['graphql', 'apollo', 'api']
      }
    ]);

    // Cleanup function
    return () => {
      if (activeSession) {
        socketService.leaveSession(activeSession.id);
      }
    };
  }, []);

  const joinSession = (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.status === 'live') {
      // Navigate to session room instead of inline view
      navigate(`/sessions/${sessionId}`);
    }
  };

  const leaveSession = () => {
    if (activeSession) {
      socketService.leaveSession(activeSession.id);
      setActiveSession(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'live':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'completed':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
    }
  };

  if (activeSession) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        {/* Session Header */}
        <div className="bg-slate-800 border-b border-slate-700 p-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={leaveSession}
                className="btn bg-red-600 hover:bg-red-700 text-white"
              >
                Leave Session
              </button>
              <div>
                <h1 className="text-xl font-semibold">{activeSession.title}</h1>
                <p className="text-slate-400">Hosted by {activeSession.host}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-slate-400">
                <Users className="h-4 w-4" />
                <span>{activeSession.participants} participants</span>
              </div>
              <button className="btn btn-outline p-2">
                <Mic className="h-5 w-5" />
              </button>
              <button className="btn btn-outline p-2">
                <Video className="h-5 w-5" />
              </button>
              <button className="btn btn-outline p-2">
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Session Content */}
        <div className="max-w-7xl mx-auto p-4 grid lg:grid-cols-4 gap-6 h-[calc(100vh-120px)]">
          {/* Code Editor */}
          <div className="lg:col-span-3 bg-slate-800 rounded-lg p-4">
            <div className="h-full bg-slate-900 rounded-lg p-4 font-mono text-sm">
              <div className="text-green-400 mb-2">// Live coding session in progress...</div>
              <div className="text-slate-300">
                {`import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const ChatApp = () => {
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    newSocket.on('message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => newSocket.close();
  }, []);

  return (
    <div className="chat-container">
      {/* Chat implementation */}
    </div>
  );
};

export default ChatApp;`}
              </div>
            </div>
          </div>

          {/* Chat and Participants */}
          <div className="space-y-4">
            {/* Participants */}
            <Card className="card-premium p-4 bg-slate-800 border-slate-700">
              <h3 className="font-semibold text-white mb-3 flex items-center">
                <Users className="h-4 w-4 mr-2" />
                Participants ({activeSession.participants})
              </h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-slate-300">{activeSession.host} (Host)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-slate-300">developer_123</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-slate-300">code_learner</span>
                </div>
              </div>
            </Card>

            {/* Chat */}
            <Card className="card-premium p-4 bg-slate-800 border-slate-700 flex-1">
              <h3 className="font-semibold text-white mb-3 flex items-center">
                <MessageSquare className="h-4 w-4 mr-2" />
                Chat
              </h3>
              <div className="space-y-2 h-64 overflow-y-auto mb-3">
                <div className="text-sm">
                  <span className="text-primary-400 font-medium">{activeSession.host}:</span>
                  <span className="text-slate-300 ml-2">Welcome everyone! Let's build a chat app together.</span>
                </div>
                <div className="text-sm">
                  <span className="text-green-400 font-medium">developer_123:</span>
                  <span className="text-slate-300 ml-2">Excited to learn Socket.io!</span>
                </div>
                <div className="text-sm">
                  <span className="text-blue-400 font-medium">code_learner:</span>
                  <span className="text-slate-300 ml-2">Can you explain how real-time updates work?</span>
                </div>
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="flex-1 input bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                />
                <button className="btn btn-primary">
                  Send
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-padding">
      <div className="container-premium">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-display-1">Live Sessions</h1>
            <p className="text-body-large text-slate-600 dark:text-slate-400 mt-2">
              Join collaborative coding sessions and learn together
            </p>
          </div>
          <Link
            to="/sessions/new"
            className="mt-4 sm:mt-0 inline-flex items-center btn btn-secondary"
          >
            <Plus className="h-4 w-4 mr-2" />
            Start Session
          </Link>
        </div>

        {/* Session Categories */}
        <div className="flex space-x-4 mb-6 overflow-x-auto">
          {['All', 'Live', 'Scheduled', 'Completed'].map((category) => (
            <button
              key={category}
              className="btn btn-outline whitespace-nowrap"
            >
              {category}
            </button>
          ))}
        </div>

        {/* Sessions Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((session) => (
            <Card key={session.id} className="card-premium p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">
                    {session.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                    {session.description}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(session.status)} capitalize`}>
                  {session.status}
                </span>
              </div>

              {/* Session Info */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Host: {session.host}</span>
                  <span className="capitalize">{session.language}</span>
                </div>
                
                <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    <span>{session.participants}/{session.maxParticipants}</span>
                  </div>
                  
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    <span>
                      {session.status === 'live' ? session.startedAt :
                       session.status === 'scheduled' ? session.scheduledFor :
                       session.completedAt}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-4">
                {session.tags.map((tag) => (
                  <span
                    key={tag}
                    className="tag"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Action Button */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                {session.status === 'live' ? (
                  <button
                    onClick={() => joinSession(session.id)}
                    className="w-full btn btn-secondary"
                    disabled={session.participants >= session.maxParticipants}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {session.participants >= session.maxParticipants ? 'Session Full' : 'Join Session'}
                  </button>
                ) : session.status === 'scheduled' ? (
                  <button className="w-full btn btn-primary">
                    <Clock className="h-4 w-4 mr-2" />
                    Set Reminder
                  </button>
                ) : (
                  <button className="w-full btn btn-outline">
                    <Code className="h-4 w-4 mr-2" />
                    View Recording
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Load More */}
        <div className="text-center mt-8">
          <button className="btn btn-outline">
            Load More Sessions
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sessions;