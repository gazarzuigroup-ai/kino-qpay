import {
  getUserPendingOrders,
  getUserPaidOrdersWithTokens,
  markOrderPaid,
  createWatchToken,
  getExistingTokenForOrder,
} from '../db.js';
import { checkPayment } from '../qpay.js';
import { newWatchToken } from './tokens.js';

/**
 * PENDING захиалгуудыг QPay-ээс шалгаад, төлөгдсөн бол PAID болгож токен үүсгэнэ.
 * Утсаараа банкны апп руу шилжиж төлсөн хэрэглэгч payment page-т эргэж очихгүй тул
 * каталог, миний кино, худалдан авах хуудас бүр дээр өөрсдөө шалгах шаардлагатай.
 */
export async function reconcilePendingOrders(psid) {
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
      console.error('reconcile error for order', o.id, e.response?.data || e.message);
    }
  }));
}

/**
 * Хэрэглэгчийн авсан кинонуудын хүчинтэй токенуудыг slug-аар map хийж буцаана.
 * Каталог болон buy хуудас "аль хэдийн авсан" гэдгийг мэдэхэд ашиглана.
 */
export function getOwnedTokensBySlug(psid) {
  const now = Math.floor(Date.now() / 1000);
  const owned = new Map();
  for (const o of getUserPaidOrdersWithTokens(psid)) {
    if (o.token && o.expires_at > now && !owned.has(o.slug)) {
      owned.set(o.slug, { token: o.token, expiresAt: o.expires_at });
    }
  }
  return owned;
}
