import axios from 'axios';
import crypto from 'node:crypto';

const {
  FB_PAGE_ACCESS_TOKEN,
  FB_APP_SECRET,
  FB_VERIFY_TOKEN,
  FB_GRAPH_URL = 'https://graph.facebook.com/v21.0',
  PUBLIC_URL,
} = process.env;

/**
 * Facebook webhook signature шалгах (X-Hub-Signature-256).
 * Meta production-т заавал шалгахыг шаарддаг.
 */
export function verifySignature(rawBody, signatureHeader) {
  if (!FB_APP_SECRET || !signatureHeader) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', FB_APP_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export function verifyToken() {
  return FB_VERIFY_TOKEN;
}

async function callSendAPI(payload) {
  return axios.post(
    `${FB_GRAPH_URL}/me/messages`,
    payload,
    { params: { access_token: FB_PAGE_ACCESS_TOKEN } },
  ).then((r) => r.data).catch((e) => {
    console.error('Send API error:', e.response?.data || e.message);
    throw e;
  });
}

/**
 * Энгийн текст мессеж илгээнэ.
 */
export function sendText(psid, text) {
  return callSendAPI({
    recipient: { id: psid },
    messaging_type: 'RESPONSE',
    message: { text },
  });
}

/**
 * Button template — 1-3 товчтой мессеж.
 * buttons: [{ type: 'web_url', title, url }, { type: 'postback', title, payload }]
 */
export function sendButtons(psid, text, buttons) {
  return callSendAPI({
    recipient: { id: psid },
    messaging_type: 'RESPONSE',
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text,
          buttons,
        },
      },
    },
  });
}

/**
 * Generic template — карцтай илүү баян харагдац (кино poster, үнэ, товч).
 * elements: [{ title, subtitle, image_url, buttons: [...] }]
 */
export function sendGeneric(psid, elements) {
  return callSendAPI({
    recipient: { id: psid },
    messaging_type: 'RESPONSE',
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements,
        },
      },
    },
  });
}

/**
 * "Typing on..." indicator — bot нь одоо хариу бэлдэж байна гэж харуулна.
 */
export function sendTyping(psid, on = true) {
  return callSendAPI({
    recipient: { id: psid },
    sender_action: on ? 'typing_on' : 'typing_off',
  }).catch(() => {}); // typing үзүүлэгдэхгүй ч чухал биш
}

/**
 * Хэрэглэгчийн профиль татаж (first_name, last_name, profile_pic).
 */
export async function getUserProfile(psid) {
  try {
    const { data } = await axios.get(`${FB_GRAPH_URL}/${psid}`, {
      params: {
        fields: 'first_name,last_name',
        access_token: FB_PAGE_ACCESS_TOKEN,
      },
    });
    return data;
  } catch {
    return {};
  }
}
