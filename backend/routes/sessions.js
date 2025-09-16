const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * POST /api/sessions
 * Create a new chat session
 * Requires authentication
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { 
      title, 
      description, 
      language = 'javascript',
      sessionType = 'live-coding',
      privacy = 'public',
      maxParticipants = 20,
      duration = 60,
      tags = [],
      scheduledFor,
      startNow = false
    } = req.body;
    const hostUserId = req.user.id;

    if (!title) {
      return res.status(400).json({ error: 'Session title is required' });
    }

    const sessionData = {
      title,
      description: description || '',
      language,
      sessionType,
      privacy,
      maxParticipants,
      duration,
      tags,
      hostUserId,
      status: startNow ? 'live' : (scheduledFor ? 'scheduled' : 'live'),
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      startedAt: startNow ? new Date() : null
    };

    const session = await req.prisma.session.create({
      data: sessionData,
      include: {
        hostUser: {
          select: {
            id: true,
            username: true,
            reputation: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Session created successfully',
      session
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /api/sessions
 * Get all active sessions
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const sessions = await req.prisma.session.findMany({
      include: {
        hostUser: {
          select: {
            id: true,
            username: true,
            reputation: true
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: parseInt(skip),
      take: parseInt(limit)
    });

    const total = await req.prisma.session.count();

    res.json({
      sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * GET /api/sessions/:id
 * Get session by ID with messages
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const session = await req.prisma.session.findUnique({
      where: { id: parseInt(id) },
      include: {
        hostUser: {
          select: {
            id: true,
            username: true,
            reputation: true
          }
        },
        messages: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                reputation: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ session });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * POST /api/sessions/:id/join
 * Join a session
 * Requires authentication
 */
router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const session = await req.prisma.session.findUnique({
      where: { id: parseInt(id) },
      include: {
        participants: true
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.participants.length >= session.maxParticipants) {
      return res.status(400).json({ error: 'Session is full' });
    }

    // Add participant (if not already joined)
    const existingParticipant = session.participants.find(p => p.userId === userId);
    if (!existingParticipant) {
      await req.prisma.sessionParticipant.create({
        data: {
          sessionId: parseInt(id),
          userId
        }
      });
    }

    res.json({ message: 'Joined session successfully' });
  } catch (error) {
    console.error('Join session error:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

/**
 * POST /api/sessions/:id/leave
 * Leave a session
 * Requires authentication
 */
router.post('/:id/leave', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await req.prisma.sessionParticipant.deleteMany({
      where: {
        sessionId: parseInt(id),
        userId
      }
    });

    res.json({ message: 'Left session successfully' });
  } catch (error) {
    console.error('Leave session error:', error);
    res.status(500).json({ error: 'Failed to leave session' });
  }
});

/**
 * PUT /api/sessions/:id/code
 * Update session code
 * Requires authentication and host/participant status
 */
router.put('/:id/code', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { code } = req.body;
    const userId = req.user.id;

    const session = await req.prisma.session.findUnique({
      where: { id: parseInt(id) },
      include: {
        participants: true
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if user is host or participant
    const isHost = session.hostUserId === userId;
    const isParticipant = session.participants.some(p => p.userId === userId);

    if (!isHost && !isParticipant) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await req.prisma.session.update({
      where: { id: parseInt(id) },
      data: { code }
    });

    res.json({ message: 'Code updated successfully' });
  } catch (error) {
    console.error('Update code error:', error);
    res.status(500).json({ error: 'Failed to update code' });
  }
});

module.exports = router;