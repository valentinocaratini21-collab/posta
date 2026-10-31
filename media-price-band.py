#!/usr/bin/env python3
# media-price-band.py — Banda de precio para foto de OFERTA.
# Uso: python3 media-price-band.py <foto> <salida> <precio> <pos> <color-hex>
# La banda se AGREGA (el lienzo crece): nunca tapa la foto ni el
# producto, por construcción. pos: 'sup' (arriba) o 'inf' (abajo).
# El precio viene del fundamento (lo valida el servidor); este script
# solo lo dibuja, nunca lo inventa.
import sys
from PIL import Image, ImageDraw, ImageFont

def font(sz):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              'fonts/Montserrat-700.ttf', 'work/fonts/Montserrat-700.ttf'):
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            continue
    return ImageFont.load_default()

def main():
    if len(sys.argv) < 6:
        print('uso: media-price-band.py <foto> <salida> <precio> <pos> <color>', file=sys.stderr); return 1
    src, dst, precio, pos, color = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
    im = Image.open(src).convert('RGB')
    w, h = im.size
    band_h = max(90, h // 8)
    out = Image.new('RGB', (w, h + band_h), (0, 0, 0))
    if pos == 'sup':
        band_y = 0; out.paste(im, (0, band_h))
    else:
        band_y = h; out.paste(im, (0, 0))
    d = ImageDraw.Draw(out)
    try:
        rgb = tuple(int(color.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        rgb = (10, 30, 51)
    d.rectangle([0, band_y, w, band_y + band_h], fill=rgb)
    f = font(band_h // 2)
    tb = d.textbbox((0, 0), precio, font=f)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text(((w - tw) // 2, band_y + (band_h - th) // 2 - tb[1]), precio, font=f, fill=(255, 255, 255))
    out.save(dst, quality=92)
    print('ok banda %s %dx%d' % (pos, w, h + band_h))
    return 0

if __name__ == '__main__':
    sys.exit(main())
