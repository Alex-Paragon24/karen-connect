// Сборка: генерирует настоящий QR из ссылки и вшивает его в site/index.html,
// прописывает позиции QR для каждого стиля и список файлов для офлайн-кэша в site/sw.js.
// Запуск: node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'config.json'), 'utf8'));

const QUIET = 4; // тихая зона по стандарту QR: 4 модуля белого поля

// ---------- 1. QR: вектор, чёрный на белом, одним path без швов ----------
const qr = QRCode.create(config.url, { errorCorrectionLevel: config.ecl || 'M' });
const n = qr.modules.size;
const dark = (x, y) => qr.modules.get(y, x) === 1;
let d = '';
for (let y = 0; y < n; y++) {
  for (let x = 0; x < n; ) {
    if (!dark(x, y)) { x++; continue; }
    let run = 1;
    while (x + run < n && dark(x + run, y)) run++;
    d += `M${x + QUIET} ${y + QUIET}h${run}v1h-${run}z`;
    x += run;
  }
}
const total = n + QUIET * 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${total}" height="${total}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;

// ---------- 2. Позиции QR поверх кадра для каждого эффекта ----------
// В config.qr хранится квадрат модулей (без тихой зоны) в пикселях кадра: [x, y, side].
// Блок .qr включает тихую зону, поэтому расширяем его на QUIET модулей с каждой стороны.
const pct = (v) => `${(v * 100).toFixed(4)}%`;
const conceptCss = Object.entries(config.concepts).map(([key, s], i) => {
  const [fw, fh] = s.frame;
  const [x, y, side] = s.qr;
  const mod = side / n;
  const box = side + mod * QUIET * 2;
  const sel = i === 0 ? `:root, html[data-concept="${key}"]` : `html[data-concept="${key}"]`;
  return `  ${sel} { --start: url(/media/${key}/start.webp); --end: url(/media/${key}/end.webp); --ar: ${fw} / ${fh}; --arw: ${(fw / fh).toFixed(6)}; ` +
    `--qx: ${pct((x - mod * QUIET) / fw)}; --qy: ${pct((y - mod * QUIET) / fh)}; --qw: ${pct(box / fw)}; }`;
}).join('\n');
const jsConfig = JSON.stringify(Object.fromEntries(Object.entries(config.concepts).map(([k, s]) => [k, { label: s.label, theme: s.theme, dur: s.dur }])));

// ---------- 3. Вшиваем в index.html между маркерами ----------
const indexPath = path.join(SITE, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const qrBlocks = html.match(/<!--QR:START-->[\s\S]*?<!--QR:END-->/g) || [];
if (qrBlocks.length !== 2) throw new Error(`ожидалось 2 места под QR, найдено ${qrBlocks.length}`);
html = html.replace(/<!--QR:START-->[\s\S]*?<!--QR:END-->/g, `<!--QR:START-->${svg}<!--QR:END-->`);
html = html.replace(/\/\*CONCEPTS:START\*\/[\s\S]*?\/\*CONCEPTS:END\*\//, `/*CONCEPTS:START*/\n${conceptCss}\n  /*CONCEPTS:END*/`);
html = html.replace(/\/\*CONFIG:START\*\/[\s\S]*?\/\*CONFIG:END\*\//, `/*CONFIG:START*/${jsConfig}/*CONFIG:END*/`);
fs.writeFileSync(indexPath, html);

// ---------- 4. Список файлов для офлайна и версия кэша ----------
const keys = Object.keys(config.concepts);
// CORE ставится атомарно при установке SW, поэтому только лёгкая оболочка; медиа докачиваются по одному
const core = ['/', '/manifest.webmanifest', '/fonts/playfair-display-latin-400-italic.woff2', '/fonts/lato-latin-400-normal.woff2',
  '/fonts/lato-latin-700-normal.woff2', '/icons/apple-touch-icon.png', '/icons/icon-192.png'];
const extra = [...keys.flatMap((k) => [`/media/${k}/thumb.webp`, `/media/${k}/start.webp`, `/media/${k}/end.webp`]),
  ...keys.map((k) => `/media/${k}/reveal.mp4`), '/icons/icon-512.png'];
for (const f of core.slice(1)) if (!fs.existsSync(path.join(SITE, f))) throw new Error(`нет файла оболочки ${f}`);
const coreOk = core, extraOk = extra;
// версия = хэш содержимого сайта (кроме медиа) + отпечаток медиа из tools/media.lock:
// любое изменение → новый кэш у Karen
const hash = crypto.createHash('sha256');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) { if (path.relative(SITE, p) !== 'media') walk(p); }
  else if (e.name !== 'sw.js') { hash.update(path.relative(SITE, p)); hash.update(fs.readFileSync(p)); }
});
walk(SITE);
const lock = path.join(ROOT, 'tools', 'media.lock');
if (fs.existsSync(lock)) hash.update(fs.readFileSync(lock));
const version = hash.digest('hex').slice(0, 10);
const swPath = path.join(SITE, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/\/\*BUILD:START\*\/[\s\S]*?\/\*BUILD:END\*\//,
  `/*BUILD:START*/\nconst CACHE = 'kc-${version}';\nconst CORE = ${JSON.stringify(coreOk)};\nconst EXTRA = ${JSON.stringify(extraOk)};\n/*BUILD:END*/`);
fs.writeFileSync(swPath, sw);

console.log(JSON.stringify({ url: config.url, version: qr.version, ecl: config.ecl || 'M', modules: n, cache: `kc-${version}`, concepts: keys }));
