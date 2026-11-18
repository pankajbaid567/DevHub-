import type { RequestHandler } from 'express';
import multer from 'multer';
import { extractText, getDocumentProxy } from 'unpdf';
import {
  codeAssistSchema,
  createConversationSchema,
  ErrorCode,
  idParamSchema,
  mentorMessageSchema,
  resumeTextSchema,
  skillAssessmentSchema,
} from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { AppError, ValidationError } from '../../core/errors.js';
import { parseOrThrow } from '../../core/validate.js';
import { currentUser } from '../../middleware/auth.js';

const MAX_PDF_BYTES = 2 * 1024 * 1024;

/** In-memory upload, PDF only, 2 MB cap. The file never touches disk. */
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new AppError(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Only PDF files are accepted'));
  },
}).single('file');

/** Checks the magic bytes too: the declared MIME type is client-controlled. */
async function pdfToText(buffer: Buffer): Promise<string> {
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new AppError(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'The file is not a valid PDF');
  }
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join('\n') : text).replace(/[ \t]+/g, ' ').trim();
  } catch {
    throw new ValidationError({ file: ['Could not read text from this PDF'] });
  }
}

export function aiRoutes(ctx: RouteContext, c: Container, aiLimiter: RequestHandler): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/status',
    tag: 'AI',
    summary: 'Whether a real model is configured or the keyless demo provider is active',
    handler: (_req, res) => {
      res.json({ isDemo: c.ai.isDemo });
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/conversations',
    tag: 'AI',
    summary: 'Your mentor conversations',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.ai.listConversations(currentUser(req).id));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/conversations',
    tag: 'AI',
    summary: 'Start a mentor conversation',
    auth: 'required',
    body: createConversationSchema,
    responses: { 201: 'Created' },
    handler: async (req, res) => {
      res.status(201).json(await c.ai.createConversation(currentUser(req).id, req.body.topic));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/conversations/:id',
    tag: 'AI',
    summary: 'A conversation with its messages',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json(await c.ai.getConversation(currentUser(req).id, req.params.id as string));
    },
  });

  defineRoute(ctx, {
    method: 'delete',
    path: '/conversations/:id',
    tag: 'AI',
    summary: 'Delete a conversation',
    auth: 'required',
    params: idParamSchema,
    responses: { 204: 'Deleted' },
    handler: async (req, res) => {
      await c.ai.deleteConversation(currentUser(req).id, req.params.id as string);
      res.status(204).end();
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/conversations/:id/messages',
    tag: 'AI',
    summary:
      'Send a message; the reply streams back as Server-Sent Events (start/delta/done/error)',
    auth: 'required',
    params: idParamSchema,
    body: mentorMessageSchema,
    middleware: [aiLimiter],
    responses: { 200: 'text/event-stream of MentorStreamEvent', 429: 'AI hourly limit reached' },
    handler: async (req, res) => {
      const user = currentUser(req);
      // Abort the model call if the browser goes away, so we stop paying for tokens.
      const abort = new AbortController();
      res.on('close', () => abort.abort());

      const stream = c.ai.streamReply(user.id, req.params.id as string, req.body, abort.signal);
      // Pull the first event before committing to SSE, so a 404 is still a normal JSON error.
      const first = await stream.next();

      res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
      });
      res.flushHeaders();
      const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (!first.done) send(first.value);
      for await (const event of stream) {
        if (abort.signal.aborted) break;
        send(event);
      }
      res.end();
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/code',
    tag: 'AI',
    summary: 'Review or explain a piece of code',
    auth: 'required',
    body: codeAssistSchema,
    middleware: [aiLimiter],
    handler: async (req, res) => {
      res.json(await c.ai.codeAssist(req.body));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/resume-reviews',
    tag: 'AI',
    summary:
      'Review a resume: JSON { text, targetRole? } or multipart PDF upload (field "file", max 2 MB)',
    auth: 'required',
    middleware: [aiLimiter, pdfUpload],
    responses: {
      201: 'Structured review',
      413: 'File too large',
      415: 'Not a PDF',
      503: 'AI unavailable',
    },
    handler: async (req, res) => {
      const user = currentUser(req);
      let text: string;
      let fileName: string | undefined;
      if (req.file) {
        text = await pdfToText(req.file.buffer);
        fileName = req.file.originalname.slice(0, 120);
      } else {
        text = req.body?.text;
      }
      const input = parseOrThrow(resumeTextSchema, {
        text,
        targetRole: req.body?.targetRole || undefined,
      });
      res
        .status(201)
        .json(
          await c.ai.reviewResume(user.id, input.text, {
            ...(fileName && { fileName }),
            ...(input.targetRole && { targetRole: input.targetRole }),
          }),
        );
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/resume-reviews',
    tag: 'AI',
    summary: 'Your past resume reviews',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.ai.listResumeReviews(currentUser(req).id));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/skill-assessment',
    tag: 'AI',
    summary: 'Assess self-rated skills and generate a learning roadmap',
    auth: 'required',
    body: skillAssessmentSchema,
    middleware: [aiLimiter],
    handler: async (req, res) => {
      res.json(await c.ai.assessSkills(req.body.skills, req.body.goal));
    },
  });
}
