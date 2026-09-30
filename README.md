# Karen · Let's connect

Страница для нетворкинга: Karen открывает её на телефоне, тапает, собеседник видит короткий
кинематографичный 3D-reveal (сделан в Higgsfield) и сканирует QR, который ведёт ровно на
`https://www.linkedin.com/in/karen-ramirez-munoz/`.

## Как устроено
- `site/` деплоится как есть, без сборки на стороне Cloudflare.
- `site/index.html`: вся страница (HTML, CSS, JS в одном файле). QR вшит внутрь как вектор (SVG),
  он виден даже без JavaScript и без видео.
- `site/sw.js`: Service Worker, после первого открытия страница работает без интернета.
- `site/_headers`: заголовки Cloudflare. CSP разрешает только свой домен: ни трекеров, ни внешних запросов.
- `site/media/<стиль>/`: `start.webp` (первый кадр), `reveal.mp4` (reveal), `end.webp` (последний кадр).
- `tools/config.json`: ссылка, стили и положение QR в кадре каждого стиля.

## Обновить
```bash
npm install
node tools/build.mjs          # пересобрать QR, позиции, список офлайн-кэша
node tools/verify.mjs         # проверка в Chromium 390×844: скриншоты в tools/out/
pip install zxing-cpp opencv-python-headless Pillow numpy
python3 tools/decode_qr.py "https://www.linkedin.com/in/karen-ramirez-munoz/" tools/out/*.png
```
После `git push` в `main` Cloudflare Pages деплоит сам.

## Cloudflare Pages (один раз)
Workers & Pages → Create → Pages → Connect to Git → `karen-connect` →
Production branch `main`, Framework preset `None`, Build command пусто, Build output directory `site`.
Web Analytics не включать.

## For Karen
1. Open the link on Wi-Fi, tap Share → **Add to Home Screen**.
2. Open it once from the Home Screen icon and wait ~10 seconds: in ✦ it should say *Ready: works without internet*.
3. At the conference: open, turn the phone to the person, tap. The QR appears after the reveal.
   - Tap during the reveal to skip. ↺ plays it again for the next person.
   - ⤢ shows a big white QR for bad lighting. Share sends the link by AirDrop or Messages.
   - ✦ changes the style or turns the animation off.
