import { expect, type Page } from '@playwright/test';

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Registers a fresh user through the UI and lands on the dashboard. */
export async function signUp(page: Page, name = `e2e_${uid()}`) {
  await page.goto('/register');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Email').fill(`${name}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return name;
}
