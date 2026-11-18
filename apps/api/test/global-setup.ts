import { execSync } from 'node:child_process';

/** Applies migrations to the test database once per run. */
export default function setup(): void {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://devhub@127.0.0.1:54329/devhub_it?schema=public';
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
