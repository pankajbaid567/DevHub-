import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * TOTP (RFC 6238) on HMAC-SHA1, 6 digits, 30 s steps: what Google Authenticator, 1Password,
 * Authy and friends implement. No dependency: it is ~40 lines over node:crypto.
 */
const STEP_S = 30;
const DIGITS = 6;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_S);

/** HOTP (RFC 4226) value for one counter: HMAC, dynamic truncation, modulo 10^digits. */
export function hotp(secretB32: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, '0');
}

/**
 * Returns the matched time step, or null. Accepts one step of clock drift either way, and
 * rejects steps at or before `lastStep`, so a code observed once (shoulder surfing,
 * phishing relay after use) cannot be replayed.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  lastStep: number | null,
  now = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    const expected = Buffer.from(hotp(secretB32, s));
    if (timingSafeEqual(expected, Buffer.from(code))) return s;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = 'DevHub+'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params}`;
}

/**
 * Encrypts TOTP secrets at rest with AES-256-GCM under a key derived (HKDF) from the server
 * secret, so a database dump alone does not reveal anyone's second factor.
 */
export class SecretBox {
  private readonly key: Buffer;
  constructor(serverSecret: string) {
    this.key = Buffer.from(hkdfSync('sha256', serverSecret, 'devhub-totp', 'totp-secret-v1', 32));
  }
  seal(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1.${Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url')}`;
  }
  open(sealed: string): string {
    const raw = Buffer.from(sealed.slice(3), 'base64url');
    const d = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  }
}

/** Recovery codes: 10 × "xxxx-xxxx", shown once, stored as SHA-256. */
export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const s = randomBytes(5).toString('hex');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
export const hashRecoveryCode = (code: string) =>
  createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
