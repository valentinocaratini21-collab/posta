#!/usr/bin/env python3
# feed-sheet.py — Hoja de contacto 2x2 de las fotos del feed (v198).
# La usa demo-ai.js para clasificar el feed (foto real vs ilustrado) con
# UNA sola llamada de visión barata sobre la grilla, no foto por foto.
# Uso: python3 feed-sheet.py <salida.jpg> <foto1> [foto2] [foto3] [foto4]
import sys


def main():
    from PIL import Image
    out = sys.argv[1]
    paths = sys.argv[2:6]
    imgs = []
    for p in paths:
        try:
            imgs.append(Image.open(p).convert('RGB'))
        except Exception:
            continue
    if not imgs:
        return 1
    cell = 360
    cols = 2 if len(imgs) > 1 else 1
    rows = (len(imgs) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell, rows * cell), (24, 24, 24))
    for i, im in enumerate(imgs):
        s = max(cell / im.width, cell / im.height)
        im2 = im.resize((max(1, int(im.width * s + 0.5)), max(1, int(im.height * s + 0.5))))
        cx = (im2.width - cell) // 2
        cy = (im2.height - cell) // 2
        im2 = im2.crop((cx, cy, cx + cell, cy + cell))
        sheet.paste(im2, ((i % cols) * cell, (i // cols) * cell))
    sheet.save(out, 'JPEG', quality=80)
    return 0


if __name__ == '__main__':
    sys.exit(main())
