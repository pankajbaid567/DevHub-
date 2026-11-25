import { z } from 'zod';
import {
  idParamSchema,
  interviewControlSchema,
  interviewFeedbackRequestSchema,
  INTERVIEW_PROBLEMS,
  scorecardSchema,
  submitSolutionSchema,
  proctoringEventSchema,
} from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { currentUser } from '../../middleware/auth.js';
import type { SessionBroadcaster } from '../../realtime/socket.js';

/** Interview mode, mounted under /sessions. */
export function interviewRoutes(
  ctx: RouteContext,
  c: Container,
  broadcast: SessionBroadcaster,
): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/interview/problems',
    tag: 'Interviews',
    summary: 'The built-in problem bank, and whether the AI voice interviewer is available',
    auth: 'optional',
    handler: async (_req, res) => {
      res.json({
        items: INTERVIEW_PROBLEMS,
        voiceEnabled: c.interviews.voiceEnabled,
        chatEnabled: !c.ai.isDemo,
      });
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/interview/history',
    tag: 'Interviews',
    summary: 'Every interview you took part in, with your own test results and feedback',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.submissions.history(currentUser(req)));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/interview/submissions',
    tag: 'Interviews',
    summary:
      "Check a solution against the problem's visible and hidden tests (shared with the room)",
    auth: 'required',
    params: idParamSchema,
    body: submitSolutionSchema,
    responses: {
      201: 'Results',
      409: 'No tests, not started, or already running',
      429: 'Cooldown',
    },
    handler: async (req, res) => {
      res
        .status(201)
        .json(
          await c.submissions.submit(
            currentUser(req),
            req.params.id as string,
            req.body,
            broadcast,
          ),
        );
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/interview/submissions',
    tag: 'Interviews',
    summary: "The room's recent test submissions",
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json({ items: await c.submissions.list(currentUser(req), req.params.id as string) });
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/interview',
    tag: 'Interviews',
    summary: 'Start (reveal the problem), extend or end the interview clock (interviewer only)',
    auth: 'required',
    params: idParamSchema,
    body: interviewControlSchema,
    responses: { 200: 'New state', 403: 'Not the interviewer', 409: 'Invalid transition' },
    handler: async (req, res) => {
      res.json(
        await c.interviews.control(currentUser(req), req.params.id as string, req.body, broadcast),
      );
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/interview/scorecard',
    tag: 'Interviews',
    summary: "The interviewer's private notes and ratings (interviewer only)",
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json(await c.interviews.scorecard(currentUser(req), req.params.id as string));
    },
  });

  defineRoute(ctx, {
    method: 'put',
    path: '/:id/interview/scorecard',
    tag: 'Interviews',
    summary: 'Save private notes and ratings (interviewer only; never broadcast)',
    auth: 'required',
    params: idParamSchema,
    body: scorecardSchema,
    handler: async (req, res) => {
      res.json(
        await c.interviews.saveScorecard(currentUser(req), req.params.id as string, req.body),
      );
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/interview/voice-token',
    tag: 'Interviews',
    summary: 'A single-use, prompt-locked Gemini Live token for the AI voice interviewer',
    auth: 'required',
    params: idParamSchema,
    responses: { 200: 'Token', 429: 'Daily limit or cooldown', 503: 'Not configured' },
    handler: async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(await c.interviews.voiceToken(currentUser(req), req.params.id as string));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/interview/feedback',
    tag: 'Interviews',
    summary: 'AI feedback on a practice interview from its transcript and final code',
    auth: 'required',
    params: idParamSchema,
    body: interviewFeedbackRequestSchema,
    responses: { 201: 'Created', 429: 'Cooldown', 503: 'AI unavailable' },
    handler: async (req, res) => {
      res
        .status(201)
        .json(
          await c.interviews.createFeedback(currentUser(req), req.params.id as string, req.body),
        );
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/interview/feedback',
    tag: 'Interviews',
    summary: 'Your AI feedback for this session, newest first',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json({
        items: await c.interviews.listFeedback(currentUser(req), req.params.id as string),
      });
    },
  });

  // ---------------------------------------------------------------- chat interviewer

  const chatMessageSchema = z.object({
    message: z.string().trim().min(1).max(4_000),
    context: z
      .object({
        code: z.string().max(16_000).optional(),
        runOutput: z.string().max(4_000).optional(),
      })
      .optional(),
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/interview/chat',
    tag: 'Interviews',
    summary: 'Send a text message to the AI interviewer and get a spoken-length reply',
    auth: 'required',
    params: idParamSchema,
    body: chatMessageSchema,
    responses: { 200: 'Reply', 409: 'Invalid state', 429: 'Rate limited', 503: 'AI unavailable' },
    handler: async (req, res) => {
      res.json(
        await c.interviews.chatMessage(
          currentUser(req),
          req.params.id as string,
          req.body.message,
          req.body.context,
        ),
      );
    },
  });

  // ---------------------------------------------------------------- proctoring

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/interview/proctoring',
    tag: 'Interviews',
    summary: 'Proctoring events and violation count (interviewer only)',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json(await c.proctoring.getStatus(currentUser(req), req.params.id as string));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/interview/proctoring/events',
    tag: 'Interviews',
    summary: 'Record a proctoring event (REST fallback for the socket event)',
    auth: 'required',
    params: idParamSchema,
    body: proctoringEventSchema,
    responses: { 201: 'Recorded' },
    handler: async (req, res) => {
      res.status(201).json(
        await c.proctoring.recordEvent(currentUser(req), req.params.id as string, req.body),
      );
    },
  });
}
