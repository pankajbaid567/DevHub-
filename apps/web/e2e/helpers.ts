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

/** RFC 6238 TOTP for tests (same algorithm as authenticator apps). */
export async function totp(secretB32: string, stepOffset = 0): Promise<string> {
  const { createHmac } = await import('node:crypto');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of secretB32) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset));
  const mac = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = mac[mac.length - 1]! & 15;
  return String((mac.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
