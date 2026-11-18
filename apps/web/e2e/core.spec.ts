import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signUp, uid } from './helpers';

test.describe('authentication', () => {
  test('sign up, sign out, and sign back in', async ({ page }) => {
    const name = await signUp(page);
    await expect(
      page.getByRole('heading', { name: new RegExp(`Welcome back, ${name}`) }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

    await page.goto('/login?next=/leaderboard');
    await page.getByLabel('Email').fill(`${name}@example.com`);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/leaderboard/);
  });

  test('the session survives a page reload (refresh cookie)', async ({ page }) => {
    await signUp(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  });

  test('protected pages redirect anonymous users to sign in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });
});

test('ask, answer, vote and accept: the full Q&A loop across two users', async ({ browser }) => {
  const asker = await (await browser.newContext()).newPage();
  const helper = await (await browser.newContext()).newPage();
  await signUp(asker);
  await signUp(helper);

  const title = `How do I memoise an expensive selector? ${uid()}`;
  await asker.goto('/questions/ask');
  await asker.getByLabel('Title').fill(title);
  await asker
    .getByLabel('Details')
    .fill('My Redux selector recomputes on every render even when the inputs did not change.');
  await asker.getByLabel('Tags').fill('react');
  await asker.keyboard.press('Enter');
  await asker.getByRole('button', { name: 'Post your question' }).click();
  await expect(asker.getByRole('heading', { name: title })).toBeVisible();
  const questionUrl = asker.url();

  await helper.goto(questionUrl);
  await helper
    .getByPlaceholder('Explain the solution')
    .fill('Use a memoised selector (createSelector) so it only recomputes when inputs change.');
  await helper.getByRole('button', { name: 'Post answer' }).click();
  await expect(helper.getByText('Use a memoised selector')).toBeVisible();
  await helper.getByRole('button', { name: 'Upvote' }).first().click();
  await expect(helper.getByLabel('Votes').first()).toContainText('1');

  // The asker is notified in real time and accepts the answer.
  await expect(asker.getByRole('button', { name: /Notifications, 1 unread/ })).toBeVisible();
  await asker.reload();
  await asker.getByRole('button', { name: 'Accept this answer' }).click();
  await expect(asker.getByText('Accepted answer', { exact: true })).toBeVisible();
});

test('two people edit the same session document in real time', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await signUp(host);
  await signUp(guest);

  await host.goto('/sessions/new');
  await host.getByLabel('Title').fill(`Pairing ${uid()}`);
  await host.getByRole('button', { name: 'Go live' }).click();
  await expect(host.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  const roomUrl = host.url();

  await guest.goto(roomUrl);
  await guest.getByRole('button', { name: 'Join session' }).click();
  await expect(guest.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  await expect(host.getByRole('tab', { name: 'People (2)' })).toBeVisible();

  await host.locator('.monaco-editor').click();
  await host.keyboard.type('const shared = "hello from host";');
  await expect(guest.locator('.view-lines')).toContainText('hello from host');

  await guest.locator('.monaco-editor').click();
  await guest.keyboard.press('End');
  await guest.keyboard.type(' // and guest');
  await expect(host.locator('.view-lines')).toContainText('and guest');

  await guest.getByRole('textbox', { name: 'Chat message' }).fill('Looks good!');
  await guest.getByRole('button', { name: 'Send message' }).click();
  await expect(host.getByText('Looks good!')).toBeVisible();
});

test.describe('accessibility', () => {
  for (const path of ['/', '/questions', '/snippets', '/login', '/leaderboard']) {
    test(`no serious axe violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious.map((v) => `${v.id}: ${v.nodes.length} nodes`)).toEqual([]);
    });
  }
});
