import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import VideoCall from '../components/VideoCall';
import Card from '../components/Card';
import api from '../services/api';
import socketService from '../services/socket';
import { 
  ArrowLeft, 
  Users, 
  MessageSquare, 
  Code, 
  Settings, 
  MoreVertical,
  Send,
  Download,
  Copy,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2
} from 'lucide-react';

const SessionRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [code, setCode] = useState('// Welcome to the collaborative coding session!\n// Start coding together...\n\n');
  const [isVideoCallActive, setIsVideoCallActive] = useState(true);
  const [isCodeEditorExpanded, setIsCodeEditorExpanded] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchSession();
    initializeSocket();
    
    return () => {
      socketService.leaveSession(id);
    };
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/sessions/${id}`);
      const sessionData = response.data.session;
      setSession(sessionData);
      setIsHost(sessionData.hostUserId === user?.id);
      setMessages(sessionData.messages || []);
      
      // Set initial code if available
      if (sessionData.code) {
        setCode(sessionData.code);
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      setError('Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const initializeSocket = () => {
    socketService.connect();
    
    // Join the session room
    socketService.joinSession(id);
    
    // Listen for new participants
    socketService.on('user-joined', (participant) => {
      setParticipants(prev => [...prev, participant]);
    });
    
    // Listen for participants leaving
    socketService.on('user-left', (participantId) => {
      setParticipants(prev => prev.filter(p => p.id !== participantId));
    });
    
    // Listen for new messages
    socketService.on('new-message', (message) => {
      setMessages(prev => [...prev, message]);
    });
    
    // Listen for code updates
    socketService.on('code-update', (newCode) => {
      setCode(newCode);
    });
    
    // Listen for session updates
    socketService.on('session-update', (update) => {
      setSession(prev => ({ ...prev, ...update }));
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const message = {
      content: newMessage.trim(),
      sessionId: parseInt(id),
      user: {
        id: user.id,
        username: user.username
      },
      createdAt: new Date().toISOString()
    };

    // Send via socket
    socketService.emit('send-message', message);
    setNewMessage('');
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    // Emit code update to other participants
    socketService.emit('code-update', { sessionId: id, code: newCode });
  };

  const handleLeaveSession = () => {
    socketService.leaveSession(id);
    navigate('/sessions');
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    // You could add a toast notification here
  };

  const downloadCode = () => {
    const element = document.createElement('a');
    const file = new Blob([code], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${session?.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'session'}_code.${getFileExtension(session?.language)}`;
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
      html: 'html',
      css: 'css'
    };
    return extensions[language] || 'txt';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p>Joining session...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <Card className="p-8 text-center bg-slate-800 border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-2">
            Session Not Found
          </h2>
          <p className="text-slate-300 mb-4">
            {error || 'The session you\'re looking for doesn\'t exist or has ended.'}
          </p>
          <button
            onClick={() => navigate('/sessions')}
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Sessions
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Session Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLeaveSession}
              className="inline-flex items-center px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Leave
            </button>
            <div>
              <h1 className="text-xl font-semibold">{session.title}</h1>
              <p className="text-slate-400">
                Hosted by {session.hostUser?.username} • {session.language}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-slate-400">
              <Users className="h-4 w-4" />
              <span>{participants.length + 1} participants</span>
            </div>
            
            {/* View Controls */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsVideoCallActive(!isVideoCallActive)}
                className={`p-2 rounded transition-colors ${
                  isVideoCallActive ? 'bg-slate-700' : 'bg-slate-600'
                }`}
                title={isVideoCallActive ? 'Hide video' : 'Show video'}
              >
                {isVideoCallActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              
              <button
                onClick={() => setIsCodeEditorExpanded(!isCodeEditorExpanded)}
                className="p-2 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                title={isCodeEditorExpanded ? 'Minimize editor' : 'Expand editor'}
              >
                {isCodeEditorExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              
              <button
                onClick={() => setIsChatVisible(!isChatVisible)}
                className={`p-2 rounded transition-colors ${
                  isChatVisible ? 'bg-slate-700' : 'bg-slate-600'
                }`}
                title={isChatVisible ? 'Hide chat' : 'Show chat'}
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            </div>
            
            <button className="p-2 rounded bg-slate-700 hover:bg-slate-600 transition-colors">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Call Section */}
        {isVideoCallActive && (
          <div className={`${isCodeEditorExpanded ? 'w-1/3' : 'w-1/2'} border-r border-slate-700`}>
            <VideoCall
              sessionId={id}
              isHost={isHost}
              participants={participants}
              onLeave={handleLeaveSession}
            />
          </div>
        )}

        {/* Code Editor Section */}
        <div className={`${
          !isVideoCallActive ? 'flex-1' : 
          isCodeEditorExpanded ? 'w-2/3' : 'w-1/2'
        } flex flex-col ${isChatVisible ? 'border-r border-slate-700' : ''}`}>
          {/* Code Editor Header */}
          <div className="bg-slate-800 p-3 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Code className="h-4 w-4" />
              <span className="text-sm font-medium">Collaborative Editor</span>
              <span className="text-xs text-slate-400 capitalize">({session.language})</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={copyCode}
                className="p-1 rounded hover:bg-slate-700 transition-colors"
                title="Copy code"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                onClick={downloadCode}
                className="p-1 rounded hover:bg-slate-700 transition-colors"
                title="Download code"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Code Editor */}
          <div className="flex-1 bg-slate-900">
            <textarea
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="w-full h-full p-4 bg-slate-900 text-white font-mono text-sm resize-none focus:outline-none"
              placeholder="Start coding together..."
              style={{ minHeight: '400px' }}
            />
          </div>
        </div>

        {/* Chat Section */}
        {isChatVisible && (
          <div className="w-80 flex flex-col bg-slate-800">
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chat
                </h3>
                <button
                  onClick={() => setIsChatVisible(false)}
                  className="p-1 rounded hover:bg-slate-700 transition-colors"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-96">
              {messages.map((message, index) => (
                <div key={index} className="text-sm">
                  <div className="flex items-start space-x-2">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-primary-400">
                          {message.user?.username || 'Unknown'}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-slate-300 whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-slate-700">
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 bg-slate-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="px-3 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionRoom;