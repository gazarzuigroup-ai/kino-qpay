import { nanoid, customAlphabet } from 'nanoid';
import crypto from 'node:crypto';

// sender_invoice_no-д тусгай тэмдэгт хориотой (QPay док) — зөвхөн үсэг, тоо
const invoiceSuffix = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

export function newWatchToken() {
  return nanoid(32);
}

export function newSenderInvoiceNo() {
  return `KINO${Date.now()}${invoiceSuffix()}`;
}

/**
 * Bunny Stream token-authenticated URL үүсгэнэ.
 * Bunny-ийн Token Authentication багц дараах SHA256 hash-ыг шаарддаг:
 *   sha256(token_key + video_path + expires)
 */
export function bunnyTokenUrl({ videoId, expiresAt }) {
  const hostname = process.env.BUNNY_CDN_HOSTNAME;
  const tokenKey = process.env.BUNNY_TOKEN_KEY;
  const videoPath = `/${videoId}/playlist.m3u8`;

  const hashInput = tokenKey + videoPath + expiresAt;
  const hash = crypto
    .createHash('sha256')
    .update(hashInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `https://${hostname}${videoPath}?token=${hash}&expires=${expiresAt}`;
}
