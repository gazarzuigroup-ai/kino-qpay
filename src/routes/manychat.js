import { Router } from 'express';
import {
  upsertUser,
  getMovieBySlug,
  createOrder,
  setOrderInvoiceId,
  getOrder,
  getExistingTokenForOrder,
  markOrderPaid,
  createWatchToken,
} from '../db.js';
import { createInvoice, checkPayment, createEbarimt } from '../qpay.js';
import { newSenderInvoiceNo, newWatchToken } from '../utils/tokens.js';

const router = Router();

/**
 * ManyChat External Request v2 хариултын форматлагч.
 * https://help.manychat.com/hc/en-us/articles/1500002140742
 */
function mcResponse({ messages = [], actions = [], quickReplies = [] }) {
  return {
    version: 'v2',
    content: {
      messages,
      actions,
      quick_replies: quickReplies,
    },
  };
}

function textMessage(text) {
  return { type: 'text', text };
}

function imageMessage(url) {
  return { type: 'image', url };
}

function setField(name, value) {
  return { action: 'set_field_value', field_name: name, value };
}

/**
 * POST /api/manychat/create-invoice
 *
 * ManyChat External Request-ээс дуудна. Body-д дараах custom field-үүд хэрэгтэй:
 *   { manychat_id, name, movie_slug }
 *
 * Хариу нь ManyChat-т:
 *   - QR зурган мессеж
 *   - qpay_invoice_id, order_id-г custom field болгож хадгална
 *   - Банкны апп-ын deeplink жагсаалт
 */
router.post('/create-invoice', async (req, res) => {
  try {
    const { manychat_id, name, movie_slug } = req.body ?? {};
    if (!manychat_id || !movie_slug) {
      return res.status(400).json(mcResponse({
        messages: [textMessage('Захиалга үүсгэхэд алдаа гарлаа. Админд хандана уу.')],
      }));
    }

    const movie = getMovieBySlug(movie_slug);
    if (!movie) {
      return res.json(mcResponse({
        messages: [textMessage('Уучлаарай, энэ кино олдсонгүй.')],
      }));
    }

    const user = upsertUser(manychat_id, name || '');
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

    // QPay qr_image нь base64 тул Messenger-т шууд илгээх боломжгүй —
    // qr_text-ээс QR зураг үүсгэдэг үйлчилгээ ашиглана.
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(invoice.qr_text)}`;

    // qPay_shortUrl: бүх банкны апп сонгох хуудас — Messenger дотор
    // хамгийн эвтэйхэн. Утсаараа дархад банкаа сонгоод шууд төлнө.
    const payLink = invoice.qPay_shortUrl || '';

    return res.json(mcResponse({
      messages: [
        textMessage(`"${movie.title}" - ${movie.price.toLocaleString()}₮\n\nУтсаараа бол доорх линк дээр дарж банкаа сонгоод төлнө үү:\n${payLink}`),
        imageMessage(qrImageUrl),
        textMessage('Компьютерээс бол дээрх QR-г банкны аппаараа уншуулна уу.\n\nТөлбөр төлсний дараа "Төлсөн" товч дарна уу.'),
      ],
      actions: [
        setField('order_id', String(order.id)),
        setField('qpay_invoice_id', invoice.invoice_id),
      ],
    }));
  } catch (err) {
    console.error('create-invoice error:', err.response?.data || err.message);
    return res.status(500).json(mcResponse({
      messages: [textMessage('Систем алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.')],
    }));
  }
});

/**
 * POST /api/manychat/check-payment
 *
 * Хэрэглэгч "Төлсөн" товч дарахад ManyChat дуудна.
 * Body: { order_id }
 */
router.post('/check-payment', async (req, res) => {
  try {
    const { order_id } = req.body ?? {};
    const order = getOrder(Number(order_id));
    if (!order) {
      return res.json(mcResponse({
        messages: [textMessage('Захиалга олдсонгүй.')],
      }));
    }

    if (order.status !== 'PAID') {
      // Callback хүрээгүй бол QPay-ээс өөрөө шалгах
      try {
        const result = await checkPayment(order.qpay_invoice_id);
        if (result.count > 0 && result.paid_amount >= order.amount) {
          markOrderPaid(order.id);
          if (!getExistingTokenForOrder(order.id)) {
            const ttlSec = Number(process.env.WATCH_TOKEN_TTL_HOURS) * 3600;
            createWatchToken({
              token: newWatchToken(),
              orderId: order.id,
              expiresAt: Math.floor(Date.now() / 1000) + ttlSec,
            });
          }
          if (process.env.EBARIMT_ENABLED === 'true' && result.rows?.[0]?.payment_id) {
            createEbarimt(result.rows[0].payment_id).catch((e) =>
              console.error('ebarimt error:', e.response?.data || e.message),
            );
          }
        }
      } catch (e) {
        console.error('QPay check error:', e.response?.data || e.message);
      }
    }

    const fresh = getOrder(Number(order_id));
    if (fresh.status !== 'PAID') {
      return res.json(mcResponse({
        messages: [textMessage('Төлбөр хараахан батлагдаагүй байна. Банкны гүйлгээ 1-2 минут саатах тохиолдол бий. Дахин шалгах бол "Төлсөн" товчийг дарна уу.')],
      }));
    }

    const tokenRow = getExistingTokenForOrder(order.id);
    const watchUrl = `${process.env.PUBLIC_URL}/watch/${tokenRow.token}`;

    return res.json(mcResponse({
      messages: [
        textMessage(`Төлбөр амжилттай! Доорх линкээр орж киногоо үзнэ үү:\n\n${watchUrl}\n\nЛинк ${process.env.WATCH_TOKEN_TTL_HOURS} цаг хүчинтэй.`),
      ],
      actions: [setField('watch_url', watchUrl)],
    }));
  } catch (err) {
    console.error('check-payment error:', err);
    return res.status(500).json(mcResponse({
      messages: [textMessage('Систем алдаа гарлаа.')],
    }));
  }
});

export default router;
