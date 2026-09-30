// Превью ссылки для iMessage/WhatsApp (1200×630): слева 3D-сцена главной (кроп постера), справа золотое «Karen».
// Рисуем HTML в Chromium (Playwright), шрифты встраиваем как data: URL.
// Запуск: node tools/make-og.mjs <кроп-сцены.jpg> [выход.jpg]
//   кроп из постера: ffmpeg -i poster.png -vf crop=1076:1130:0:206 scene.jpg
// Итоговая картинка лежит в архиве медиа как media/og.jpg (см. tools/media.lock), на сайте /media/og.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [scene, out = path.join(ROOT, 'tools', 'out', 'og.jpg')] = process.argv.slice(2);
if (!scene) { console.error('usage: node tools/make-og.mjs <scene.jpg> [out.jpg]'); process.exit(1); }

const font = (n) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'site/fonts', n)).toString('base64');
const img = 'data:image/jpeg;base64,' + fs.readFileSync(scene).toString('base64');
const html = `<!doctype html><html><head><style>
@font-face { font-family: P; font-style: italic; font-weight: 600; src: url(${font('playfair-display-latin-600-italic.woff2')}); }
@font-face { font-family: L; font-weight: 700; src: url(${font('lato-latin-700-normal.woff2')}); }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #140e0a; }
.img { position: absolute; left: 0; top: 0; width: 660px; height: 630px; background: url(${img}) center / cover; }
.fade { position: absolute; left: 420px; top: 0; width: 260px; height: 630px; background: linear-gradient(90deg, rgba(20,14,10,0), #140e0a); }
.txt { position: absolute; left: 640px; right: 30px; top: 0; bottom: 0; display: flex; flex-direction: column;
  justify-content: center; align-items: center; text-align: center; }
.eb { font: 700 24px L; letter-spacing: .42em; text-transform: uppercase; color: #f3e3b5; padding-left: .42em; }
.name { position: relative; margin-top: 12px; font: italic 600 150px/1 P; }
.name span { display: inline-block; padding: 0 .1em .08em; }
.glow { position: absolute; left: 0; top: 0; color: #f5b82e; opacity: .55; filter: blur(20px); }
.ink { position: relative; background: linear-gradient(100deg, #e0a21c 0%, #f7cc4a 18%, #fff1b8 42%, #fff 48%, #fff1b8 54%, #f5c842 72%, #c58a0a 100%);
  -webkit-background-clip: text; color: transparent; }
.line { width: 160px; height: 1px; margin: 22px auto 20px; background: linear-gradient(90deg, transparent, #d4a017, transparent); }
.sub { font: 700 20px L; letter-spacing: .3em; text-transform: uppercase; color: rgba(251,243,221,.75); padding-left: .3em; }
</style></head><body><div class="img"></div><div class="fade"></div><div class="txt"><div class="eb">Let's connect</div>
<div class="name"><span class="glow">Karen</span><span class="ink">Karen</span></div><div class="line"></div>
<div class="sub">Tap · Watch · Scan</div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
await browser.close();
console.log('og ok:', out);
