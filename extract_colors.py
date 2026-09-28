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
"""
import math
import sys
from PIL import Image


def main():
    im = Image.open(sys.argv[1]).convert("RGB")
    im.thumbnail((120, 120), Image.NEAREST)
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

    scored = sorted(buckets.values(), key=score, reverse=True)
    picked = []
    for e in scored:
        if all(cdist(rgb(e), rgb(p)) >= 48 for p in picked):
            picked.append(e)
            if len(picked) == 2:
                break
    print(" ".join(to_hex(e) for e in picked))


main()
