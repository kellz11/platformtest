// Email delivery. Production: set SMTP_URL (smtp://user:pass@host:port) — a minimal
// SMTP client is intentionally NOT bundled; wire nodemailer in deploy (documented).
// Development: every message is stored in the email_outbox table and logged, so
// verification links are always retrievable (GET /api/dev/outbox when DEV_MAIL=1).
import { q } from '../db.js';

export function sendMail(to, subject, body) {
  q.run('INSERT INTO email_outbox (to_email, subject, body) VALUES (?,?,?)', to, subject, body);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n─── MAIL to ${to} ── ${subject}\n${body}\n───────────────\n`);
  }
  // Production hook: replace with real transport (see PLATFORM.md → Email).
}

export function appUrl(pathname = '/') {
  const base = process.env.APP_URL || 'http://localhost:8000';
  return base.replace(/\/$/, '') + pathname;
}
