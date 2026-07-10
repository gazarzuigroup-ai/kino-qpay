#!/usr/bin/env node
/**
 * Кино нэмэх / шинэчлэх / жагсаах админ script.
 *
 * Хэрэглээ:
 *   node scripts/movie.js list
 *   node scripts/movie.js add    <slug> <bunny_video_id> <price> "<title>"
 *   node scripts/movie.js update <slug> [--title="..."] [--price=1234] [--bunny=GUID] [--active=1|0]
 *   node scripts/movie.js remove <slug>
 */
import 'dotenv/config';
import { db } from '../src/db.js';

const [, , cmd, ...rest] = process.argv;

function list() {
  const rows = db.prepare('SELECT id, slug, title, price, bunny_video_id, active FROM movies ORDER BY id').all();
  if (rows.length === 0) return console.log('(хоосон)');
  console.table(rows);
}

function add() {
  const [slug, bunny, priceStr, ...titleParts] = rest;
  const title = titleParts.join(' ').replace(/^"|"$/g, '');
  const price = Number(priceStr);
  if (!slug || !bunny || !price || !title) {
    console.error('Хэрэглээ: add <slug> <bunny_video_id> <price> "<title>"');
    process.exit(1);
  }
  db.prepare(`
    INSERT INTO movies (slug, title, price, bunny_video_id, active)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      price = excluded.price,
      bunny_video_id = excluded.bunny_video_id,
      active = 1
  `).run(slug, title, price, bunny);
  console.log(`✓ "${title}" (${slug}) хадгаллаа`);
  list();
}

function update() {
  const [slug, ...flags] = rest;
  if (!slug) return console.error('Хэрэглээ: update <slug> [--title=...] [--price=...] [--bunny=...] [--active=1|0]');
  const opts = Object.fromEntries(flags.map((f) => {
    const [k, ...v] = f.replace(/^--/, '').split('=');
    return [k, v.join('=').replace(/^"|"$/g, '')];
  }));
  const sets = [];
  const args = [];
  if (opts.title)   { sets.push('title = ?');          args.push(opts.title); }
  if (opts.price)   { sets.push('price = ?');          args.push(Number(opts.price)); }
  if (opts.bunny)   { sets.push('bunny_video_id = ?'); args.push(opts.bunny); }
  if (opts.active)  { sets.push('active = ?');         args.push(Number(opts.active)); }
  if (opts.desc)    { sets.push('description = ?');    args.push(opts.desc); }
  if (opts.duration){ sets.push('duration = ?');       args.push(opts.duration); }
  if (sets.length === 0) return console.error('Юу ч зааж өгөөгүй байна');
  args.push(slug);
  const info = db.prepare(`UPDATE movies SET ${sets.join(', ')} WHERE slug = ?`).run(...args);
  console.log(info.changes ? '✓ шинэчиллээ' : '✗ slug олдсонгүй');
  list();
}

function remove() {
  const [slug] = rest;
  if (!slug) return console.error('Хэрэглээ: remove <slug>');
  const info = db.prepare('UPDATE movies SET active = 0 WHERE slug = ?').run(slug);
  console.log(info.changes ? '✓ идэвхгүй болголоо' : '✗ slug олдсонгүй');
}

switch (cmd) {
  case 'list': list(); break;
  case 'add': add(); break;
  case 'update': update(); break;
  case 'remove': remove(); break;
  default:
    console.log(`Хэрэглээ:
  node scripts/movie.js list
  node scripts/movie.js add    <slug> <bunny_video_id> <price> "<title>"
  node scripts/movie.js update <slug> [--title=...] [--price=...] [--bunny=...] [--active=1|0]
  node scripts/movie.js remove <slug>`);
}
