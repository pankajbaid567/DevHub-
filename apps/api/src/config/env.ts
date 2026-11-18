import 'dotenv/config';
import { z } from 'zod';

/**
 * All configuration is read and validated once at startup. A missing or weak secret
 * fails fast with a readable message instead of surfacing later as a 500.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().url(),
    /** Optional. Without Redis the app runs single-instance with in-memory cache/limits. */
    REDIS_URL: z.string().url().optional(),

    /** Comma-separated list of allowed browser origins. */
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((s) =>
        s
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    /** Set to true behind HTTPS so the refresh cookie is Secure. */
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    /** Number of reverse proxies in front of the app (for correct client IPs). */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
    GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash-lite'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(45_000),
    /** Comma-separated STUN URLs for WebRTC calls. */
    STUN_URLS: z
      .string()
      .default('stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
      .transform((s) =>
        s
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean),
      ),
    /** Optional TURN relay for users behind strict NATs (needed in many corporate networks). */
    TURN_URL: z.string().optional(),
    TURN_USERNAME: z.string().optional(),
    TURN_CREDENTIAL: z.string().optional(),
    AI_REQUESTS_PER_HOUR: z.coerce.number().int().min(1).max(1_000).default(30),
    /** Disable only for local load/E2E testing; refused in production. */
    RATE_LIMITS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .transform((e) => ({
    ...e,
    isProd: e.NODE_ENV === 'production',
    isTest: e.NODE_ENV === 'test',
    cookieSecure: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
    aiEnabled: Boolean(e.GEMINI_API_KEY && !e.GEMINI_API_KEY.startsWith('your-')),
  }));

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  if (parsed.data.isProd && !parsed.data.RATE_LIMITS_ENABLED) {
    throw new Error('RATE_LIMITS_ENABLED=false is not allowed in production');
  }
  if (parsed.data.isProd && parsed.data.JWT_ACCESS_SECRET.includes('change-me')) {
    throw new Error('JWT_ACCESS_SECRET still has its placeholder value');
  }
  return parsed.data;
}

export const env = loadEnv();
