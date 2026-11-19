import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { signUp, totp } from './helpers';

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

test('running code in a session shows the same output to every participant', async ({
  browser,
  request,
}) => {
  const status = await request.get('/api/v1/sessions?limit=1');
  test.skip(!status.ok(), 'API not reachable');
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await signUp(host);
  await signUp(guest);

  await host.goto('/sessions/new');
  await host.getByLabel('Title').fill(`Run ${Date.now()}`);
  await host.getByRole('button', { name: 'Go live' }).click();
  await expect(host.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  const enabled = await host
    .getByText('Code execution is not configured')
    .isVisible({ timeout: 3_000 })
    .catch(() => false);
  test.skip(enabled, 'No code runner configured');

  await guest.goto(host.url());
  await guest.getByRole('button', { name: 'Join session' }).click();
  await expect(guest.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });

  await host.locator('.monaco-editor').click();
  await host.keyboard.type('console.log([1, 2, 3].map((n) => n * 7).join("-"))');
  await expect(guest.locator('.view-lines')).toContainText('n * 7');
  await host.getByLabel('Run as language').selectOption('javascript');
  await host.getByRole('button', { name: 'Run', exact: true }).click();

  for (const page of [host, guest]) {
    const output = page.getByRole('region', { name: 'Run output' });
    await expect(output.getByText('7-14-21')).toBeVisible({ timeout: 20_000 });
    await expect(output.getByText('Exited 0')).toBeVisible();
  }
});

test('a session can be replayed: the code is rebuilt from the recorded edits', async ({ page }) => {
  await signUp(page);
  await page.goto('/sessions/new');
  await page.getByLabel('Title').fill(`Recorded pairing ${Date.now()}`);
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'People (1)' })).toBeVisible(); // joined the room
  await page.waitForTimeout(1_000);
  await page.locator('.monaco-editor').click();
  await page.keyboard.type('const first = 1;');
  await page.waitForTimeout(1_200); // a separate coalescing window
  await page.keyboard.type(' const second = 2;');
  await page.waitForTimeout(1_500); // recorder flushes every second

  await page.getByRole('link', { name: 'Replay', exact: true }).click();
  await expect(page.getByText(/\d+ recorded edits/)).toBeVisible();
  // The start of the timeline shows an early state of the document, not the final one.
  await expect(page.locator('.view-lines')).toContainText('c');
  await expect(page.locator('.view-lines')).not.toContainText('second');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('.view-lines')).toContainText('const second = 2;', { timeout: 15_000 });
});

