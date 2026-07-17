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
    duration: '1ц 20мин',
    description: 'Ээжийн найз эгчмэд бүсгүйг амталсан түүх.',
    category: 'Эротик',
  },
  {
    slug: 'bayajsan-emegtei',
    title: 'Нөхөртөө хаягдаад баяжсан эмэгтэй',
    price: 2000,
    bunny_video_id: '5519852c-8c32-403f-84a4-1ad11f67c005',
    duration: '',
    description: 'Гэр бүлээсээ хаягдаад амьдралын шинэ хуудсыг эргүүлж чадсан эмэгтэйн түүх.',
    category: 'Хятад кино',
  },
  {
    slug: 'tsunami',
    title: 'Цунами',
    price: 2000,
    bunny_video_id: '3562f622-4ba5-4040-8f60-d5412f0e7ff6',
    duration: '',
    description: 'Байгалийн гамшигт үзэгдэл нэгэн өдөр амьдралыг эрс өөрчлөх юм.',
    category: 'Хятад кино',
  },
  {
    slug: 'hanashgui-husel',
    title: 'Ханашгүй хүсэл',
    price: 2000,
    bunny_video_id: 'db6b8ff1-9a44-47ff-8c19-e72136b060f2',
    duration: '1ц 22мин',
    description: 'Хориотой хүслийн эргүүлэгт татагдсан хосын халуун түүх.',
    category: 'Эротик',
  },
  {
    slug: 'uuland-neg-udaa',
    title: 'Ууланд нэг удаа',
    price: 3000,
    bunny_video_id: '09b6a4cb-beb9-4780-8799-16a1621e15ce',
    duration: '40мин',
    description: 'Эхнэр нөхөр хөдөө ирээд айлын эхнэр нөхөртэй жаргасан түүх.',
    category: 'Эротик',
  },
];

const upsert = db.prepare(`
  INSERT INTO movies (slug, title, price, bunny_video_id, description, duration, category, active)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    price = excluded.price,
    bunny_video_id = excluded.bunny_video_id,
    description = COALESCE(NULLIF(excluded.description, ''), movies.description),
    duration = COALESCE(NULLIF(excluded.duration, ''), movies.duration),
    category = COALESCE(NULLIF(excluded.category, ''), movies.category),
    active = 1
`);

for (const m of movies) {
  upsert.run(m.slug, m.title, m.price, m.bunny_video_id, m.description || '', m.duration || '', m.category || '');
  console.log(`✓ ${m.title} (${m.slug}) — ${m.category || 'ангилалгүй'}`);
}

const total = db.prepare('SELECT COUNT(*) as c FROM movies WHERE active = 1').get().c;
console.log(`\nНийт ${total} идэвхтэй кино`);
