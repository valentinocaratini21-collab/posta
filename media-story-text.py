#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Historia de texto (último día de oferta / stock real): 1080x1920,
# fondo oscuro, línea 1 grande + línea 2 (título/producto) envuelta.
# Solo texto real que pasa el servidor: nunca urgencia ni stock
# inventados (el servidor decide si hay historia o no).
# Uso: python3 media-story-text.py <salida> <linea1> <linea2>
import sys
from PIL import Image, ImageDraw, ImageFont


def font(size, bold=True):
    for name in (("DejaVuSans-Bold" if bold else "DejaVuSans") + ".ttf",):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()


def wrap(draw, text, fnt, max_w):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines[:3]


def main():
    if len(sys.argv) < 4:
        print("uso: media-story-text.py <salida> <linea1> <linea2>")
        return 2
    out, linea1, linea2 = sys.argv[1], sys.argv[2], sys.argv[3]
    W, H = 1080, 1920
    im = Image.new("RGB", (W, H), (10, 30, 51))
    d = ImageDraw.Draw(im)
    # Acento superior dorado.
    d.rectangle([0, 0, W, 18], fill=(254, 193, 77))
    f1 = font(130)
    # Línea 1: puede partirse en 2 si es larga.
    l1 = wrap(d, linea1, f1, W - 120)
    y = 780
    for ln in l1:
        w = d.textlength(ln, font=f1)
        d.text(((W - w) / 2, y), ln, font=f1, fill=(255, 255, 255))
        y += 160
    f2 = font(72, bold=False)
    y += 40
    for ln in wrap(d, linea2, f2, W - 160):
        w = d.textlength(ln, font=f2)
        d.text(((W - w) / 2, y), ln, font=f2, fill=(254, 193, 77))
        y += 100
    im.save(out, "JPEG", quality=92)
    return 0


if __name__ == "__main__":
    sys.exit(main())
