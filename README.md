# Karen · Let's connect

Страница для нетворкинга: Karen открывает её на телефоне, выбирает эффект и тапает. Собеседник видит
короткий кинематографичный 3D-reveal (сделан в Higgsfield) и сканирует QR, который ведёт ровно на
`https://www.linkedin.com/in/karen-ramirez-munoz/`.

Живая страница: https://karen-connect.pages.dev

## Как устроено
- `site/`: то, что отдаёт Cloudflare Pages.
- `site/index.html`: вся страница (HTML, CSS, JS в одном файле). QR вшит внутрь как вектор (SVG),
  он виден даже без JavaScript и без видео.
- `site/sw.js`: Service Worker, после первого открытия страница работает без интернета.
- `site/_headers`: заголовки Cloudflare. CSP разрешает только свой домен: ни трекеров, ни внешних запросов.
- `site/media/` (не в git): ролики и кадры из Higgsfield.
  - `home/`: `intro.mp4` (появление главной), `loop.mp4` (петля), `poster.webp`
  - `ace/`, `marquee/`, `jackpot/`: `thumb.webp` (плитка выбора), `start.webp` (первый кадр),
    `reveal.mp4`, `end.webp` (последний кадр, на нём лежит QR)
  - `og.jpg`: картинка превью ссылки в iMessage и WhatsApp
- `tools/media.lock`: ссылка на архив медиа и его sha256. При каждой сборке Cloudflare запускает
  `tools/fetch-media.sh`: скачивает архив, сверяет sha256 и распаковывает в `site/media/`.
- `tools/config.json`: ссылка, эффекты и положение QR в кадре каждого эффекта.

## Обновить
```bash
npm install
bash tools/fetch-media.sh     # скачать медиа в site/media (один раз)
node tools/build.mjs          # пересобрать QR, позиции, список офлайн-кэша
node tools/verify.mjs         # проверка в Chromium 390×844: скриншоты в tools/out/
pip install zxing-cpp opencv-python-headless Pillow numpy
python3 tools/decode_qr.py "https://www.linkedin.com/in/karen-ramirez-munoz/" tools/out/*.png
```
После `git push` в `main` Cloudflare Pages деплоит сам.

Chromium из Playwright не играет H.264. Чтобы `verify.mjs` проверял сами ролики, рядом с каждым
`.mp4` кладётся копия `.test.webm` (в деплой не попадает, `site/media/` не в git):
```bash
for f in site/media/*/*.mp4; do ffmpeg -loglevel error -y -i "$f" -c:v libvpx-vp9 -b:v 0 -crf 34 -an "${f%.mp4}.test.webm"; done
```

Новые медиа: упаковать папку `media/` в tar, загрузить туда, где есть прямая ссылка, записать
`URL SHA256` в `tools/media.lock`, запустить `node tools/build.mjs` (обновит версию офлайн-кэша) и запушить.

Резервная копия: архив медиа лежит на CDN Higgsfield. Живой сайт от него не зависит, а новая сборка
зависит. Лучше скачать архив по ссылке из `tools/media.lock` и хранить у себя.

## Cloudflare Pages (один раз)
Workers & Pages → Create → Pages → Connect to Git → `karen-connect` →
Production branch `main`, Framework preset `None`, Build command `bash tools/fetch-media.sh`,
Build output directory `site`. Web Analytics не включать.

## For Karen
1. Open the link on Wi-Fi, tap Share → **Add to Home Screen**.
2. Open it once from the Home Screen icon and wait ~10 seconds: under the effects it should say *Offline ready ✓*.
3. At the conference: open, pick an effect, turn the phone to the person, tap. The QR appears after the reveal.
   - Every open starts with a short intro. Tap to skip it.
   - Tap during the reveal to skip. ↺ plays it again for the next person.
   - ⤢ shows a big white QR for bad lighting. Share sends the link by AirDrop or Messages.
   - ✦ changes the effect or turns the animation off.
