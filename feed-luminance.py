#!/usr/bin/env python3
"""Luminancia media (0..1) de una o más imágenes — el REGISTRO del feed.

Uso: feed-luminance.py <img1> [img2 ...]  ->  imprime la luminancia media
promediada por imagen (cada imagen pesa lo mismo, haya 1 o 3 fotos).

Se usa para que la semana de la prueba herede el registro lumínico del
perfil que ya existe (v197): un feed luminoso (crema/amarillo/pastel)
produce piezas gráficas claras; un feed oscuro mantiene el registro
oscuro. La luminancia es la del canal L de PIL (ITU-R 601-2), la misma
noción que usa el ojo para "claro/oscuro" en una grilla.
"""
import sys

from PIL import Image


def main():
    vals = []
    for path in sys.argv[1:]:
        try:
            im = Image.open(path).convert("L")
        except Exception:
            continue
        im.thumbnail((96, 96))
        px = list(im.getdata())
        if px:
            vals.append(sum(px) / len(px) / 255.0)
    if not vals:
        sys.exit(1)
    print("%.4f" % (sum(vals) / len(vals)))


main()
