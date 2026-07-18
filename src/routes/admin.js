import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

/**
 * GET /admin?key=<ADMIN_KEY>
 * Борлуулалтын тайлан — зөвхөн эзэнд зориулсан нууц хуудас.
 * ADMIN_KEY env тохируулаагүй бол бүрэн хаалттай.
 */
router.get('/', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.query.key !== adminKey) {
    return res.status(403).send('Хандах эрхгүй.');
  }

  const byMovie = db.prepare(`
    SELECT m.title, m.category, m.price,
           COUNT(o.id) AS sales,
           COALESCE(SUM(o.amount), 0) AS revenue
    FROM movies m
    LEFT JOIN orders o ON o.movie_id = m.id AND o.status = 'PAID'
    WHERE m.active = 1
    GROUP BY m.id
    ORDER BY sales DESC, m.title
  `).all();

  const totals = db.prepare(`
    SELECT COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS revenue
    FROM orders WHERE status = 'PAID'
  `).get();

  const pendingCount = db.prepare(`
    SELECT COUNT(*) AS c FROM orders
    WHERE status = 'PENDING' AND created_at > strftime('%s','now') - 86400
  `).get().c;

  const recent = db.prepare(`
    SELECT o.paid_at, o.amount, m.title
    FROM orders o JOIN movies m ON m.id = o.movie_id
    WHERE o.status = 'PAID'
    ORDER BY o.paid_at DESC LIMIT 20
  `).all();

  const rows = byMovie.map((r) => `
    <tr>
      <td>${escapeHtml(r.title)}</td>
      <td class="dim">${escapeHtml(r.category || '')}</td>
      <td class="num">${r.price.toLocaleString()}₮</td>
      <td class="num strong">${r.sales}</td>
      <td class="num">${r.revenue.toLocaleString()}₮</td>
    </tr>`).join('');

  const recentRows = recent.map((r) => `
    <tr>
      <td>${new Date(r.paid_at * 1000).toLocaleString('mn-MN')}</td>
      <td>${escapeHtml(r.title)}</td>
      <td class="num">${r.amount.toLocaleString()}₮</td>
    </tr>`).join('');

  return res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Борлуулалтын тайлан</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,sans-serif;background:#0b0f1a;color:#eee;min-height:100vh;padding:20px 12px}
  .wrap{max-width:760px;margin:0 auto}
  h1{font-size:20px;margin:8px 4px 20px}
  h2{font-size:15px;margin:28px 4px 10px;color:#a8b0c0}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:8px}
  .stat{background:#141a2a;border-radius:12px;padding:14px 16px}
  .stat .v{font-size:22px;font-weight:700;color:#4ade80}
  .stat .l{font-size:12px;color:#888;margin-top:2px}
  table{width:100%;border-collapse:collapse;background:#141a2a;border-radius:12px;overflow:hidden}
  th,td{padding:10px 12px;text-align:left;font-size:13px;border-bottom:1px solid #1e2638}
  th{color:#888;font-weight:600;font-size:12px}
  tr:last-child td{border-bottom:none}
  .num{text-align:right;white-space:nowrap}
  .strong{color:#4ade80;font-weight:700}
  .dim{color:#888}
  .note{color:#666;font-size:12px;margin-top:24px;text-align:center}
</style></head>
<body><div class="wrap">
  <h1>📊 Борлуулалтын тайлан</h1>

  <div class="stats">
    <div class="stat"><div class="v">${totals.revenue.toLocaleString()}₮</div><div class="l">Нийт орлого</div></div>
    <div class="stat"><div class="v">${totals.orders}</div><div class="l">Төлөгдсөн захиалга</div></div>
    <div class="stat"><div class="v">${pendingCount}</div><div class="l">Хүлээгдэж буй (24ц)</div></div>
  </div>

  <h2>Кино тус бүрээр</h2>
  <table>
    <tr><th>Кино</th><th>Ангилал</th><th class="num">Үнэ</th><th class="num">Зарагдсан</th><th class="num">Орлого</th></tr>
    ${rows}
  </table>

  <h2>Сүүлийн төлбөрүүд</h2>
  <table>
    <tr><th>Огноо</th><th>Кино</th><th class="num">Дүн</th></tr>
    ${recentRows || '<tr><td colspan="3" class="dim">Одоогоор төлбөр байхгүй</td></tr>'}
  </table>

  <div class="note">Энэ хуудасны линкийг хэнтэй ч хуваалцаж болохгүй.</div>
</div></body></html>`);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export default router;
