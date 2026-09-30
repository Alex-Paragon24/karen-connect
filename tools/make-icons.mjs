// Иконки для «На экран Домой» и вкладки: золотая K (Playfair Display italic) на тёплом тёмном фоне.
// Рисуем HTML в Chromium (Playwright) и сохраняем PNG. Запуск: node tools/make-icons.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// шрифт встраиваем как data: URL (страница из setContent не может читать file://)
import fs from 'node:fs';
const font = 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'site/fonts/playfair-display-latin-600-italic.woff2')).toString('base64');
const html = (size) => `<!doctype html><html><head><style>
@font-face { font-family: P; font-style: italic; font-weight: 600; src: url(${font}) format('woff2'); }
html, body { margin: 0; width: ${size}px; height: ${size}px; }
body { display: grid; place-items: center; background: radial-gradient(circle at 50% 38%, #3a2a1a 0%, #1a1410 70%); }
.ring { width: 78%; height: 78%; border-radius: 50%; display: grid; place-items: center;
  box-shadow: inset 0 0 0 ${size * 0.012}px rgba(245, 200, 66, .75), 0 0 ${size * 0.06}px rgba(245, 200, 66, .18); }
.k { font: italic 600 ${size * 0.5}px/1 P; transform: translate(-2%, -4%);
  background: linear-gradient(115deg, #b8860b 10%, #f5c842 40%, #fff3c4 55%, #d4a017 75%); -webkit-background-clip: text; color: transparent; }
</style></head><body><div class="ring"><span class="k">K</span></div></body></html>`;
const browser = await chromium.launch();
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ROOT, 'site/icons', name) });
  await page.close();
}
await browser.close();
console.log('icons ok');
