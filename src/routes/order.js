import { Router } from 'express';
import {
  getOrder,
  markOrderPaid,
  createWatchToken,
  getExistingTokenForOrder,
} from '../db.js';
import { checkPayment } from '../qpay.js';
import { newWatchToken } from '../utils/tokens.js';

const router = Router();

/**
 * GET /api/order/:id/status
 *
 * Payment page 3 секунд тутам энэ endpoint-г poll хийнэ.
 * QPay callback ирээгүй бол өөрөө QPay-ээс шалгаж үзнэ.
 */
router.get('/:id/status', async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    let order = getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'not found' });

    if (order.status !== 'PAID' && order.qpay_invoice_id) {
      try {
        const result = await checkPayment(order.qpay_invoice_id);
        if (result && result.count > 0 && result.paid_amount >= order.amount) {
          markOrderPaid(orderId);
          order = getOrder(orderId);
        }
      } catch (e) {
        // QPay түр татагдаагүй тохиолдол — status pending гэж хариулах хэвээр
      }
    }

    if (order.status !== 'PAID') {
      return res.json({ status: 'PENDING' });
    }

    let tokenRow = getExistingTokenForOrder(order.id);
    if (!tokenRow) {
      const ttlSec = Number(process.env.WATCH_TOKEN_TTL_HOURS) * 3600;
      const token = newWatchToken();
      createWatchToken({
        token,
        orderId: order.id,
        expiresAt: Math.floor(Date.now() / 1000) + ttlSec,
      });
      tokenRow = getExistingTokenForOrder(order.id);
    }

    return res.json({
      status: 'PAID',
      watch_url: `${process.env.PUBLIC_URL}/watch/${tokenRow.token}`,
    });
  } catch (err) {
    console.error('order status error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

export default router;
