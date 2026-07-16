import { Router } from 'express';
import { db } from '../db.js';
import { bunnyThumbUrl } from '../utils/tokens.js';
import { resolveUserId } from '../utils/identity.js';
import { reconcilePendingOrders, getOwnedTokensBySlug } from '../utils/orders.js';
import { siteNav, siteNavStyle } from '../utils/ui.js';

const router = Router();

/**
 * GET /movies
 * Бүх идэвхтэй киног гүйлгэдэг картанд харуулна.
 * Хэрэглэгчийн авсан кино дээр "Үзэх" товч гарна (шинэ нэхэмжлэх үүсгэхгүй).
 */
router.get('/', async (req, res) => {
  const psid = resolveUserId(req, res);

  // Банкны аппаар төлөөд буцаж ирсэн хэрэглэгчийн төлбөрийг энд барьж авна
  try {
    await reconcilePendingOrders(String(psid));
  } catch (e) {
    console.error('catalog reconcile error:', e.message);
  }
  const owned = getOwnedTokensBySlug(String(psid));

  const movies = db.prepare('SELECT * FROM movies WHERE active = 1 ORDER BY id DESC').all();

  const cards = movies.map((m) => {
    const thumb = bunnyThumbUrl(m.bunny_video_id);
    const description = m.description ? `<div class="desc">${escapeHtml(m.description)}</div>` : '';
    const duration = m.duration ? `<div class="meta">⏱ ${escapeHtml(m.duration)}</div>` : '';
    const own = owned.get(m.slug);
    const href = own ? `/watch/${own.token}` : `/buy/${m.slug}`;
    const badge = own
      ? '<div class="badge owned">✓ Авсан</div>'
      : `<div class="badge">${m.price.toLocaleString()}₮</div>`;
    const action = own
      ? '<div class="buy watch-now">▶ Үзэх</div>'
      : '<div class="buy">🛒 Худалдаж авах</div>';
    return `
      <a class="card" href="${href}">
        <div class="poster" style="background-image:url('${thumb}')">
          ${badge}
        </div>
        <div class="info">
          <div class="title">${escapeHtml(m.title)}</div>
          ${duration}
          ${description}
          ${action}
        </div>
      </a>`;
  }).join('');

  const empty = movies.length === 0
    ? '<div class="empty">Одоогоор кино байхгүй байна.</div>'
    : '';

  return res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Кино каталог</title>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,sans-serif;background:#0b0f1a;color:#eee;min-height:100vh;padding:20px 12px}
  .wrap{max-width:1200px;margin:0 auto}
  h1{margin:8px 4px 20px;font-size:22px;font-weight:700}
  .subtitle{color:#888;font-size:13px;margin:-16px 4px 20px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
  @media(min-width:640px){.grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px}}
  .card{background:#141a2a;border-radius:14px;overflow:hidden;text-decoration:none;color:#eee;
        display:flex;flex-direction:column;transition:transform .15s, background .15s}
  .card:hover{background:#1a2338;transform:translateY(-2px)}
  .card:active{transform:scale(.98)}
  .poster{aspect-ratio:2/3;background-size:cover;background-position:center;background-color:#22283a;
          position:relative}
  .badge{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.7);color:#4ade80;
         padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;backdrop-filter:blur(6px)}
  .badge.owned{background:rgba(74,222,128,.9);color:#0b0f1a}
  .info{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px}
  .title{font-size:14px;font-weight:600;line-height:1.3;
         display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .meta{font-size:11px;color:#888}
  .desc{font-size:11.5px;color:#a8b0c0;line-height:1.4;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
        margin-bottom:4px}
  .buy{font-size:11px;color:#4ade80;font-weight:500;margin-top:auto}
  .buy.watch-now{font-size:12px;font-weight:700}
  .empty{background:#141a2a;border-radius:12px;padding:40px;text-align:center;color:#888}
  ${siteNavStyle()}
</style></head>
<body>
  <div class="wrap">
    ${siteNav('catalog')}
    <h1>🎬 Кино каталог</h1>
    <div class="subtitle">Хүссэн киногоо сонгож дар</div>
    <div class="grid">${cards}${empty}</div>
  </div>
</body></html>`);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default router;
