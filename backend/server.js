const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const questionRoutes = require('./routes/questions');
const answerRoutes = require('./routes/answers');
const snippetRoutes = require('./routes/snippets');
const resumeRoutes = require('./routes/resumes');
const skillRoutes = require('./routes/skills');
const sessionRoutes = require('./routes/sessions');
const messageRoutes = require('./routes/messages');
const aiRoutes = require('./routes/ai');
const mentorRoutes = require('./routes/mentor');

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173", // Vite default port
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: "http://localhost:5173", // Allow frontend to call backend
  credentials: true
}));
app.use(express.json());

// Make Prisma available to routes
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Basic routes
app.get('/', (req, res) => {
  res.json({ message: 'DevHub+ Backend API is running!' });
});

app.get('/ping', (req, res) => {
  res.json({ message: 'pong' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is healthy' });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/answers', answerRoutes);
app.use('/api/snippets', snippetRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/mentor', mentorRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler - must be last
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  // Join a session room
  socket.on('joinSession', async (data) => {
    try {
      const { sessionId, userId, username } = data;
      
      if (!sessionId || !userId || !username) {
        socket.emit('error', { message: 'sessionId, userId, and username are required' });
        return;
      }

      // Verify session exists
      const session = await prisma.session.findUnique({
        where: { id: parseInt(sessionId) },
        include: {
          hostUser: {
            select: { id: true, username: true, reputation: true }
          }
        }
      });

      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Join the session room
      socket.join(`session_${sessionId}`);
      socket.sessionId = sessionId;
      socket.userId = userId;
      socket.username = username;

      // Notify others in the room
      socket.to(`session_${sessionId}`).emit('userJoined', {
        userId,
        username,
        message: `${username} joined the session`,
        timestamp: new Date().toISOString()
      });

      // Send session info to the user
      socket.emit('sessionJoined', {
        session,
        message: `Successfully joined "${session.title}"`
      });

      console.log(`User ${username} (${userId}) joined session ${sessionId}`);
    } catch (error) {
      console.error('Join session error:', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  });

  // Leave a session room
  socket.on('leaveSession', (data) => {
    try {
      const { sessionId } = data;
      if (sessionId && socket.username) {
        socket.to(`session_${sessionId}`).emit('userLeft', {
          userId: socket.userId,
          username: socket.username,
          message: `${socket.username} left the session`,
          timestamp: new Date().toISOString()
        });
        socket.leave(`session_${sessionId}`);
        console.log(`User ${socket.username} left session ${sessionId}`);
      }
    } catch (error) {
      console.error('Leave session error:', error);
    }
  });

  // Handle chat messages
  socket.on('sendMessage', async (data) => {
    try {
      const { content, sessionId, userId } = data;

      if (!content || !sessionId || !userId) {
        socket.emit('error', { message: 'content, sessionId, and userId are required' });
        return;
      }

      // Verify session exists
      const session = await prisma.session.findUnique({
        where: { id: parseInt(sessionId) }
      });

      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Save message to database
      const message = await prisma.message.create({
        data: {
          content,
          sessionId: parseInt(sessionId),
          userId: parseInt(userId)
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              reputation: true
            }
          }
        }
      });

      // Broadcast message to all users in the session room
      io.to(`session_${sessionId}`).emit('messageReceived', {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        user: message.user,
        sessionId: parseInt(sessionId)
      });

      console.log(`Message sent in session ${sessionId} by user ${userId}`);
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle code updates (real-time code collaboration)
  socket.on('updateCode', async (data) => {
    try {
      const { code, language, sessionId, userId, title } = data;

      if (!sessionId || !userId) {
        socket.emit('error', { message: 'sessionId and userId are required' });
        return;
      }

      // Verify session exists
      const session = await prisma.session.findUnique({
        where: { id: parseInt(sessionId) }
      });

      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      // Broadcast code update to all users in the session room (except sender)
      socket.to(`session_${sessionId}`).emit('codeUpdated', {
        code,
        language,
        title,
        userId: parseInt(userId),
        username: socket.username,
        sessionId: parseInt(sessionId),
        timestamp: new Date().toISOString()
      });

      console.log(`Code updated in session ${sessionId} by user ${userId}`);
    } catch (error) {
      console.error('Update code error:', error);
      socket.emit('error', { message: 'Failed to update code' });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    try {
      const { sessionId, userId, username, isTyping } = data;
      
      if (sessionId) {
        socket.to(`session_${sessionId}`).emit('userTyping', {
          userId,
          username,
          isTyping,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Typing indicator error:', error);
    }
  });

  // Handle screen sharing events
  socket.on('shareScreen', (data) => {
    try {
      const { sessionId, userId, username, isSharing } = data;
      
      if (sessionId) {
        socket.to(`session_${sessionId}`).emit('screenShared', {
          userId,
          username,
          isSharing,
          timestamp: new Date().toISOString()
        });
        console.log(`User ${username} ${isSharing ? 'started' : 'stopped'} screen sharing in session ${sessionId}`);
      }
    } catch (error) {
      console.error('Screen share error:', error);
    }
  });

  // Handle voice chat events
  socket.on('voiceChat', (data) => {
    try {
      const { sessionId, userId, username, isSpeaking } = data;
      
      if (sessionId) {
        socket.to(`session_${sessionId}`).emit('voiceActivity', {
          userId,
          username,
          isSpeaking,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Voice chat error:', error);
    }
  });

  // Handle user presence updates
  socket.on('updatePresence', (data) => {
    try {
      const { sessionId, userId, username, status } = data;
      
      if (sessionId) {
        socket.to(`session_${sessionId}`).emit('presenceUpdated', {
          userId,
          username,
          status, // 'online', 'away', 'busy'
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Presence update error:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
    
    // Notify session room if user was in a session
    if (socket.sessionId && socket.username) {
      socket.to(`session_${socket.sessionId}`).emit('userLeft', {
        userId: socket.userId,
        username: socket.username,
        message: `${socket.username} disconnected`,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;