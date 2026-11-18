import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the real stack (API + Postgres + web). Locally they reuse
 * already-running dev servers; in CI the servers are started here.
 */
const E2E_RUNNER_TOKEN = 'e2e-runner-token-0123456789';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    // Fake camera/microphone so video calls run headlessly in CI.
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    permissions: ['camera', 'microphone'],
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Sandboxed code runner (in CI it runs unconfined; isolation is the container's job).
      command: 'npm run dev -w @devhub/runner',
      cwd: '../..',
      env: { RUNNER_TOKEN: E2E_RUNNER_TOKEN, PORT: '2000' },
      url: 'http://localhost:2000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @devhub/api',
      cwd: '../..',
      env: {
        RATE_LIMITS_ENABLED: 'false',
        CODE_RUNNER_URL: 'http://localhost:2000',
        RUNNER_TOKEN: E2E_RUNNER_TOKEN,
      },
      url: 'http://localhost:4000/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
