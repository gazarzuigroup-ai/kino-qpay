#!/usr/bin/env node
/**
 * Идэвхтэй киног DB-т seed хийнэ (байхгүй бол нэмнэ, байгаа бол skip).
 * Хэрэглээ: node scripts/seed.js
 */
import 'dotenv/config';
import { db } from '../src/db.js';

const movies = [
  {
    slug: 'eejiin-naiz',
    title: 'Ээжийн найз',
    price: 2000,
    bunny_video_id: '00309c56-8e46-4c13-a355-33ee3112816c',
  },
  {
    slug: 'bayajsan-emegtei',
    title: 'Нөхөртөө хаягдаад баяжсан эмэгтэй',
    price: 2000,
    bunny_video_id: '5519852c-8c32-403f-84a4-1ad11f67c005',
  },
  {
    slug: 'tsunami',
    title: 'Цунами',
    price: 2000,
    bunny_video_id: '3562f622-4ba5-4040-8f60-d5412f0e7ff6',
  },
];

const upsert = db.prepare(`
  INSERT INTO movies (slug, title, price, bunny_video_id, active)
  VALUES (?, ?, ?, ?, 1)
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    price = excluded.price,
    bunny_video_id = excluded.bunny_video_id,
    active = 1
`);

for (const m of movies) {
  upsert.run(m.slug, m.title, m.price, m.bunny_video_id);
  console.log(`✓ ${m.title} (${m.slug})`);
}

const total = db.prepare('SELECT COUNT(*) as c FROM movies WHERE active = 1').get().c;
console.log(`\nНийт ${total} идэвхтэй кино`);
