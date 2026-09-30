// Service Worker: страница работает без интернета после первого открытия.
// Стратегия: всё своё отдаём из кэша, в фоне докачиваем недостающее. Чужие домены не трогаем (их и нет).
/*BUILD:START*/
const CACHE = 'kc-4d78b2470f';
const CORE = ["/","/manifest.webmanifest","/fonts/playfair-display-latin-600-italic.woff2","/fonts/playfair-display-latin-400-italic.woff2","/fonts/lato-latin-400-normal.woff2","/fonts/lato-latin-700-normal.woff2","/icons/apple-touch-icon.png","/icons/icon-192.png"];
const EXTRA = ["/media/home/poster.webp","/media/ace/thumb.webp","/media/ace/start.webp","/media/ace/end.webp","/media/marquee/thumb.webp","/media/marquee/start.webp","/media/marquee/end.webp","/media/jackpot/thumb.webp","/media/jackpot/start.webp","/media/jackpot/end.webp","/media/home/loop.mp4","/media/home/intro.mp4","/media/ace/reveal.mp4","/media/marquee/reveal.mp4","/media/jackpot/reveal.mp4","/icons/icon-512.png"];
/*BUILD:END*/

// Установка: только лёгкий минимум (быстро даже на слабом Wi-Fi), видео докачиваются после активации
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('kc-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    warm();
  })());
});

// Докачка по одному файлу: если сеть оборвётся, скачанное останется, остальное докачаем при следующем открытии
async function warm() {
  const cache = await caches.open(CACHE);
  for (const url of [...CORE, ...EXTRA]) {
    if (await cache.match(url)) continue;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok && res.status === 200) await cache.put(url, res);
    } catch (e) { /* нет сети: попробуем в следующий раз */ }
  }
}

async function missingCount() {
  const cache = await caches.open(CACHE);
  let missing = 0;
  for (const url of [...CORE, ...EXTRA]) if (!(await cache.match(url))) missing++;
  return missing;
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'warm') event.waitUntil(warm());
  if (data.type === 'status' && event.ports && event.ports[0]) {
    event.waitUntil(missingCount().then((m) => event.ports[0].postMessage({ missing: m, total: CORE.length + EXTRA.length })));
  }
});

// Safari запрашивает видео кусками (Range) и ждёт ответ 206: собираем его из кэша
async function rangeResponse(request, cached) {
  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  const size = buf.byteLength;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = size - parseInt(m[2], 10); end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Страница: сразу из кэша, в фоне обновляем (stale-while-revalidate)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = (await cache.match('/')) || (await cache.match('/index.html'));
      const network = fetch(req).then((res) => {
        if (res.ok && res.status === 200 && !res.redirected) cache.put('/', res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      return (await network) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.pathname);
    if (cached) return req.headers.get('range') ? rangeResponse(req, cached) : cached;
    const res = await fetch(req);
    if (res.ok && res.status === 200 && !req.headers.get('range')) cache.put(url.pathname, res.clone());
    return res;
  })());
});
