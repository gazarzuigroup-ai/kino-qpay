import crypto from 'node:crypto';

/**
 * Express middleware: cookie-г parse хийж req.cookies-т тавина.
 * cookie-parser package-г ашиглалгүй энгийн хэрэгжүүлэлт.
 */
export function cookieParser(req, _res, next) {
  const cookies = {};
  const header = req.headers.cookie;
  if (header) {
    header.split(';').forEach((c) => {
      const [k, ...v] = c.trim().split('=');
      cookies[k] = decodeURIComponent(v.join('='));
    });
  }
  req.cookies = cookies;
  next();
}

/**
 * Хэрэглэгчийг тодорхойлно.
 *   1. Валид psid байвал ашиглана (ManyChat Contact Id гэх мэт)
 *   2. Үгүй бол cookie-с session ID уншина
 *   3. Cookie байхгүй бол шинэ session үүсгэн cookie тавина
 */
export function resolveUserId(req, res) {
  const raw = String(req.query.psid || '').trim();
  const invalid = !raw
    || raw.startsWith('{{')
    || raw.startsWith('[')
    || raw === 'undefined'
    || raw === 'null'
    || raw.length > 128;

  if (!invalid) return raw;

  let sid = req.cookies?.kino_sid;
  if (!sid) {
    sid = 'sid_' + crypto.randomBytes(12).toString('hex');
    res.setHeader('Set-Cookie', `kino_sid=${sid}; Max-Age=${90 * 24 * 3600}; Path=/; HttpOnly; SameSite=Lax`);
  }
  return sid;
}
