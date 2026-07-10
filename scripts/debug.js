#!/usr/bin/env node
/**
 * DB-ийн өнөөгийн байдлыг харуулах debug script.
 * node scripts/debug.js
 */
import 'dotenv/config';
import { db } from '../src/db.js';

console.log('\n=== Users ===');
console.table(db.prepare(`
  SELECT id, manychat_id, name,
         datetime(created_at, 'unixepoch') as created
  FROM users
`).all());

console.log('\n=== Orders ===');
console.table(db.prepare(`
  SELECT o.id, o.user_id, u.manychat_id as user_mcid, m.slug, o.amount, o.status,
         datetime(o.paid_at, 'unixepoch') as paid_at,
         datetime(o.created_at, 'unixepoch') as created_at,
         o.qpay_invoice_id
  FROM orders o
  JOIN users u ON u.id = o.user_id
  JOIN movies m ON m.id = o.movie_id
  ORDER BY o.id DESC
`).all());

console.log('\n=== Watch tokens ===');
console.table(db.prepare(`
  SELECT wt.token, wt.order_id, wt.view_count,
         datetime(wt.expires_at, 'unixepoch') as expires_at
  FROM watch_tokens wt
  ORDER BY wt.created_at DESC
`).all());
