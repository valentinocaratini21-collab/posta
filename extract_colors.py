#!/usr/bin/env python3
"""Extrae hasta 2 colores dominantes (hex) de una imagen.
Uso: extract_colors.py <ruta-imagen>  ->  imprime "#AABBCC #DDEEFF"
Ignora blancos, negros y grises (igual que la deteccion anterior en el browser).
"""
import sys
from PIL import Image


def main():
    im = Image.open(sys.argv[1]).convert("RGB")
    im.thumbnail((120, 120))
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
        buckets[key] = buckets.get(key, 0) + 1

    def to_hex(c):
        return "#%02X%02X%02X" % tuple(min(255, v * 32 + 16) for v in c)

    ranked = sorted(buckets.items(), key=lambda kv: -kv[1])
    picked = []
    for k, _ in ranked:
        if all(abs(p[0] - k[0]) + abs(p[1] - k[1]) + abs(p[2] - k[2]) >= 3 for p in picked):
            picked.append(k)
            if len(picked) == 2:
                break
    print(" ".join(to_hex(c) for c in picked))


main()
