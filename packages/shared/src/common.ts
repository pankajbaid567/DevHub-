import { z } from 'zod';

/** Primary keys are CUIDs: unguessable, so ids cannot be enumerated. */
export const idSchema = z.string().min(1).max(64);
export const idParamSchema = z.object({ id: idSchema });

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;

/** Offset pagination for browsable lists (questions, snippets, sessions). */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

/** Cursor pagination for append-only feeds (chat, notifications): stable under inserts. */
export const cursorQuerySchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Tags are normalised to lowercase slugs so "React" and "react" are one tag. */
export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(30)
  .regex(/^[a-z0-9][a-z0-9+#.-]*$/, 'Tags may contain letters, digits, +, #, . and -');

export const tagsSchema = z
  .array(tagSchema)
  .max(5, 'At most 5 tags')
  .transform((tags) => [...new Set(tags)]);

/** Public view of a user embedded in other resources. Never contains the email. */
export interface UserSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  reputation: number;
}

export const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'go',
  'rust',
  'cpp',
  'c',
  'csharp',
  'ruby',
  'php',
  'kotlin',
  'swift',
  'sql',
  'html',
  'css',
  'shell',
  'json',
  'yaml',
  'markdown',
] as const;
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;