test('two-factor authentication: enrol with a QR code, then sign in with a code', async ({
  page,
}) => {
  const name = await signUp(page);
  await page.goto(`/u/${name}?tab=account`);
  await page.getByRole('button', { name: 'Set up two-factor authentication' }).click();
  await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
  const secret = (await page
    .locator('code')
    .filter({ hasText: /^[A-Z2-7]{32}$/ })
    .textContent())!;
  await page.getByLabel('Code from the app').fill(await totp(secret));
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(
    page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem'),
  ).toHaveCount(10);
  await page.getByRole('button', { name: 'I saved them' }).click();
  await expect(page.getByText('on', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/login');
  await page.getByLabel('Email').fill(`${name}@example.com`);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible();
  await page.getByLabel('Authentication code').fill(await totp(secret, 1)); // enrolment used this step
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('a reported answer reaches the admin queue with an AI verdict and can be removed', async ({
  browser,
}) => {
  const author = await (await browser.newContext()).newPage();
  const reporter = await (await browser.newContext()).newPage();
  const adminPage = await (await browser.newContext()).newPage();
  await signUp(author);
  await signUp(reporter);

  const title = `Spam target ${Date.now()}`;
  await author.goto('/questions/ask');
  await author.getByLabel('Title').fill(title);
  await author
    .getByLabel('Details')
    .fill('Cheap crypto signals, buy now! Click here for free money today.');
  await author.getByLabel('Tags').fill('spam');
  await author.keyboard.press('Enter');
  await author.getByRole('button', { name: 'Post your question' }).click();
  await expect(author.getByRole('heading', { name: title })).toBeVisible();

  await reporter.goto(author.url());
  await reporter.getByRole('button', { name: 'Report this question' }).click();
  await reporter.getByLabel('Spam or self-promotion').check();
  await reporter.getByRole('button', { name: 'Send report' }).click();
  await expect(reporter.getByText('A moderator will review it')).toBeVisible();

  // The seeded demo account is an admin.
  await adminPage.goto('/login');
  await adminPage.getByLabel('Email').fill('ada@devhub.dev');
  await adminPage.getByLabel('Password').fill('password123');
  await adminPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(adminPage).toHaveURL(/\/dashboard/);
  await adminPage.goto('/admin/moderation');
  const card = adminPage
    .locator('div')
    .filter({ has: adminPage.getByRole('link', { name: title }) })
    .last();
  await expect(card.getByText('Likely violation')).toBeVisible({ timeout: 30_000 }); // queue refreshes every 15 s
  await card.getByRole('button', { name: 'Remove content' }).click();
  await expect(adminPage.getByText(/Removed \(1 report closed\)/)).toBeVisible();
  await author.reload();
  await expect(author.getByText(/not found/i)).toBeVisible();
});

test('mock interview: the problem stays hidden until the clock starts, notes stay private', async ({
  browser,
}) => {
  const interviewer = await (await browser.newContext()).newPage();
  const candidate = await (await browser.newContext()).newPage();
  await signUp(interviewer);
  await signUp(candidate);

  await interviewer.goto('/sessions/new?mode=interview');
  await expect(interviewer.getByRole('heading', { name: 'Set up a mock interview' })).toBeVisible();
  await interviewer.getByLabel('Title').fill(`Interview ${Date.now()}`);
  await interviewer.getByRole('radio', { name: /LRU Cache/ }).click();
  await interviewer.getByLabel('Duration (minutes)').fill('30');
  await interviewer.getByRole('button', { name: 'Go live' }).click();
  await expect(interviewer.getByRole('heading', { name: 'LRU Cache' })).toBeVisible();
  await expect(interviewer.getByRole('timer')).toHaveAccessibleName(/not started, 30 minutes/);

  await candidate.goto(interviewer.url());
  await candidate.getByRole('button', { name: 'Join session' }).click();
  await expect(
    candidate.getByText('The problem appears when the interviewer starts'),
  ).toBeVisible();
  await expect(candidate.getByRole('heading', { name: 'LRU Cache' })).toHaveCount(0);
  await expect(candidate.getByLabel('Private interviewer notes')).toHaveCount(0);

  // Private notes autosave.
  await interviewer.getByLabel('Private interviewer notes').fill('Asked about capacity first.');
  await interviewer
    .getByRole('radiogroup', { name: 'Communication' })
    .getByRole('radio', { name: '3 of 4' })
    .click();
  await expect(interviewer.getByText('Saved', { exact: true })).toBeVisible();

  // Starting reveals the problem and starts the same clock for both, live.
  await interviewer.getByRole('button', { name: 'Start interview' }).click();
  await expect(candidate.getByRole('heading', { name: 'LRU Cache' })).toBeVisible();
  await expect(candidate.getByRole('timer')).toHaveAccessibleName(/^(29|30):\d\d left$/);
  await interviewer.getByRole('button', { name: '5 min' }).click();
  await expect(candidate.getByRole('timer')).toHaveAccessibleName(/^3[45]:\d\d left$/);
  await expect(candidate.getByText('Asked about capacity first.')).toHaveCount(0);

  await interviewer.reload();
  await expect(interviewer.getByLabel('Private interviewer notes')).toHaveValue(
    'Asked about capacity first.',
  );
  await interviewer.getByRole('button', { name: 'End interview' }).click();
  await expect(candidate.getByRole('timer')).toHaveText('Ended');
});

test('practice: starter code runs against hidden tests, and the result shows in the history', async ({
  page,
  request,
}) => {
  const status = await request.get('/api/v1/sessions?limit=1');
  test.skip(!status.ok(), 'API not reachable');
  await signUp(page);
  await page.goto('/sessions/new?mode=interview');
  const title = `Practice ${Date.now()}`;
  await page.getByLabel('Title').fill(title);
  await page.getByRole('radio', { name: /Merge Intervals/ }).click();
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'People (1)' })).toBeVisible();

  await page.getByLabel('Test language').selectOption('javascript');
  await page.getByRole('button', { name: 'Use starter code' }).click();
  await expect(page.locator('.view-lines')).toContainText('function merge(intervals)');
  await page.getByRole('button', { name: 'Run tests' }).click();
  const results = page.getByRole('list', { name: 'Test results' });
  await expect(results).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Some tests failed')).toBeVisible();
  await expect(results.getByText('Example 1')).toBeVisible();
  await expect(results.getByText(/Hidden test \d/).first()).toBeVisible();
  await expect(results.getByText('Expected').first()).toBeVisible(); // visible tests show the data

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('link', { name: 'My interviews' }).click();
  await expect(page.getByRole('heading', { name: 'Your interviews' })).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row.getByText('Practice', { exact: true })).toBeVisible();
  await expect(row.getByText('0/6')).toBeVisible();
  await row.getByRole('link', { name: `Replay ${title}` }).click();
  await expect(page).toHaveURL(/\/replay$/);
});
