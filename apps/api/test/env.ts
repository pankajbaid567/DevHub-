// Runs before every test file, before any app module is imported.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://devhub@127.0.0.1:54329/devhub_it?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-secret-0123456789abcdefghijklmnopqrstuvwxyz';
process.env.CORS_ORIGINS = 'http://localhost:5173';
delete process.env.REDIS_URL;
delete process.env.GEMINI_API_KEY;
