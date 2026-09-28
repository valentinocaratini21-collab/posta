#!/usr/bin/env python3
"""Extrae hasta 2 colores EXACTOS dominantes (hex) de una imagen.
Uso: extract_colors.py <ruta-imagen>  ->  imprime "#AABBCC #DDEEFF"
- Devuelve el tono exacto más frecuente de cada grupo de color (no el centro
  aproximado del bucket): el color del logo sale idéntico al original.
- El puntaje mezcla frecuencia con saturación: un acento chico pero vivo
  (ej. el puntito del logo) le gana a variantes apagadas con más píxeles.
Ignora blancos, negros y grises.
"""
import sys
from PIL import Image


def main():
    im = Image.open(sys.argv[1]).convert("RGB")
    im.thumbnail((120, 120))
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

    def score(item):
        n, sat = item[1][0], item[1][1]
        return n * (0.25 + 2.0 * (sat / n))

    ranked = sorted(buckets.items(), key=score, reverse=True)
    picked = []
    for k, e in ranked:
        if all(abs(p[0] - k[0]) + abs(p[1] - k[1]) + abs(p[2] - k[2]) >= 3 for p, _ in picked):
            picked.append((k, e))
            if len(picked) == 2:
                break
    print(" ".join(to_hex(e) for _, e in picked))


main()
