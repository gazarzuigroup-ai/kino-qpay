import { Router } from 'express';
import express from 'express';
import { db, upsertUser, getUserPaidOrdersWithTokens, getUserPendingOrders, markOrderPaid, createWatchToken, getExistingTokenForOrder } from '../db.js';
import { checkPayment } from '../qpay.js';
import { newWatchToken } from '../utils/tokens.js';
import {
  verifySignature,
  verifyToken,
  sendText,
  sendButtons,
  sendGeneric,
  sendTyping,
  getUserProfile,
} from '../messenger.js';

const router = Router();

/**
 * Webhook verification (GET).
 * Facebook developer console-с webhook subscribe хийхэд нэг удаа дуудна.
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken()) {
    console.log('✓ Messenger webhook verified');
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
});

/**
 * Webhook event receiver (POST).
 * Facebook хэрэглэгчийн мессеж, товч дарах гэх мэт event-үүдийг илгээнэ.
 */
router.post('/', express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}), async (req, res) => {
  // Production-т signature шалгах — сан аюулгүй
  if (process.env.FB_APP_SECRET) {
    const sig = req.headers['x-hub-signature-256'];
    if (!verifySignature(req.rawBody, sig)) {
      console.warn('Invalid Facebook signature');
      return res.status(403).send('Invalid signature');
    }
  }

  const body = req.body;
  if (body.object !== 'page') return res.status(404).send('Not a page');

  // Facebook нь батлагдмагц дараа boy processing хийхийг хүсдэг
  res.status(200).send('EVENT_RECEIVED');

  for (const entry of (body.entry || [])) {
    for (const event of (entry.messaging || [])) {
      await handleEvent(event).catch((err) => {
        console.error('Event handler error:', err.response?.data || err.message);
      });
    }
  }
});

async function handleEvent(event) {
  const psid = event.sender?.id;
  if (!psid) return;

  await ensureUser(psid);

  if (event.postback) {
    return handlePostback(psid, event.postback);
  }
  if (event.message) {
    if (event.message.quick_reply) {
      return handlePostback(psid, { payload: event.message.quick_reply.payload });
    }
    if (event.message.text) {
      return handleText(psid, event.message.text);
    }
  }
}

async function ensureUser(psid) {
  const existing = db.prepare('SELECT id, name FROM users WHERE manychat_id = ?').get(psid);
  if (existing?.name) return existing;
  // Профайл нэр татах (сонголтоор)
  const profile = await getUserProfile(psid);
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  return upsertUser(psid, name);
}

async function handleText(psid, text) {
  const t = text.toLowerCase().trim();
  await sendTyping(psid, true);

  // Худалдан авах шүлхээ
  if (/(кино|kino|үзэх|uzeh|авах|avah|medeelel|мэдээлэл|1)/i.test(t)) {
    return sendMovieList(psid);
  }

  // Миний авсан кино
  if (/(миний|minii|линк|link|авсан|watch)/i.test(t)) {
    return sendMyMovies(psid);
  }

  // Тусламж
  if (/(help|тусла|hi|hello|сайн)/i.test(t)) {
    return sendText(psid,
      'Тавтай морил! 🎬\n\n' +
      '"кино" бичээд авах боломжтой кино харах\n' +
      '"миний кино" бичээд авсан киногоо үзэх');
  }

  // Default — Меню харуулах
  return sendMovieList(psid);
}

async function handlePostback(psid, postback) {
  const payload = postback.payload || '';
  await sendTyping(psid, true);

  if (payload === 'GET_STARTED' || payload === 'MENU') {
    return sendMovieList(psid);
  }

  if (payload.startsWith('BUY_')) {
    const slug = payload.slice(4);
    return sendBuyLink(psid, slug);
  }

  if (payload === 'MY_MOVIES') {
    return sendMyMovies(psid);
  }

  return sendMovieList(psid);
}

async function sendMovieList(psid) {
  const movies = db.prepare('SELECT * FROM movies WHERE active = 1 ORDER BY id DESC LIMIT 10').all();
  if (movies.length === 0) {
    return sendText(psid, 'Одоогоор идэвхтэй кино байхгүй байна. Дараа дахин орж үзээрэй.');
  }

  const elements = movies.map((m) => ({
    title: m.title,
    subtitle: `💰 ${m.price.toLocaleString()}₮`,
    image_url: `https://vz-46bd50a9-33b.b-cdn.net/${m.bunny_video_id}/thumbnail.jpg`,
    buttons: [
      { type: 'postback', title: '🛒 Худалдаж авах', payload: `BUY_${m.slug}` },
      { type: 'postback', title: '🎬 Миний кино', payload: 'MY_MOVIES' },
    ],
  }));

  return sendGeneric(psid, elements);
}

async function sendBuyLink(psid, slug) {
  const movie = db.prepare('SELECT * FROM movies WHERE slug = ? AND active = 1').get(slug);
  if (!movie) return sendText(psid, 'Кино олдсонгүй.');

  const buyUrl = `${process.env.PUBLIC_URL}/buy/${slug}?psid=${encodeURIComponent(psid)}`;
  return sendButtons(psid,
    `"${movie.title}" - ${movie.price.toLocaleString()}₮\n\nДоорх товчийг дар:`,
    [
      { type: 'web_url', title: '💳 Төлбөр хийх', url: buyUrl },
      { type: 'postback', title: '✓ Төлбөр шалгах', payload: 'MY_MOVIES' },
    ],
  );
}

async function sendMyMovies(psid) {
  // PENDING захиалгуудыг QPay-с шалгаж эргэлт хийх
  await reconcilePending(psid);

  const orders = getUserPaidOrdersWithTokens(psid);
  if (orders.length === 0) {
    return sendButtons(psid,
      '⏳ Одоогоор төлбөр батлагдсан кино алга.\n\nХэрэв та саяхан төлбөр хийсэн бол 1-2 минут хүлээгээд дахин шалгана уу.',
      [{ type: 'postback', title: '🔄 Дахин шалгах', payload: 'MY_MOVIES' }],
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const elements = orders.slice(0, 10).map((o) => {
    const expired = !o.token || o.expires_at < now;
    return {
      title: o.title,
      subtitle: expired
        ? '⌛ Линкийн хугацаа дуусжээ'
        : `⏱ ${Math.floor((o.expires_at - now) / 3600)} цаг үлдсэн · ${o.view_count} удаа үзсэн`,
      buttons: expired
        ? [{ type: 'postback', title: 'Дахин авах', payload: `BUY_${o.slug}` }]
        : [{ type: 'web_url', title: '▶ Үзэх', url: `${process.env.PUBLIC_URL}/watch/${o.token}` }],
    };
  });

  return sendGeneric(psid, elements);
}

async function reconcilePending(psid) {
  const pending = getUserPendingOrders(psid);
  const ttlSec = Number(process.env.WATCH_TOKEN_TTL_HOURS) * 3600;
  await Promise.all(pending.map(async (o) => {
    try {
      const result = await checkPayment(o.qpay_invoice_id);
      if (result && result.count > 0 && result.paid_amount >= o.amount) {
        markOrderPaid(o.id);
        if (!getExistingTokenForOrder(o.id)) {
          createWatchToken({
            token: newWatchToken(),
            orderId: o.id,
            expiresAt: Math.floor(Date.now() / 1000) + ttlSec,
          });
        }
      }
    } catch (e) {
      console.error('reconcile error:', e.response?.data || e.message);
    }
  }));
}

export default router;
