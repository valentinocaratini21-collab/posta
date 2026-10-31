#!/usr/bin/env python3
# media-straighten.py — Endereza una foto torcida SIN RECORTAR NADA.
# Uso: python3 media-straighten.py <foto> <salida> <angulo-horario>
# angulo: grados de inclinación en sentido horario (positivo = cae a
# la derecha). PIL rotate(angulo) gira en sentido antihorario, así que
# corrige exactamente ese tilt. expand=True: el lienzo crece, ningún
# píxel se pierde; las esquinas nuevas se rellenan con el color medio
# de las cuatro esquinas originales (nunca negro puro ni recorte).
import sys
from PIL import Image

def main():
    if len(sys.argv) < 4:
        print('uso: media-straighten.py <foto> <salida> <angulo>', file=sys.stderr); return 1
    src, dst, ang = sys.argv[1], sys.argv[2], float(sys.argv[3])
    im = Image.open(src).convert('RGB')
    w, h = im.size
    corners = [im.getpixel((0, 0)), im.getpixel((w - 1, 0)), im.getpixel((0, h - 1)), im.getpixel((w - 1, h - 1))]
    fill = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    out = im.rotate(ang, expand=True, fillcolor=fill, resample=Image.BICUBIC)
    out.save(dst, quality=92)
    print('ok %dx%d -> %dx%d' % (w, h, out.size[0], out.size[1]))
    return 0

if __name__ == '__main__':
    sys.exit(main())
