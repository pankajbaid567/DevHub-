import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx src/seed.ts',
  },
  // `prisma generate` (e.g. in the Docker build) needs no database, so the URL is optional here;
  // migrate commands fail with a clear error if it is missing.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
