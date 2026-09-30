"""Тестовые двойники для проверки запасного пути «mp4 внутри <img>» (режим энергосбережения iPhone).

Chromium не умеет mp4 в <img>, поэтому verify.mjs подменяет их на анимированные WebP отсюда.
Кадры синтетические: яркость интро растёт со временем (по скриншоту видно, на какой секунде ролик),
петля зеленоватая, чтобы её было легко отличить от интро.
Запуск: python3 tools/make-img-twins.py   (нужен Pillow; файлы в site/media/home/, в git не попадают)
"""
import math
import os

from PIL import Image

HOME = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'media', 'home')
FPS, W, H = 12, 270, 480
INTRO_DUR = 5.04  # как у настоящего интро


def intro_frame(t):
    g = int(20 + 35 * t)  # 20 в начале, ~196 в конце
    return Image.new('RGB', (W, H), (g, g, g))


def loop_frame(i, n):
    k = int(40 * math.sin(2 * math.pi * i / n))
    return Image.new('RGB', (W, H), (40, 150 + k, 60))


os.makedirs(HOME, exist_ok=True)
n_intro = round(INTRO_DUR * FPS)
frames = [intro_frame(i / FPS) for i in range(n_intro)]
frames[0].save(os.path.join(HOME, 'intro.test.webp'), save_all=True, append_images=frames[1:],
               duration=round(1000 / FPS), loop=0, lossless=True)
n_loop = 2 * FPS
frames = [loop_frame(i, n_loop) for i in range(n_loop)]
frames[0].save(os.path.join(HOME, 'loop.test.webp'), save_all=True, append_images=frames[1:],
               duration=round(1000 / FPS), loop=0, lossless=True)
print('ok:', os.path.join(HOME, 'intro.test.webp'), os.path.join(HOME, 'loop.test.webp'))
