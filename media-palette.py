#!/usr/bin/env python3
# media-palette.py — Colores dominantes de una foto (para el aviso de
# paleta: solo compara, nunca recolorea ni bloquea).
# Uso: python3 media-palette.py <foto>
# Salida JSON: {"colors":["#rrggbb", ...]} (hasta 5, por peso).
import sys, json
from PIL import Image

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'uso: media-palette.py <foto>'})); return 1
    try:
        im = Image.open(sys.argv[1]).convert('RGB')
        small = im.resize((100, 100))
        colors = small.quantize(colors=5, method=Image.Quantize.MEDIANCUT).convert('RGB').getcolors(10000)
        colors = sorted(colors, key=lambda c: -c[0])
        out = ['#%02x%02x%02x' % c[1] for c in colors]
        print(json.dumps({'colors': out}))
        return 0
    except Exception as e:
        print(json.dumps({'error': str(e)})); return 1

if __name__ == '__main__':
    sys.exit(main())
