import type { EmailMessage } from './mailer.js';

/** Escapes text for HTML email bodies (usernames and titles are user-controlled). */
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );

function layout(heading: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2328">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:12px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td style="font-weight:700;font-size:18px;color:#4f46e5;padding-bottom:16px">DevHub+</td></tr>
<tr><td style="font-size:20px;font-weight:600;padding-bottom:12px">${esc(heading)}</td></tr>
${paragraphs.map((p) => `<tr><td style="font-size:15px;line-height:1.6;padding-bottom:12px">${esc(p)}</td></tr>`).join('')}
${
  cta
    ? `<tr><td style="padding:12px 0 20px"><a href="${esc(cta.url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${esc(cta.label)}</a></td></tr>
<tr><td style="font-size:12px;color:#57606a;word-break:break-all">Or paste this link into your browser: ${esc(cta.url)}</td></tr>`
    : ''
}
</table></td></tr></table></body></html>`;
  const text = [heading, '', ...paragraphs, ...(cta ? ['', `${cta.label}: ${cta.url}`] : [])].join(
    '\n',
  );
  return { html, text };
}

export const emails = {
  verifyEmail(to: string, name: string, url: string): EmailMessage {
    return {
      to,
      subject: 'Confirm your DevHub+ email',
      ...layout(
        `Welcome, ${name}!`,
        [
          'Confirm your email address to turn on email notifications.',
          'The link expires in 24 hours.',
        ],
        { label: 'Confirm email', url },
      ),
    };
  },

  resetPassword(to: string, name: string, url: string): EmailMessage {
    return {
      to,
      subject: 'Reset your DevHub+ password',
      ...layout(
        'Reset your password',
        [
          `Hi ${name}, someone (hopefully you) asked to reset your password.`,
          'The link expires in 30 minutes and works once. If you did not ask for this, ignore this email: your password is unchanged.',
        ],
        { label: 'Choose a new password', url },
      ),
    };
  },

  notification(to: string, actor: string, message: string, url: string): EmailMessage {
    return {
      to,
      subject: `${actor} ${message}`.slice(0, 140),
      ...layout(
        `${actor} ${message}`,
        ['You can turn these emails off in your profile settings.'],
        {
          label: 'Open DevHub+',
          url,
        },
      ),
    };
  },
};
