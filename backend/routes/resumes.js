const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * POST /api/resumes
 * Upload a resume for review
 * Requires authentication
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { fileUrl } = req.body;
    const userId = req.user.id;

    if (!fileUrl) {
      return res.status(400).json({ error: 'File URL is required' });
    }

    const resume = await req.prisma.resume.create({
      data: {
        fileUrl,
        userId
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

    res.status(201).json({
      message: 'Resume uploaded successfully',
      resume
    });
  } catch (error) {
    console.error('Upload resume error:', error);
    res.status(500).json({ error: 'Failed to upload resume' });
  }
});

/**
 * GET /api/resumes/user/:userId
 * Get resumes by user ID
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const resumes = await req.prisma.resume.findMany({
      where: { userId: parseInt(userId) },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ resumes });
  } catch (error) {
    console.error('Get user resumes error:', error);
    res.status(500).json({ error: 'Failed to get resumes' });
  }
});

/**
 * PUT /api/resumes/:id/review
 * Add review to a resume
 * Requires authentication
 */
router.put('/:id/review', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { review } = req.body;

    if (!review) {
      return res.status(400).json({ error: 'Review is required' });
    }

    const resume = await req.prisma.resume.findUnique({
      where: { id: parseInt(id) }
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const updatedResume = await req.prisma.resume.update({
      where: { id: parseInt(id) },
      data: { review },
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

    res.json({
      message: 'Review added successfully',
      resume: updatedResume
    });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ error: 'Failed to add review' });
  }
});

module.exports = router;