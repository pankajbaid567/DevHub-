import { execSync } from 'node:child_process';

/** Applies migrations to the test database once per run. */
export default function setup(): void {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://devhub:devhub@localhost:5432/devhub?schema=test';
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
