// Runs before every test file, before any app module is imported.
// Default: the docker-compose Postgres, isolated in a separate `test` schema (demo data untouched).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://devhub:devhub@localhost:5432/devhub?schema=test';
process.env.JWT_ACCESS_SECRET = 'test-secret-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.CORS_ORIGINS = 'http://localhost:5173';
delete process.env.REDIS_URL;
delete process.env.GEMINI_API_KEY;
