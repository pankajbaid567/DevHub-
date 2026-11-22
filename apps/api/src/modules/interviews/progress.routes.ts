import { z } from 'zod';
import {
  updateProblemNoteSchema,
  upsertCpProfileSchema,
  removeCpProfileSchema,
  createWhiteboardSchema,
  updateWhiteboardSchema,
  INTERVIEW_PROBLEMS,
  SYSTEM_DESIGN_PROBLEMS,
} from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { currentUser } from '../../middleware/auth.js';

export function progressRoutes(ctx: RouteContext, c: Container): void {
  // ---------------------------------------------------------------- Problem listing

  defineRoute(ctx, {
    method: 'get',
    path: '/problems',
    tag: 'Practice',
    summary: 'List all coding and system design problems',
    auth: 'optional',
    handler: async (req, res) => {
      const user = req.user ? currentUser(req) : null;
      const progress = user ? await c.progress.listProgress(user.id) : [];
      const bookmarks = user ? await c.progress.listBookmarks(user.id) : [];
      const progressMap = new Map(progress.map((p) => [p.problemSlug, p]));
      const bookmarkSet = new Set(bookmarks.map((b) => b.problemSlug));

      const dsa = INTERVIEW_PROBLEMS.map((p) => ({
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        topics: p.topics,
        category: p.category,
        progress: progressMap.get(p.slug) ?? null,
        bookmarked: bookmarkSet.has(p.slug),
      }));

      const sd = SYSTEM_DESIGN_PROBLEMS.map((p) => ({
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        topics: p.topics,
        category: p.category,
        useWhiteboard: p.useWhiteboard,
        progress: progressMap.get(p.slug) ?? null,
        bookmarked: bookmarkSet.has(p.slug),
      }));

      res.json({ dsa, systemDesign: sd });
    },
  });

  // ---------------------------------------------------------------- User progress

  defineRoute(ctx, {
    method: 'get',
    path: '/progress',
    tag: 'Practice',
    summary: 'Your problem progress',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.progress.listProgress(currentUser(req).id));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/streak',
    tag: 'Practice',
    summary: 'Your solve streak',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.progress.getStreak(currentUser(req).id));
    },
  });

  // ---------------------------------------------------------------- Bookmarks

  defineRoute(ctx, {
    method: 'get',
    path: '/bookmarks',
    tag: 'Practice',
    summary: 'Your bookmarked problems',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.progress.listBookmarks(currentUser(req).id));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/bookmarks/:slug',
    tag: 'Practice',
    summary: 'Toggle bookmark for a problem',
    auth: 'required',
    params: z.object({ slug: z.string() }),
    handler: async (req, res) => {
      res.json(await c.progress.toggleBookmark(currentUser(req).id, req.params.slug as string));
    },
  });

  // ---------------------------------------------------------------- Notes

  defineRoute(ctx, {
    method: 'get',
    path: '/notes/:slug',
    tag: 'Practice',
    summary: 'Get your note for a problem',
    auth: 'required',
    params: z.object({ slug: z.string() }),
    handler: async (req, res) => {
      res.json(await c.progress.getNote(currentUser(req).id, req.params.slug as string));
    },
  });

  defineRoute(ctx, {
    method: 'put',
    path: '/notes/:slug',
    tag: 'Practice',
    summary: 'Save your note for a problem',
    auth: 'required',
    params: z.object({ slug: z.string() }),
    body: updateProblemNoteSchema,
    handler: async (req, res) => {
      res.json(
        await c.progress.upsertNote(currentUser(req).id, req.params.slug as string, req.body.content),
      );
    },
  });

  // ---------------------------------------------------------------- CP profiles

  defineRoute(ctx, {
    method: 'get',
    path: '/cp-profiles',
    tag: 'Practice',
    summary: 'Your linked competitive programming profiles',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.progress.listCpProfiles(currentUser(req).id));
    },
  });

  defineRoute(ctx, {
    method: 'put',
    path: '/cp-profiles',
    tag: 'Practice',
    summary: 'Link or update a competitive programming profile',
    auth: 'required',
    body: upsertCpProfileSchema,
    handler: async (req, res) => {
      res.json(
        await c.progress.upsertCpProfile(currentUser(req).id, req.body.platform, req.body.username),
      );
    },
  });

  defineRoute(ctx, {
    method: 'delete',
    path: '/cp-profiles',
    tag: 'Practice',
    summary: 'Unlink a competitive programming profile',
    auth: 'required',
    body: removeCpProfileSchema,
    handler: async (req, res) => {
      await c.progress.removeCpProfile(currentUser(req).id, req.body.platform);
      res.json({ ok: true });
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/cp-profiles/:platform/sync',
    tag: 'Practice',
    summary: 'Sync stats from a CP platform',
    auth: 'required',
    params: z.object({ platform: z.string() }),
    handler: async (req, res) => {
      res.json(
        await c.progress.syncCpProfile(currentUser(req).id, req.params.platform as any),
      );
    },
  });

  // ---------------------------------------------------------------- Badges

  defineRoute(ctx, {
    method: 'get',
    path: '/badges',
    tag: 'Practice',
    summary: 'Your earned badges',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.progress.listBadges(currentUser(req).id));
    },
  });

  // ---------------------------------------------------------------- Whiteboards

  defineRoute(ctx, {
    method: 'get',
    path: '/whiteboards',
    tag: 'Practice',
    summary: 'Your saved whiteboards',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.whiteboards.list(currentUser(req).id));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/whiteboards/:id',
    tag: 'Practice',
    summary: 'Get a whiteboard',
    auth: 'required',
    params: z.object({ id: z.string() }),
    handler: async (req, res) => {
      res.json(await c.whiteboards.get(currentUser(req).id, req.params.id as string));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/whiteboards',
    tag: 'Practice',
    summary: 'Create a whiteboard',
    auth: 'required',
    body: createWhiteboardSchema,
    handler: async (req, res) => {
      res.status(201).json(await c.whiteboards.create(currentUser(req).id, req.body));
    },
  });

  defineRoute(ctx, {
    method: 'patch',
    path: '/whiteboards/:id',
    tag: 'Practice',
    summary: 'Update a whiteboard',
    auth: 'required',
    params: z.object({ id: z.string() }),
    body: updateWhiteboardSchema,
    handler: async (req, res) => {
      res.json(await c.whiteboards.update(currentUser(req).id, req.params.id as string, req.body));
    },
  });

  defineRoute(ctx, {
    method: 'delete',
    path: '/whiteboards/:id',
    tag: 'Practice',
    summary: 'Delete a whiteboard',
    auth: 'required',
    params: z.object({ id: z.string() }),
    handler: async (req, res) => {
      await c.whiteboards.delete(currentUser(req).id, req.params.id as string);
      res.json({ ok: true });
    },
  });
}
