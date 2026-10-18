#!/usr/bin/env python3
"""Extrae hasta 2 colores EXACTOS dominantes (hex) de una imagen.
Uso: extract_colors.py <ruta-imagen>  ->  imprime "#AABBCC #DDEEFF"
- Devuelve el tono exacto más frecuente de cada grupo de color (no el centro
  aproximado del bucket): el color del logo sale idéntico al original.
- Sin suavizado al achicar: los colores planos quedan puros, sin tonos de
  borde inventados por el reescalado.
- El puntaje mezcla frecuencia con saturación: un acento chico pero vivo
  (ej. el puntito del logo) le gana a variantes apagadas con más píxeles.
- Diversidad perceptual: un tono casi idéntico a uno ya elegido (ej. bordes
  anti-aliased del mismo navy) no ocupa el lugar de un color distinto
  (ej. el puntito celeste).
Ignora blancos, negros y grises.

Modo "rich" (para la paleta heredada del feed, demo.js):
  extract_colors.py <ruta-imagen> rich
  Imprime hasta 10 líneas "#AABBCC 0.1234" (hex + fracción de píxeles de la
  foto que ocupa el grupo). La selección mezcla peso (frecuencia) y puntaje,
  con la misma diversidad perceptual >= 48 entre elegidos. El modo por
  defecto no cambia: sigue imprimiendo los 2 colores de siempre.
"""
import math
import sys
from PIL import Image


def collect_buckets(im):
    # key -> [n, sat_sum, {rgb_int: count}, best_rgb, best_count]
    buckets = {}
    for r, g, b in im.getdata():
        mx, mn = max(r, g, b), min(r, g, b)
        if mx - mn < 28:
            continue  # grises
        if mx > 242 and mn > 225:
            continue  # blancos
        if mx < 24:
            continue  # negros
        key = (r >> 5, g >> 5, b >> 5)
        e = buckets.get(key)
        if e is None:
            e = buckets[key] = [0, 0.0, {}, 0, 0]
        e[0] += 1
        e[1] += (mx - mn) / 255.0
        ek = (r << 16) | (g << 8) | b
        c = e[2].get(ek, 0) + 1
        e[2][ek] = c
        if c > e[4]:
            e[4] = c
            e[3] = ek
    return buckets


def to_hex(entry):
    v = entry[3]
    return "#%02X%02X%02X" % ((v >> 16) & 255, (v >> 8) & 255, v & 255)


def rgb(entry):
    v = entry[3]
    return ((v >> 16) & 255, (v >> 8) & 255, v & 255)


def cdist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def score(e):
    n, sat = e[0], e[1]
    return n * (0.25 + 2.0 * (sat / n))


def load_buckets(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((120, 120), Image.NEAREST)
    return im, collect_buckets(im)


def main():
    _, buckets = load_buckets(sys.argv[1])
    scored = sorted(buckets.values(), key=score, reverse=True)
    picked = []
    for e in scored:
        if all(cdist(rgb(e), rgb(p)) >= 48 for p in picked):
            picked.append(e)
            if len(picked) == 2:
                break
    print(" ".join(to_hex(e) for e in picked))


def rich_main():
    im, buckets = load_buckets(sys.argv[1])
    total = max(1, im.size[0] * im.size[1])
    by_weight = sorted(buckets.values(), key=lambda e: e[0], reverse=True)
    by_score = sorted(buckets.values(), key=score, reverse=True)
    picked = []
    for e in by_weight + by_score:
        if any(p is e for p in picked):
            continue
        if all(cdist(rgb(e), rgb(p)) >= 48 for p in picked):
            picked.append(e)
            if len(picked) == 10:
                break
    for e in picked:
        print("%s %.4f" % (to_hex(e), e[0] / total))


if len(sys.argv) > 2 and sys.argv[2] == "rich":
    rich_main()
else:
    main()
