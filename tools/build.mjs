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

// ---------- 2. Позиции QR поверх кадра для каждого стиля ----------
// В config.qr хранится квадрат модулей (без тихой зоны) в пикселях кадра: [x, y, side].
// Блок .qr включает тихую зону, поэтому расширяем его на QUIET модулей с каждой стороны.
const pct = (v) => `${(v * 100).toFixed(4)}%`;
const styleCss = Object.entries(config.styles).map(([key, s], i) => {
  const [fw, fh] = s.frame;
  const [x, y, side] = s.qr;
  const mod = side / n;
  const box = side + mod * QUIET * 2;
  const sel = i === 0 ? `:root, html[data-style="${key}"]` : `html[data-style="${key}"]`;
  return `  ${sel} { --start: url(/media/${key}/start.webp); --end: url(/media/${key}/end.webp); --ar: ${fw} / ${fh}; --arw: ${(fw / fh).toFixed(6)}; ` +
    `--qx: ${pct((x - mod * QUIET) / fw)}; --qy: ${pct((y - mod * QUIET) / fh)}; --qw: ${pct(box / fw)}; }`;
}).join('\n');
const jsConfig = JSON.stringify(Object.fromEntries(Object.entries(config.styles).map(([k, s]) => [k, { label: s.label, theme: s.theme, dur: s.dur }])));

// ---------- 3. Вшиваем в index.html между маркерами ----------
const indexPath = path.join(SITE, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const qrBlocks = html.match(/<!--QR:START-->[\s\S]*?<!--QR:END-->/g) || [];
if (qrBlocks.length !== 2) throw new Error(`ожидалось 2 места под QR, найдено ${qrBlocks.length}`);
html = html.replace(/<!--QR:START-->[\s\S]*?<!--QR:END-->/g, `<!--QR:START-->${svg}<!--QR:END-->`);
html = html.replace(/\/\*STYLES:START\*\/[\s\S]*?\/\*STYLES:END\*\//, `/*STYLES:START*/\n${styleCss}\n  /*STYLES:END*/`);
html = html.replace(/\/\*CONFIG:START\*\/[\s\S]*?\/\*CONFIG:END\*\//, `/*CONFIG:START*/${jsConfig}/*CONFIG:END*/`);
fs.writeFileSync(indexPath, html);

// ---------- 4. Список файлов для офлайна и версия кэша ----------
const keys = Object.keys(config.styles);
const first = keys[0];
const core = ['/', '/manifest.webmanifest', '/fonts/playfair-display-latin-400-italic.woff2', '/fonts/lato-latin-400-normal.woff2',
  '/fonts/lato-latin-700-normal.woff2', '/icons/apple-touch-icon.png', '/icons/icon-192.png', `/media/${first}/start.webp`, `/media/${first}/end.webp`];
const extra = [`/media/${first}/reveal.mp4`, ...keys.slice(1).flatMap((k) => [`/media/${k}/start.webp`, `/media/${k}/end.webp`, `/media/${k}/reveal.mp4`]), '/icons/icon-512.png'];
// в кэш кладём только существующие файлы, иначе установка Service Worker сорвётся
const exists = (f) => f === '/' || fs.existsSync(path.join(SITE, f));
for (const f of [...core, ...extra]) if (!exists(f)) console.warn(`! нет файла ${f}, пропускаю`);
const coreOk = core.filter(exists), extraOk = extra.filter(exists);
// версия = хэш содержимого всех файлов сайта: любое изменение → новый кэш у Karen
const hash = crypto.createHash('sha256');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) walk(p);
  else if (e.name !== 'sw.js') { hash.update(path.relative(SITE, p)); hash.update(fs.readFileSync(p)); }
});
walk(SITE);
const version = hash.digest('hex').slice(0, 10);
const swPath = path.join(SITE, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/\/\*BUILD:START\*\/[\s\S]*?\/\*BUILD:END\*\//,
  `/*BUILD:START*/\nconst CACHE = 'kc-${version}';\nconst CORE = ${JSON.stringify(coreOk)};\nconst EXTRA = ${JSON.stringify(extraOk)};\n/*BUILD:END*/`);
fs.writeFileSync(swPath, sw);

console.log(JSON.stringify({ url: config.url, version: qr.version, ecl: config.ecl || 'M', modules: n, cache: `kc-${version}`, styles: keys }));
