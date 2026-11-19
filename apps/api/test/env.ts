// Runs before every test file, before any app module is imported.
// Default: the docker-compose Postgres, in a separate `devhub_test` database (demo data untouched).
process.env.NODE_ENV = 'test';
// config/env.ts imports dotenv/config: without this, a developer's apps/api/.env would refill
// the variables deleted below (a real Gemini key made local runs call Google).
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env';
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://devhub:devhub@localhost:5432/devhub_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-secret-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.CORS_ORIGINS = 'http://localhost:5173';
delete process.env.REDIS_URL;
delete process.env.GEMINI_API_KEY;
