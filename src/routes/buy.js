import { Router } from 'express';
import {
  upsertUser,
  getMovieBySlug,
  createOrder,
  setOrderInvoiceId,
  getOrder,
  getExistingTokenForOrder,
} from '../db.js';
import { createInvoice } from '../qpay.js';
import { newSenderInvoiceNo } from '../utils/tokens.js';
import { resolveUserId } from '../utils/identity.js';

const router = Router();

/**
 * GET /buy/:slug?psid=<manychat_user_id>
 *
 * Facebook Messenger button-с шилжин ирэх төлбөрийн хуудас.
 * QR + банкны линкүүд үзүүлж, 3 сек тутам төлбөр орсон эсэхийг polling-оор шалгана.
 * Төлбөр орсны дараа автоматаар /watch/:token руу redirect.
 */
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const psid = resolveUserId(req, res);

    const movie = getMovieBySlug(slug);
    if (!movie) {
      return res.status(404).send(page('Кино олдсонгүй', 'Хайсан кино байхгүй эсвэл идэвхгүй болсон байна.'));
    }

    const user = upsertUser(String(psid), '');
    const senderInvoiceNo = newSenderInvoiceNo();
    const order = createOrder({
      userId: user.id,
      movieId: movie.id,
      senderInvoiceNo,
      amount: movie.price,
    });

    const invoice = await createInvoice({
      senderInvoiceNo,
      amount: movie.price,
      description: `${movie.title} - ${movie.slug}`,
      receiverCode: `user_${user.id}`,
      callbackUrl: `${process.env.PUBLIC_URL}/api/qpay/callback?order=${order.id}`,
    });

    setOrderInvoiceId(order.id, invoice.invoice_id);

    const bankButtons = (invoice.qPay_deeplink || invoice.urls || [])
      .map((u) => `<a class="bank" href="${u.link}"><img src="${u.logo}" alt="${u.name}" onerror="this.style.display='none'"><span>${u.name}</span></a>`)
      .join('');

    const qrDataUrl = invoice.qr_image
      ? `data:image/png;base64,${invoice.qr_image}`
      : `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(invoice.qr_text || '')}`;

    return res.send(paymentPage({
      order,
      movie,
      qrDataUrl,
      shortUrl: invoice.qPay_shortUrl || '',
      bankButtons,
    }));
  } catch (err) {
    console.error('buy page error:', err.response?.data || err.message);
    return res.status(500).send(page('Алдаа', 'Нэхэмжлэх үүсгэхэд алдаа гарлаа. Хэсэг хугацааны дараа дахин оролдоно уу.'));
  }
});

function baseStyle() {
  return `
    <style>
      *{box-sizing:border-box}
      body{margin:0;font-family:system-ui,sans-serif;background:#0b0f1a;color:#eee;min-height:100vh;
           display:flex;align-items:center;justify-content:center;padding:16px}
      .card{background:#141a2a;border-radius:16px;padding:24px;max-width:440px;width:100%;
            box-shadow:0 20px 60px rgba(0,0,0,.4)}
      h1{margin:0 0 4px;font-size:20px}
      .price{color:#4ade80;font-size:24px;font-weight:700;margin:8px 0 20px}
      .qr-wrap{background:#fff;border-radius:12px;padding:10px;display:flex;justify-content:center;margin:12px auto;max-width:220px}
      .qr-wrap img{max-width:200px;width:100%;height:auto;display:block}
      .banks{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:16px 0}
      .bank{background:#1c2438;border-radius:10px;padding:10px 8px;text-decoration:none;color:#eee;
            display:flex;flex-direction:column;align-items:center;gap:6px;
            font-size:11.5px;font-weight:500;line-height:1.2;text-align:center}
      .bank:hover{background:#243052}
      .bank:active{transform:scale(.98)}
      .bank img{width:32px;height:32px;object-fit:contain;border-radius:7px;background:#fff;padding:3px}
      .bank span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;color:#dfe4f0}
      .divider{text-align:center;color:#666;font-size:12px;margin:16px 0;position:relative}
      .divider::before,.divider::after{content:'';position:absolute;top:50%;width:40%;height:1px;background:#2a3348}
      .divider::before{left:0}.divider::after{right:0}
      .short{display:block;background:#4ade80;color:#0b0f1a;padding:12px;border-radius:10px;
             text-align:center;font-weight:600;text-decoration:none;margin:12px 0}
      .status{text-align:center;color:#888;font-size:13px;margin-top:16px}
      .status.paid{color:#4ade80;font-weight:600}
      .spinner{display:inline-block;width:12px;height:12px;border:2px solid #666;border-top-color:#4ade80;
               border-radius:50%;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px}
      @keyframes spin{to{transform:rotate(360deg)}}
      .btn{display:block;background:transparent;color:#888;border:1px solid #2a3348;padding:8px;
           border-radius:8px;text-align:center;font-size:12px;cursor:pointer;margin-top:8px;width:100%}
    </style>`;
}

function page(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">${baseStyle()}</head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

function paymentPage({ order, movie, qrDataUrl, shortUrl, bankButtons }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${movie.title} - Төлбөр</title>
<meta name="viewport" content="width=device-width,initial-scale=1">${baseStyle()}</head>
<body><div class="card">
  <h1>${movie.title}</h1>
  <div class="price">${movie.price.toLocaleString()}₮</div>

  ${shortUrl ? `<a class="short" href="${shortUrl}">📱 Утсаараа төлөх (банк сонгох)</a>` : ''}

  <div class="divider">эсвэл QR уншуулах</div>

  <div class="qr-wrap"><img src="${qrDataUrl}" alt="QR"></div>

  ${bankButtons ? `<div class="banks">${bankButtons}</div>` : ''}

  <div class="status" id="status"><span class="spinner"></span>Төлбөрийг хүлээж байна...</div>
  <button class="btn" onclick="check()">Одоо шалгах</button>
</div>
<script>
  const orderId = ${order.id};
  const statusEl = document.getElementById('status');
  let done = false;

  async function check() {
    if (done) return;
    try {
      const r = await fetch('/api/order/' + orderId + '/status');
      const d = await r.json();
      if (d.status === 'PAID' && d.watch_url) {
        done = true;
        statusEl.className = 'status paid';
        statusEl.textContent = '✓ Төлбөр амжилттай! Кино руу шилжиж байна...';
        setTimeout(() => { location.href = d.watch_url; }, 800);
      }
    } catch (e) { console.error(e); }
  }

  const interval = setInterval(() => {
    if (done) return clearInterval(interval);
    check();
  }, 3000);
  check();
</script>
</body></html>`;
}

export default router;
