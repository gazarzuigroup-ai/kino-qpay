import { Router } from 'express';
import {
  getOrder,
  markOrderPaid,
  createWatchToken,
  getExistingTokenForOrder,
} from '../db.js';
import { checkPayment, createEbarimt } from '../qpay.js';
import { newWatchToken } from '../utils/tokens.js';

const router = Router();

/**
 * QPay callback — албан ёсны док:
 *   - HTTP method: GET
 *   - Формат: {callback_url}?qpay_payment_id=XXX (бид order-оо давхар залгасан)
 *   - Хариу ЗААВАЛ: HTTP 200 + body "SUCCESS" (өөр форматаар буцаахыг хориглоно)
 *
 * Callback-ыг хуурч болох тул payment/check API-аар ЗААВАЛ давхар шалгана.
 */
async function handleCallback(req, res) {
  // Ямар ч тохиолдолд QPay-д SUCCESS буцаана; дотоод алдаа гарсан ч
  // хэрэглэгч "Төлсөн" товчоор check-payment замаар сэргээж чадна.
  try {
    const orderId = Number(req.query.order);
    const qpayPaymentId = req.query.qpay_payment_id;
    const order = getOrder(orderId);

    if (order && order.status !== 'PAID') {
      const result = await checkPayment(order.qpay_invoice_id);
      if (result && result.count > 0 && result.paid_amount >= order.amount) {
        markOrderPaid(order.id);

        if (!getExistingTokenForOrder(order.id)) {
          const ttlSec = Number(process.env.WATCH_TOKEN_TTL_HOURS) * 3600;
          createWatchToken({
            token: newWatchToken(),
            orderId: order.id,
            expiresAt: Math.floor(Date.now() / 1000) + ttlSec,
          });
        }

        // И-баримт (тохиргоогоор асаана)
        if (process.env.EBARIMT_ENABLED === 'true') {
          const paymentId = qpayPaymentId || result.rows?.[0]?.payment_id;
          if (paymentId) {
            createEbarimt(paymentId).catch((e) =>
              console.error('ebarimt error:', e.response?.data || e.message),
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('qpay callback error:', err.response?.data || err.message);
  }

  res.status(200).type('text/plain').send('SUCCESS');
}

router.get('/callback', handleCallback);
router.post('/callback', handleCallback); // хамгаалалтын нөөц

export default router;
