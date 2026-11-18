import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { signUp } from './helpers';

/** Mailpit (docker compose / CI service) captures every email the app sends. */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

async function mailpitUp(request: APIRequestContext) {
  return request
    .get(`${MAILPIT}/api/v1/messages`)
    .then((r) => r.ok())
    .catch(() => false);
}

/** Polls Mailpit for the newest email to `to` whose body contains `path`, returns the link. */
async function linkFromEmail(request: APIRequestContext, to: string, path: string) {
  for (let i = 0; i < 40; i++) {
    const list = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${to}` } });
    const { messages } = (await list.json()) as { messages: { ID: string }[] };
    for (const m of messages) {
      const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      const match = msg.Text.match(new RegExp(`https?://\\S+${path}\\?token=[\\w-]+`));
      if (match) return new URL(match[0]).pathname + new URL(match[0]).search;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${path} email for ${to}`);
}

test.describe('email flows (outbox → queue → SMTP)', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await mailpitUp(request)), 'Mailpit is not running');
  });

  test('verify the email address from the welcome email', async ({ page, request }) => {
    const name = await signUp(page);
    await expect(page.getByText(/Confirm .* to get email notifications/)).toBeVisible();
    const link = await linkFromEmail(request, `${name}@example.com`, '/verify-email');
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByText(/Confirm .* to get email notifications/)).toHaveCount(0);
  });

  test('reset a forgotten password and sign in with the new one', async ({ page, request }) => {
    const name = await signUp(page);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
    await page.getByLabel('Email').fill(`${name}@example.com`);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

    await page.goto(await linkFromEmail(request, `${name}@example.com`, '/reset-password'));
    await page.getByLabel('New password').fill('brandnew123');
    await page.getByLabel('Confirm password').fill('brandnew123');
    await page.getByRole('button', { name: 'Set password' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to DevHub+' })).toBeVisible();
    await page.getByLabel('Email').fill(`${name}@example.com`);
    await page.getByLabel('Password').fill('brandnew123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('semantic search', () => {
  test('warns about a likely duplicate while asking', async ({ page }) => {
    await signUp(page);
    await page.goto('/questions/ask');
    await page.getByLabel('Title').fill('Postgres query is slow although the column has an index');
    const hint = page.getByRole('status').filter({ hasText: 'These look similar' });
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await expect(hint.getByRole('link', { name: /Postgres query slow/i })).toBeVisible();
  });

  test('hybrid search finds results by meaning and says how they matched', async ({ page }) => {
    await page.goto('/search?q=debounce');
    const results = page.getByRole('main').getByRole('listitem');
    await expect(results.first()).toBeVisible();
    await expect(results.first().getByText('words')).toBeVisible();
    await expect(page.getByText(/keyword \+ semantic/)).toBeVisible();
  });

  test('the AI mentor cites community answers', async ({ page }) => {
    await signUp(page);
    await page.goto('/mentor');
    await page.getByRole('button', { name: /General/ }).click();
    await page
      .getByLabel('Message the mentor')
      .fill('Should I use optimistic or pessimistic locking for seat booking?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const sources = page.getByText(/community sources?/);
    await expect(sources).toBeVisible({ timeout: 30_000 });
    await sources.click();
    await expect(page.getByRole('link', { name: /seat-booking/i }).first()).toBeVisible();
  });
});

test.describe('accessibility of new pages', () => {
  for (const path of ['/forgot-password', '/search?q=redis', '/reset-password?token=x']) {
    test(`${path} has no serious axe violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
