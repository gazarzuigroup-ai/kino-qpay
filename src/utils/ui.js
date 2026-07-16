/**
 * Бүх хуудсанд ашиглагдах нэгдсэн навигацийн цэс.
 * active: 'catalog' | 'my' — идэвхтэй хуудсыг тодруулна.
 */
export function siteNav(active = '') {
  return `
  <nav class="sitenav">
    <a href="/movies" class="${active === 'catalog' ? 'on' : ''}">🎬 Кино</a>
    <a href="/my-movies" class="${active === 'my' ? 'on' : ''}">📁 Миний кино</a>
  </nav>`;
}

export function siteNavStyle() {
  return `
  .sitenav{display:flex;gap:8px;margin:0 0 16px;padding:0}
  .sitenav a{color:#888;text-decoration:none;font-size:14px;font-weight:600;
             padding:8px 14px;border-radius:20px;transition:color .15s, background .15s}
  .sitenav a.on{color:#eee;background:#141a2a}
  .sitenav a:hover{color:#eee}`;
}
