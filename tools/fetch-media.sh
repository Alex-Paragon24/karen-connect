#!/usr/bin/env bash
# Build command для Cloudflare Pages: скачивает архив медиа из tools/media.lock,
# проверяет sha256 и распаковывает в site/media. Если медиа уже лежат в репо, ничего не делает.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f site/media/ace/reveal.mp4 ] && [ -f site/media/home/loop.mp4 ]; then
  echo "media already present, skip"; exit 0
fi
read -r URL SHA < <(grep -v '^#' tools/media.lock | head -1)
TMP="$(mktemp)"
curl -fsSL --retry 3 "$URL" -o "$TMP"
echo "$SHA  $TMP" | sha256sum -c -
mkdir -p site
tar -xf "$TMP" -C site
rm -f site/media/manifest.json "$TMP"
ls -la site/media/*/
