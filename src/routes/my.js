import { Router } from 'express';
import { getUserPaidOrdersWithTokens } from '../db.js';
import { resolveUserId } from '../utils/identity.js';
import { reconcilePendingOrders } from '../utils/orders.js';
import { siteNav, siteNavStyle } from '../utils/ui.js';

const router = Router();

/**
 * GET /my-movies?psid=<manychat_user_id>
 *
 * Тухайн хэрэглэгчийн төлбөр төлсөн бүх киног жагсаана.
 * Watch линк, хугацаа дуусах болон үзэлтийн статус харуулна.
 * PENDING захиалгуудыг мөн QPay-ээс шалгаж эргэлт хийнэ.
 */
router.get('/', async (req, res) => {
  const psid = resolveUserId(req, res);

  await reconcilePendingOrders(psid);

  const orders = getUserPaidOrdersWithTokens(psid);

  if (orders.length === 0) {
    return res.send(emptyPage());
  }

  const now = Math.floor(Date.now() / 1000);
  const cards = orders.map((o) => {
    const expired = !o.token || o.expires_at < now;
    const remainingHours = o.token ? Math.max(0, Math.floor((o.expires_at - now) / 3600)) : 0;
    const paidDate = new Date(o.paid_at * 1000).toLocaleDateString('mn-MN');

    return `
      <div class="movie ${expired ? 'expired' : ''}">
        <div class="info">
          <div class="title">${o.title}</div>
          <div class="meta">Худалдан авсан: ${paidDate}</div>
          ${!expired ? `<div class="meta">Линк ${remainingHours} цаг хүчинтэй · ${o.view_count} удаа үзсэн</div>` : '<div class="meta expired-text">Линкийн хугацаа дуусжээ</div>'}
        </div>
        ${!expired
          ? `<a class="btn watch" href="/watch/${o.token}">▶ Үзэх</a>`
          : `<a class="btn rebuy" href="/buy/${o.slug}?psid=${encodeURIComponent(psid)}">Дахин авах</a>`}
      </div>`;
  }).join('');

  return res.send(listPage(cards));
});

function baseStyle() {
  return `<style>
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,sans-serif;background:#0b0f1a;color:#eee;min-height:100vh;padding:16px}
    .container{max-width:520px;margin:0 auto}
    h1{margin:16px 0 20px;font-size:22px}
    .movie{background:#141a2a;border-radius:12px;padding:16px;margin-bottom:12px;
           display:flex;align-items:center;gap:12px;transition:background .15s}
    .movie:hover{background:#1a2338}
    .movie.expired{opacity:.5}
    .info{flex:1;min-width:0}
    .title{font-size:16px;font-weight:600;margin-bottom:4px}
    .meta{font-size:12px;color:#888;margin-top:2px}
    .expired-text{color:#f97316}
    .btn{padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:500;font-size:13px;
         white-space:nowrap;display:inline-block}
    .btn.watch{background:#4ade80;color:#0b0f1a}
    .btn.rebuy{background:transparent;color:#888;border:1px solid #2a3348}
    .empty{background:#141a2a;border-radius:12px;padding:40px 24px;text-align:center;color:#888}
    .empty h2{color:#eee;margin:0 0 8px;font-size:18px}
    ${siteNavStyle()}
  </style>`;
}

function listPage(cards) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Миний авсан кино</title>
<meta name="viewport" content="width=device-width,initial-scale=1">${baseStyle()}</head>
<body><div class="container">
  ${siteNav('my')}
  <h1>🎬 Миний авсан кино</h1>
  ${cards}
</div></body></html>`;
}

function emptyPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Миний кино</title>
<meta name="viewport" content="width=device-width,initial-scale=1">${baseStyle()}</head>
<body><div class="container">
  ${siteNav('my')}
  <h1>🎬 Миний авсан кино</h1>
  <div class="empty">
    <h2>Одоогоор кино авч аваагүй байна</h2>
    <p>Хэрэв та саяхан төлбөр хийсэн бол 30 секундын дараа энэ хуудсыг дахин ачаална уу.</p>
    <a class="btn watch" href="/movies" style="margin-top:16px">🎬 Каталогоос кино сонгох</a>
    <button class="btn rebuy" onclick="location.reload()" style="margin-top:16px;margin-left:8px;cursor:pointer;background:transparent">🔄 Дахин шалгах</button>
  </div>
</div></body></html>`;
}

function errorPage(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">${baseStyle()}</head>
<body><div class="container"><h1>${title}</h1><div class="empty"><p>${message}</p></div></div></body></html>`;
}

export default router;
