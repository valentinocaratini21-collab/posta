#!/usr/bin/env python3
# media-kenburns-pad.py — Lienzo 1080x1920 para foto→reel con zoom.
# Uso: python3 media-kenburns-pad.py <foto> <salida>
# La foto queda al 90% del lienzo (5% de margen por lado) sobre su
# propio fondo difuminado. El zoom posterior (hasta 1.11x) nunca
# corta la foto: el margen lo garantiza por construcción.
import sys, os
from PIL import Image, ImageFilter

def main():
    if len(sys.argv) < 3:
        print('uso: media-kenburns-pad.py <foto> <salida>', file=sys.stderr); return 1
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(src).convert('RGB')
    W, H = 1080, 1920
    scale = max(W / im.width, H / im.height)
    bg = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    bg = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H))
    bg = bg.filter(ImageFilter.GaussianBlur(25))
    # Foto al 90%: cabe entera con margen.
    fit = min(W * 0.9 / im.width, H * 0.9 / im.height)
    fg = im.resize((round(im.width * fit), round(im.height * fit)), Image.LANCZOS)
    out = bg.copy()
    out.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
    out.save(dst, quality=92)
    print('ok lienzo 1080x1920 foto %dx%d' % (fg.width, fg.height))
    return 0

if __name__ == '__main__':
    sys.exit(main())
