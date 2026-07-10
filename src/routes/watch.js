import { Router } from 'express';
import { db, getWatchToken, incrementTokenView } from '../db.js';
import { bunnyTokenUrl } from '../utils/tokens.js';

const router = Router();

const MAX_VIEWS = Number(process.env.WATCH_TOKEN_MAX_VIEWS || 3);

function errorPage(title, message) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#eee;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{max-width:420px;padding:32px;text-align:center}
  h1{font-size:20px;margin:0 0 12px}
  p{color:#aaa;line-height:1.5}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

/**
 * GET /watch/:token
 * HTML тоглуулагч буцаана. Bunny signed URL сервер талд үүсгээд шууд player-т өгнө.
 */
router.get('/:token', (req, res) => {
  const { token } = req.params;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  const row = getWatchToken(token);
  if (!row) {
    return res.status(404).send(errorPage('Линк буруу', 'Энэ линк олдсонгүй эсвэл цуцлагдсан байна.'));
  }

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) {
    return res.status(410).send(errorPage('Хугацаа дууссан', 'Энэ линкийн хүчинтэй хугацаа дуусжээ.'));
  }

  if (row.view_count >= MAX_VIEWS) {
    return res.status(410).send(errorPage('Хэтэрсэн', `Та ${MAX_VIEWS} удаа үзсэн байна. Дахин үзэх боломжгүй.`));
  }

  incrementTokenView(token, ip);

  // Захиалгын киног авах
  const order = db.prepare(`
    SELECT o.*, m.title, m.bunny_video_id
    FROM orders o JOIN movies m ON m.id = o.movie_id
    WHERE o.id = ?
  `).get(row.order_id);

  // Bunny signed URL — 4 цагаар хүчинтэй
  const streamExpires = now + 4 * 3600;
  const hlsUrl = bunnyTokenUrl({
    videoId: order.bunny_video_id,
    expiresAt: streamExpires,
  });

  return res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>${order.title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif}
  header{padding:12px 16px;background:#111;border-bottom:1px solid #222;
         display:flex;align-items:center;gap:12px}
  h1{margin:0;font-size:15px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .player-wrap{max-width:1200px;margin:0 auto}
  video{width:100%;height:auto;aspect-ratio:16/9;background:#000;display:block}
  .info{padding:10px 16px;color:#888;font-size:12px;text-align:center;line-height:1.4}
  .fallback{padding:40px 20px;text-align:center;color:#aaa;font-size:14px}
  .fallback a{color:#4ade80;text-decoration:none}
</style>
</head>
<body>
  <header><h1>${order.title}</h1></header>
  <div class="player-wrap">
    <video id="player" controls playsinline webkit-playsinline preload="auto"
           controlsList="nodownload noremoteplayback" disablePictureInPicture
           oncontextmenu="return false"></video>
    <div class="info">Үлдэгдэл үзэлт: ${MAX_VIEWS - row.view_count - 1} · Линк дуусах: ${new Date(row.expires_at * 1000).toLocaleString('mn-MN')}</div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
  <script>
    (function(){
      var video = document.getElementById('player');
      var src = ${JSON.stringify(hlsUrl)};
      // iOS Safari нь HLS-ыг native дэмждэг
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      } else if (window.Hls && Hls.isSupported()) {
        var hls = new Hls({ maxBufferLength: 30 });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, function(_, data){
          if (data.fatal) console.error('HLS error', data);
        });
      } else {
        document.querySelector('.player-wrap').innerHTML =
          '<div class="fallback">Таны браузер энэ видеог тоглуулж чадахгүй байна. Өөр браузер (Chrome, Safari)-с нээж үзнэ үү.<br><br><a href="' + src + '">Шууд линк</a></div>';
      }
    })();
  </script>
</body></html>`);
});

export default router;
