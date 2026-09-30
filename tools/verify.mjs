// Проверка страницы в Chromium как на iPhone (390×844 @3x):
// скриншоты всех экранов, ошибки консоли, запросы к чужим доменам, QR во всех стилях,
// макс-режим, работа без сети после первой загрузки, первый показ на медленной сети.
//
// Локально:   node tools/verify.mjs                 (поднимет сервер для site/ сам)
// Живой сайт: BASE_URL=https://karen-connect.pages.dev node tools/verify.mjs
// Потом:      python3 tools/decode_qr.py <url> tools/out/*.png
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const OUT = process.env.OUT || path.join(ROOT, 'tools', 'out');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'config.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

// ---------- локальный сервер: те же MIME, Range и заголовки, что на Cloudflare ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain' };
function headersFor(urlPath) {
  const h = {};
  const rules = fs.readFileSync(path.join(SITE, '_headers'), 'utf8').split('\n');
  let active = false;
  for (const line of rules) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      const pat = line.trim();
      active = pat === urlPath || (pat.endsWith('*') && urlPath.startsWith(pat.slice(0, -1)));
    } else if (active) {
      const i = line.indexOf(':');
      h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return h;
}
function serve(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = path.join(SITE, u === '/' ? 'index.html' : u);
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      const buf = fs.readFileSync(file);
      const head = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', ...headersFor(u) };
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (range) {
        const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], buf.length - 1) : buf.length - 1;
        res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': end - start + 1 });
        res.end(buf.subarray(start, end + 1));
      } else {
        res.writeHead(200, { ...head, 'Content-Length': buf.length });
        res.end(buf);
      }
    });
    srv.listen(port, () => resolve(srv));
  });
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const BASE = process.env.BASE_URL || 'http://localhost:8123';
const origin = new URL(BASE).origin;
const report = { base: BASE, shots: [], consoleErrors: [], foreignRequests: [], steps: {} };
let server = null;
if (!process.env.BASE_URL) server = await serve(8123);

const browser = await chromium.launch();
const newContext = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: IPHONE, serviceWorkers: 'allow' });
function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => report.consoleErrors.push(`${tag}: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('blob:') && !u.startsWith('data:')) report.foreignRequests.push(`${tag}: ${u}`);
  });
}
const shot = async (page, name) => { const p = path.join(OUT, `${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); return p; };
const stateIs = (page, s, timeout = 15000) => page.waitForFunction((x) => document.documentElement.getAttribute('data-state') === x, s, { timeout });
const tapStage = (page) => page.touchscreen.tap(195, 330);
async function swStatus(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!sw) return resolve(null);
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => resolve(e.data);
    sw.postMessage({ type: 'status' }, [ch.port2]);
    setTimeout(() => resolve(null), 3000);
  }));
}

// ---------- 1. Первая загрузка, reveal, QR, макс-режим ----------
const ctx = await newContext();
const page = await ctx.newPage();
watch(page, 'online');
const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'load' });
report.steps.loadMs = Date.now() - t0;
await page.waitForTimeout(600);
await shot(page, '01-ready');
// ждём, пока ролик скачается в blob, чтобы проверить именно видео-reveal
await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.endsWith('reveal.mp4') && e.responseEnd > 0), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);
await tapStage(page);
await page.waitForTimeout(1500);
await shot(page, '02-revealing');
await stateIs(page, 'settled');
report.steps.videoPlayed = await page.evaluate(() => !document.documentElement.classList.contains('fallback'));
await page.waitForTimeout(1300);
await shot(page, '03-settled-gold');
await page.tap('#qr');
await page.waitForTimeout(400);
await shot(page, '04-max');
await page.tap('#max');

// ---------- 2. Все стили ----------
for (const key of Object.keys(config.styles).slice(1)) {
  await page.evaluate((k) => localStorage.setItem('kc:style', k), key);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction((k) => performance.getEntriesByType('resource').some((e) => e.name.endsWith(`/media/${k}/reveal.mp4`) && e.responseEnd > 0), key, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  await tapStage(page);
  await stateIs(page, 'settled');
  await page.waitForTimeout(1300);
  await shot(page, `05-settled-${key}`);
}
await page.evaluate(() => localStorage.setItem('kc:style', 'gold'));

// ---------- 3. Выбор стиля (шторка) ----------
await page.reload({ waitUntil: 'load' });
await tapStage(page);
await stateIs(page, 'settled');
await page.waitForTimeout(1200);
await page.tap('#btnStyle');
await page.waitForTimeout(700);
await shot(page, '06-style-sheet');
await page.tap('#sheetDone');

// ---------- 4. Без сети после первой загрузки ----------
let st = null;
for (let i = 0; i < 60; i++) { st = await swStatus(page); if (st && st.missing === 0) break; await page.waitForTimeout(1000); }
report.steps.offlineCacheBeforeOffline = st;
await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(800);
await shot(page, '07-offline-ready');
await tapStage(page);
await stateIs(page, 'settled');
report.steps.offlineVideoPlayed = await page.evaluate(() => !document.documentElement.classList.contains('fallback'));
await page.waitForTimeout(1300);
await shot(page, '08-offline-settled');
await ctx.setOffline(false);
await ctx.close();

// ---------- 5. Первый визит на медленной сети (≈400 кбит/с, 400 мс RTT): когда виден QR ----------
const slow = await newContext();
const sp = await slow.newPage();
watch(sp, 'slow');
const cdp = await slow.newCDPSession(sp);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 });
const s0 = Date.now();
await sp.goto(BASE, { waitUntil: 'domcontentloaded' });
report.steps.slowDomContentLoadedMs = Date.now() - s0;
await tapStage(sp);
await stateIs(sp, 'settled', 30000);
await sp.waitForTimeout(1200);
report.steps.slowTapToQrMs = Date.now() - s0;
await shot(sp, '09-slow-first-visit');
await slow.close();

await browser.close();
if (server) server.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
