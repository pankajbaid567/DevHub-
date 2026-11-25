import { z } from 'zod';
import {
  idParamSchema,
  createOrgSchema,
  inviteOrgMemberSchema,
  createAssessmentSchema,
  inviteCandidatesSchema,
} from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { currentUser } from '../../middleware/auth.js';

export function assessmentRoutes(ctx: RouteContext, c: Container): void {
  // ================================================================ Organizations
  defineRoute(ctx, {
    method: 'post',
    path: '/',
    tag: 'Organizations',
    summary: 'Create an organization',
    auth: 'required',
    body: createOrgSchema,
    responses: { 201: 'Created' },
    handler: async (req, res) => {
      res.status(201).json(await c.orgs.create(currentUser(req).id, req.body));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/',
    tag: 'Organizations',
    summary: 'List your organizations',
    auth: 'required',
    handler: async (req, res) => {
      res.json({ items: await c.orgs.list(currentUser(req).id) });
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id',
    tag: 'Organizations',
    summary: 'Get organization details',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json(await c.orgs.get(currentUser(req).id, req.params.id as string));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/members',
    tag: 'Organizations',
    summary: 'List organization members',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json({ items: await c.orgs.members(currentUser(req).id, req.params.id as string) });
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/members',
    tag: 'Organizations',
    summary: 'Invite a team member by email',
    auth: 'required',
    params: idParamSchema,
    body: inviteOrgMemberSchema,
    responses: { 201: 'Invited', 404: 'User not registered', 409: 'Already a member' },
    handler: async (req, res) => {
      res
        .status(201)
        .json(
          await c.orgs.inviteMember(
            currentUser(req).id,
            req.params.id as string,
            req.body.email,
            req.body.role,
          ),
        );
    },
  });

  defineRoute(ctx, {
    method: 'delete',
    path: '/:id/members/:userId',
    tag: 'Organizations',
    summary: 'Remove a member',
    auth: 'required',
    params: z.object({ id: z.string(), userId: z.string() }),
    handler: async (req, res) => {
      res.json(
        await c.orgs.removeMember(
          currentUser(req).id,
          req.params.id as string,
          req.params.userId as string,
        ),
      );
    },
  });

  // ================================================================ Assessments
  defineRoute(ctx, {
    method: 'post',
    path: '/:id/assessments',
    tag: 'Assessments',
    summary: 'Create an assessment (OA)',
    auth: 'required',
    params: idParamSchema,
    body: createAssessmentSchema.omit({ orgId: true }),
    responses: { 201: 'Created' },
    handler: async (req, res) => {
      res
        .status(201)
        .json(
          await c.assessments.create(currentUser(req).id, {
            ...req.body,
            orgId: req.params.id as string,
          }),
        );
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/assessments',
    tag: 'Assessments',
    summary: 'List assessments for an organization',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json({ items: await c.assessments.list(currentUser(req).id, req.params.id as string) });
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/assessments/:assessmentId',
    tag: 'Assessments',
    summary: 'Get assessment details',
    auth: 'required',
    params: z.object({ id: z.string(), assessmentId: z.string() }),
    handler: async (req, res) => {
      res.json(
        await c.assessments.get(currentUser(req).id, req.params.assessmentId as string),
      );
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/assessments/:assessmentId/activate',
    tag: 'Assessments',
    summary: 'Activate an assessment (make it available for candidates)',
    auth: 'required',
    params: z.object({ id: z.string(), assessmentId: z.string() }),
    handler: async (req, res) => {
      res.json(
        await c.assessments.activate(currentUser(req).id, req.params.assessmentId as string),
      );
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/assessments/:assessmentId/archive',
    tag: 'Assessments',
    summary: 'Archive an assessment',
    auth: 'required',
    params: z.object({ id: z.string(), assessmentId: z.string() }),
    handler: async (req, res) => {
      res.json(
        await c.assessments.archive(currentUser(req).id, req.params.assessmentId as string),
      );
    },
  });

  // ---------------------------------------------------------------- Candidate invites
  defineRoute(ctx, {
    method: 'post',
    path: '/:id/assessments/:assessmentId/invites',
    tag: 'Assessments',
    summary: 'Invite candidates to an assessment (bulk)',
    auth: 'required',
    params: z.object({ id: z.string(), assessmentId: z.string() }),
    body: inviteCandidatesSchema.omit({ assessmentId: true }),
    responses: { 201: 'Invites created' },
    handler: async (req, res) => {
      res.status(201).json({
        items: await c.assessments.inviteCandidates(
          currentUser(req).id,
          req.params.assessmentId as string,
          req.body.candidates,
          req.body.expiresInHours,
        ),
      });
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/assessments/:assessmentId/candidates',
    tag: 'Assessments',
    summary: 'List candidates and their status',
    auth: 'required',
    params: z.object({ id: z.string(), assessmentId: z.string() }),
    handler: async (req, res) => {
      res.json({
        items: await c.assessments.listCandidates(
          currentUser(req).id,
          req.params.assessmentId as string,
        ),
      });
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/assessments/:assessmentId/analytics',
    tag: 'Assessments',
    summary: 'Assessment analytics: scores, pass rate, top candidates',
    auth: 'required',
    params: z.object({ id: z.string(), assessmentId: z.string() }),
    handler: async (req, res) => {
      res.json(
        await c.assessments.getAnalytics(
          currentUser(req).id,
          req.params.assessmentId as string,
        ),
      );
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/assessments/:assessmentId/report/:inviteId',
    tag: 'Assessments',
    summary: 'Detailed candidate report with scores, proctoring events, and AI feedback',
    auth: 'required',
    params: z.object({ id: z.string(), assessmentId: z.string(), inviteId: z.string() }),
    handler: async (req, res) => {
      res.json(
        await c.assessments.getCandidateReport(
          currentUser(req).id,
          req.params.inviteId as string,
        ),
      );
    },
  });
}

// ================================================================ Public candidate endpoints (no auth)
export function candidateRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/:token',
    tag: 'Candidate',
    summary: 'View an assessment via invite token (candidate-facing, no auth)',
    params: z.object({ token: z.string() }),
    handler: async (req, res) => {
      res.json(await c.assessments.getByToken(req.params.token as string));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:token/start',
    tag: 'Candidate',
    summary: 'Start the assessment timer',
    params: z.object({ token: z.string() }),
    handler: async (req, res) => {
      res.json(await c.assessments.startAssessment(req.params.token as string));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:token/submit',
    tag: 'Candidate',
    summary: 'Submit assessment answers',
    params: z.object({ token: z.string() }),
    body: z.object({
      sectionResults: z.array(z.any()).min(1),
    }),
    handler: async (req, res) => {
      res.json(await c.assessments.submitAssessment(req.params.token as string, req.body));
    },
  });
}
