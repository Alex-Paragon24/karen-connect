#!/usr/bin/env python3
"""Декодирует QR со скриншотов двумя независимыми декодерами (zxing-cpp, OpenCV)
и проверяет, что строка побайтно совпадает с ожидаемой ссылкой.
Плюс стресс-тесты: уменьшение, размытие, JPEG, перспектива, блик.

Запуск: python3 tools/decode_qr.py "https://..." shot1.png [shot2.png ...]
Нужно: pip install zxing-cpp opencv-python-headless Pillow numpy
"""
import json
import sys

import cv2
import numpy as np
import zxingcpp
from PIL import Image


def decode_all(img_bgr):
    """Возвращает тексты, найденные каждым декодером."""
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    z = [b.text for b in zxingcpp.read_barcodes(Image.fromarray(rgb))]
    try:
        data, _, _ = cv2.QRCodeDetector().detectAndDecode(img_bgr)
    except cv2.error:
        data = ''
    return {'zxing': z, 'opencv': data}


def variants(img):
    """Имитация реального скана: камера дальше, расфокус, сжатие, наклон, блик лампы."""
    h, w = img.shape[:2]
    half = cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
    out = {
        'original': img,
        'scale_50': half,
        'scale_33': cv2.resize(img, (w // 3, h // 3), interpolation=cv2.INTER_AREA),
        'blur': cv2.GaussianBlur(half, (0, 0), 1.6),
    }
    ok, enc = cv2.imencode('.jpg', half, [cv2.IMWRITE_JPEG_QUALITY, 40])
    out['jpeg_q40'] = cv2.imdecode(enc, cv2.IMREAD_COLOR)
    hh, ww = half.shape[:2]
    for name, dx in (('tilt_left', 0.15), ('tilt_right', -0.15)):
        src = np.float32([[0, 0], [ww, 0], [ww, hh], [0, hh]])
        d = dx * ww
        dst = np.float32([[max(d, 0), 0], [ww - max(-d, 0), 0], [ww - max(-d, 0) * 0.4, hh], [max(d, 0) * 0.4, hh]])
        m = cv2.getPerspectiveTransform(src, dst)
        out[name] = cv2.warpPerspective(half, m, (ww, hh), borderValue=(40, 30, 20))
    glare = half.copy().astype(np.float32)
    mask = np.zeros((hh, ww), np.float32)
    cv2.ellipse(mask, (int(ww * 0.58), int(hh * 0.47)), (int(ww * 0.09), int(hh * 0.035)), 30, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), 9)[..., None] * 0.75
    out['glare'] = np.clip(glare * (1 - mask) + 255 * mask, 0, 255).astype(np.uint8)
    dim = half.astype(np.float32) * 0.55 + np.random.default_rng(1).normal(0, 6, half.shape)
    out['dim_noisy'] = np.clip(dim, 0, 255).astype(np.uint8)
    return out


def main():
    expected = sys.argv[1]
    report = {}
    all_ok = True
    for path in sys.argv[2:]:
        img = cv2.imread(path)
        res = {}
        for name, v in variants(img).items():
            d = decode_all(v)
            ok_z = expected in d['zxing'] and all(t == expected for t in d['zxing'])
            ok_cv = d['opencv'] == expected
            res[name] = {'zxing': ok_z, 'opencv': ok_cv}
            if name == 'original' and not (ok_z and ok_cv):
                all_ok = False
                res[name]['got'] = d
        report[path] = res
    print(json.dumps({'expected': expected, 'all_originals_ok': all_ok, 'results': report}, indent=1))
    sys.exit(0 if all_ok else 1)


if __name__ == '__main__':
    main()
