#!/usr/bin/env python3
# media-variants.py — variantes livianas de una imagen de /media para la UI:
#   <base>@640.webp (ancho 640, q78) — las tarjetas del Schedule
#   <base>@24.webp  (ancho 24, q60)  — placeholder borroso instantáneo
# La imagen maestra (la que se publica en Instagram) NO se toca.
# Uso: python3 media-variants.py --in /ruta/imagen.jpg
import argparse
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    a = ap.parse_args()
    from PIL import Image
    img = Image.open(a.inp).convert('RGB')
    base = a.inp.rsplit('.', 1)[0]
    for wdt, q, suf in ((640, 78, '@640.webp'), (24, 60, '@24.webp')):
        if img.width > wdt:
            img.resize((wdt, max(1, round(img.height * wdt / img.width))), Image.LANCZOS).save(base + suf, 'WEBP', quality=q)
        else:
            img.save(base + suf, 'WEBP', quality=q)
    print('ok')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('variants fail:', e, file=sys.stderr)
        sys.exit(1)
