import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.currentSession = null;
  }

  connect() {
    if (!this.socket) {
      this.socket = io('http://localhost:3000', {
        transports: ['websocket'],
        upgrade: true,
      });

      this.socket.on('connect', () => {
        console.log('Connected to Socket.io server:', this.socket.id);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Session management
  joinSession(sessionId) {
    if (this.socket) {
      this.currentSession = sessionId;
      this.socket.emit('join-session', { sessionId });
    }
  }

  leaveSession(sessionId) {
    if (this.socket) {
      this.socket.emit('leave-session', { sessionId });
      this.currentSession = null;
    }
  }

  // Event listeners
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  // Code collaboration
  updateCode(codeData) {
    if (this.socket && this.currentSession) {
      this.socket.emit('updateCode', {
        ...codeData,
        sessionId: this.currentSession,
      });
    }
  }

  onCodeUpdated(callback) {
    if (this.socket) {
      this.socket.on('codeUpdated', callback);
    }
  }

  // Chat functionality
  sendMessage(messageData) {
    if (this.socket && this.currentSession) {
      this.socket.emit('sendMessage', {
        ...messageData,
        sessionId: this.currentSession,
      });
    }
  }

  onMessageReceived(callback) {
    if (this.socket) {
      this.socket.on('messageReceived', callback);
    }
  }

  // Typing indicators
  setTyping(isTyping, userData) {
    if (this.socket && this.currentSession) {
      this.socket.emit('typing', {
        sessionId: this.currentSession,
        isTyping,
        ...userData,
      });
    }
  }

  onUserTyping(callback) {
    if (this.socket) {
      this.socket.on('userTyping', callback);
    }
  }

  // Session events
  onSessionJoined(callback) {
    if (this.socket) {
      this.socket.on('sessionJoined', callback);
    }
  }

  onUserJoined(callback) {
    if (this.socket) {
      this.socket.on('userJoined', callback);
    }
  }

  onUserLeft(callback) {
    if (this.socket) {
      this.socket.on('userLeft', callback);
    }
  }

  // Screen sharing
  startScreenShare(sessionId, userId) {
    if (this.socket) {
      this.socket.emit('screenShare', {
        sessionId,
        userId,
        action: 'start',
      });
    }
  }

  stopScreenShare(sessionId, userId) {
    if (this.socket) {
      this.socket.emit('screenShare', {
        sessionId,
        userId,
        action: 'stop',
      });
    }
  }

  onScreenShareUpdate(callback) {
    if (this.socket) {
      this.socket.on('screenShareUpdate', callback);
    }
  }

  // Voice chat
  startVoiceChat(sessionId, userId) {
    if (this.socket) {
      this.socket.emit('voiceChat', {
        sessionId,
        userId,
        action: 'start',
      });
    }
  }

  stopVoiceChat(sessionId, userId) {
    if (this.socket) {
      this.socket.emit('voiceChat', {
        sessionId,
        userId,
        action: 'stop',
      });
    }
  }

  onVoiceChatUpdate(callback) {
    if (this.socket) {
      this.socket.on('voiceChatUpdate', callback);
    }
  }

  // Cleanup listeners
  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }

  removeListener(event) {
    if (this.socket) {
      this.socket.off(event);
    }
  }
}

// Create and export singleton instance
const socketService = new SocketService();
export default socketService;