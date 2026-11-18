import { z } from 'zod';
import {
  languageSchema,
  pageQuerySchema,
  tagSchema,
  tagsSchema,
  type UserSummary,
} from './common.js';

export const SNIPPET_VISIBILITIES = ['PUBLIC', 'UNLISTED', 'PRIVATE'] as const;
export type SnippetVisibility = (typeof SNIPPET_VISIBILITIES)[number];

export const listSnippetsQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  language: languageSchema.optional(),
  tag: tagSchema.optional(),
  sort: z.enum(['newest', 'stars']).default('newest'),
  author: z.string().trim().max(24).optional(),
});
export type ListSnippetsQuery = z.infer<typeof listSnippetsQuerySchema>;

export const createSnippetSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1_000).default(''),
  code: z.string().min(1, 'Code is required').max(50_000),
  language: languageSchema,
  tags: tagsSchema.default([]),
  visibility: z.enum(SNIPPET_VISIBILITIES).default('PUBLIC'),
});
export type CreateSnippetInput = z.input<typeof createSnippetSchema>;

export const updateSnippetSchema = createSnippetSchema.partial();
export type UpdateSnippetInput = z.input<typeof updateSnippetSchema>;

export interface SnippetDto {
  id: string;
  title: string;
  description: string;
  code: string;
  language: string;
  tags: string[];
  visibility: SnippetVisibility;
  starCount: number;
  forkCount: number;
  starredByMe: boolean;
  forkedFrom: { id: string; title: string } | null;
  author: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export type SnippetSummaryDto = Omit<SnippetDto, 'code'> & { preview: string };
