import axios from 'axios';

const {
  QPAY_BASE_URL,
  QPAY_CLIENT_ID,
  QPAY_CLIENT_SECRET,
  QPAY_INVOICE_CODE,
} = process.env;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }
  const basic = Buffer.from(`${QPAY_CLIENT_ID}:${QPAY_CLIENT_SECRET}`).toString('base64');
  const { data } = await axios.post(
    `${QPAY_BASE_URL}/auth/token`,
    {},
    { headers: { Authorization: `Basic ${basic}` } },
  );
  cachedToken = data.access_token;
  // QPay-ийн expires_in нь секунд БИШ, Unix timestamp байдаг (албан ёсны док).
  // Найдвартай байлгах үүднээс дээд тал нь 55 минут кэшлэнэ —
  // ойр ойрхон токен авахыг QPay хориглодог.
  const byDoc = (data.expires_in ?? 0) * 1000;
  const cap = Date.now() + 55 * 60 * 1000;
  tokenExpiresAt = byDoc > Date.now() ? Math.min(byDoc, cap) : cap;
  return cachedToken;
}

async function qpayRequest(method, path, body) {
  const token = await getAccessToken();
  const { data } = await axios({
    method,
    url: `${QPAY_BASE_URL}${path}`,
    data: body,
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

/**
 * QPay нэхэмжлэх үүсгэнэ.
 * Буцаах: { invoice_id, qr_text, qr_image (base64), urls: [{name, link}], ... }
 */
export async function createInvoice({ senderInvoiceNo, amount, description, receiverCode, callbackUrl }) {
  return qpayRequest('POST', '/invoice', {
    invoice_code: QPAY_INVOICE_CODE,
    sender_invoice_no: senderInvoiceNo,
    invoice_receiver_code: receiverCode || 'terminal',
    invoice_description: description,
    amount,
    callback_url: callbackUrl,
  });
}

/**
 * Төлбөр орсон эсэхийг QPay-ээс шалгана.
 * count > 0 бол төлөгдсөн.
 */
export async function checkPayment(invoiceId) {
  return qpayRequest('POST', '/payment/check', {
    object_type: 'INVOICE',
    object_id: invoiceId,
    offset: { page_number: 1, page_limit: 100 },
  });
}

/**
 * И-баримт үүсгэнэ (Ebarimt 3.0). Төлбөр батлагдсаны дараа дуудна.
 * paymentId нь callback-ийн qpay_payment_id эсвэл payment/check-ийн rows[].payment_id.
 */
export async function createEbarimt(paymentId, receiverType = 'CITIZEN') {
  return qpayRequest('POST', '/ebarimt_v3/create', {
    payment_id: paymentId,
    ebarimt_receiver_type: receiverType,
  });
}
