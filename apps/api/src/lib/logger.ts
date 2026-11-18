import { pino } from 'pino';
import { env } from '../config/env.js';

/**
 * Structured JSON logs in production (ready for Loki/Datadog/CloudWatch), pretty output
 * in development. Credentials and tokens are redacted wherever they appear.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'devhub-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  ...(env.isProd || env.isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }),
});

export type Logger = typeof logger;
