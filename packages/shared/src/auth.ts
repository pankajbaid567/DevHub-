import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(24, 'At most 24 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Letters, digits and underscores only')
  .transform((u) => u.toLowerCase());

/**
 * NIST SP 800-63B style: length over composition rules, with a sane upper bound
 * (bcrypt only uses the first 72 bytes).
 */
export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use at least one letter and one digit');

export const emailSchema = z.email('Enter a valid email').trim().toLowerCase().max(254);

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(50).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

const tokenSchema = z.string().trim().min(20).max(200);

export const verifyEmailSchema = z.object({ token: tokenSchema });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  /** Not required for accounts created through GitHub/Google that have no password yet. */
  currentPassword: z.string().max(72).optional(),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const OAUTH_PROVIDERS = ['github', 'google'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Which sign-in providers the server has credentials for. */
export type AuthProvidersDto = Record<OAuthProvider, boolean>;

export type Role = 'USER' | 'ADMIN';

/** The signed-in user's own view; includes the email (never exposed to others). */
export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  reputation: number;
  role: Role;
  createdAt: string;
  emailVerified: boolean;
  /** False for GitHub/Google-only accounts (they can set one with "forgot password"). */
  hasPassword: boolean;
  emailNotifications: boolean;
  /** Linked sign-in providers. */
  providers: OAuthProvider[];
}

/**
 * The access token is returned in the body and kept in memory by the client.
 * The refresh token is never visible to JavaScript: it lives in an httpOnly cookie.
 */
export interface AuthResponse {
  user: CurrentUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}
