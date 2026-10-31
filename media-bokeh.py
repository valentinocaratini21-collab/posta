#!/usr/bin/env python3
# media-bokeh.py — Fondo difuminado, producto NÍTIDO e intacto.
# Uso: python3 media-bokeh.py <foto> <salida> <caja-json-0-1000> [radio]
# La caja del sujeto se copia TAL CUAL (sin tocar un píxel); fuera de
# ella, desenfoque gaussiano con borde difuminado (feather). Sin caja
# válida no hay bokeh: el producto nunca se difumina por error.
import sys, json
from PIL import Image, ImageFilter, ImageDraw

def main():
    if len(sys.argv) < 4:
        print('uso: media-bokeh.py <foto> <salida> <caja> [radio]', file=sys.stderr); return 1
    src, dst = sys.argv[1], sys.argv[2]
    box = json.loads(sys.argv[3])
    radius = float(sys.argv[4]) if len(sys.argv) > 4 else 25
    im = Image.open(src).convert('RGB')
    w, h = im.size
    x0 = int(box['x'] / 1000 * w); y0 = int(box['y'] / 1000 * h)
    x1 = int((box['x'] + box['w']) / 1000 * w); y1 = int((box['y'] + box['h']) / 1000 * h)
    blurred = im.filter(ImageFilter.GaussianBlur(radius))
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rectangle([x0, y0, x1, y1], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(2, radius / 3)))
    out = Image.composite(im, blurred, mask)
    out.save(dst, quality=92)
    print('ok bokeh %dx%d caja %d,%d-%d,%d' % (w, h, x0, y0, x1, y1))
    return 0

if __name__ == '__main__':
    sys.exit(main())
