import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'kino.db');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manychat_id TEXT UNIQUE,
    name TEXT,
    phone TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    price INTEGER NOT NULL,
    bunny_video_id TEXT NOT NULL,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    qpay_invoice_id TEXT,
    sender_invoice_no TEXT UNIQUE NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING',
    paid_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(movie_id) REFERENCES movies(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_invoice ON orders(qpay_invoice_id);

  CREATE TABLE IF NOT EXISTS watch_tokens (
    token TEXT PRIMARY KEY,
    order_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    view_count INTEGER DEFAULT 0,
    first_ip TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );
`);


export function upsertUser(manychatId, name) {
  const existing = db.prepare('SELECT * FROM users WHERE manychat_id = ?').get(manychatId);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO users (manychat_id, name) VALUES (?, ?)').run(manychatId, name);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

export function getMovieBySlug(slug) {
  return db.prepare('SELECT * FROM movies WHERE slug = ? AND active = 1').get(slug);
}

export function createOrder({ userId, movieId, senderInvoiceNo, amount }) {
  const info = db.prepare(`
    INSERT INTO orders (user_id, movie_id, sender_invoice_no, amount)
    VALUES (?, ?, ?, ?)
  `).run(userId, movieId, senderInvoiceNo, amount);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
}

export function setOrderInvoiceId(orderId, qpayInvoiceId) {
  db.prepare('UPDATE orders SET qpay_invoice_id = ? WHERE id = ?').run(qpayInvoiceId, orderId);
}

export function markOrderPaid(orderId) {
  db.prepare(`
    UPDATE orders SET status = 'PAID', paid_at = strftime('%s','now')
    WHERE id = ? AND status != 'PAID'
  `).run(orderId);
}

export function getOrder(orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

export function getOrderByInvoiceId(invoiceId) {
  return db.prepare('SELECT * FROM orders WHERE qpay_invoice_id = ?').get(invoiceId);
}

export function createWatchToken({ token, orderId, expiresAt }) {
  db.prepare(`
    INSERT INTO watch_tokens (token, order_id, expires_at) VALUES (?, ?, ?)
  `).run(token, orderId, expiresAt);
}

export function getExistingTokenForOrder(orderId) {
  return db.prepare(`
    SELECT * FROM watch_tokens WHERE order_id = ? AND expires_at > strftime('%s','now')
    ORDER BY created_at DESC LIMIT 1
  `).get(orderId);
}

export function getWatchToken(token) {
  return db.prepare('SELECT * FROM watch_tokens WHERE token = ?').get(token);
}

export function getUserPaidOrdersWithTokens(manychatId) {
  return db.prepare(`
    SELECT
      o.id as order_id,
      o.paid_at,
      m.title,
      m.slug,
      wt.token,
      wt.expires_at,
      wt.view_count
    FROM orders o
    JOIN users u ON u.id = o.user_id
    JOIN movies m ON m.id = o.movie_id
    LEFT JOIN watch_tokens wt ON wt.order_id = o.id
    WHERE u.manychat_id = ? AND o.status = 'PAID'
    ORDER BY o.paid_at DESC
  `).all(manychatId);
}

export function getUserPendingOrders(manychatId, maxAgeHours = 24) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeHours * 3600;
  return db.prepare(`
    SELECT o.id, o.qpay_invoice_id, o.amount
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE u.manychat_id = ? AND o.status = 'PENDING'
      AND o.qpay_invoice_id IS NOT NULL
      AND o.created_at > ?
    ORDER BY o.created_at DESC
  `).all(manychatId, cutoff);
}

export function incrementTokenView(token, ip) {
  db.prepare(`
    UPDATE watch_tokens
    SET view_count = view_count + 1,
        first_ip = COALESCE(first_ip, ?)
    WHERE token = ?
  `).run(ip, token);
}
