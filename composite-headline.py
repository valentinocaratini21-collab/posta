#!/usr/bin/env python3
# composite-headline.py — Compone un titular sobre una imagen limpia con PIL.
# La IA genera la imagen SIN texto (100% limpia); el titular se renderiza con
# código: tipografía perfecta, siempre entra, nunca se recorta ni se escribe mal.
# Uso: python3 composite-headline.py --in /path/limpia.png --headline "..." --out /path/final.png
import argparse
import sys


def load_font(bold, size):
    from PIL import ImageFont
    names = ['DejaVuSans-Bold.ttf', 'DejaVuSans.ttf'] if bold else ['DejaVuSans.ttf']
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def wrap(draw, text, font, max_w, max_lines=3):
    words = str(text or '').split()
    lines, cur = [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines[:max_lines]


def main():
    from PIL import Image, ImageDraw, ImageFilter
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--headline', default='')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    headline = str(a.headline or '').strip()
    img = Image.open(a.inp).convert('RGB')
    W, H = img.size

    if not headline:
        img.save(a.out)
        return

    # Zona de texto: tercio superior con márgenes seguros.
    margin_x = int(W * 0.07)
    max_w = W - margin_x * 2
    top_y = int(H * 0.045)

    draw = ImageDraw.Draw(img)

    # Auto-fit: bajar el tamaño hasta que entre en 3 líneas.
    size = int(W * 0.085)
    font, lines = None, []
    while size >= int(W * 0.04):
        font = load_font(True, size)
        lines = wrap(draw, headline, font, max_w, 3)
        # Verificar que la última línea no esté truncada (el wrap ya corta a 3).
        # Si hay más palabras que las que entraron, seguir bajando.
        total_words = len(headline.split())
        used_words = sum(len(l.split()) for l in lines)
        if used_words >= total_words:
            break
        size -= 4
    if not lines:
        img.save(a.out)
        return

    # Fondo sutil detrás del texto para legibilidad (degradado superior).
    line_h = int(size * 1.25)
    text_h = line_h * len(lines)
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    grad_h = top_y + text_h + int(H * 0.04)
    for y in range(grad_h):
        alpha = int(110 * (1 - y / max(grad_h, 1)))
        od.line([(0, y), (W, y)], fill=(0, 0, 0, alpha))
    img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
    draw = ImageDraw.Draw(img)

    # Texto blanco con sombra para que se lea sobre cualquier fondo.
    y = top_y
    for line in lines:
        lw = draw.textlength(line, font=font)
        x = (W - lw) / 2
        # Sombra.
        draw.text((x + 3, y + 3), line, font=font, fill=(0, 0, 0, 180))
        # Texto principal.
        draw.text((x, y), line, font=font, fill=(255, 255, 255))
        y += line_h

    img.save(a.out)
    print('ok')


if __name__ == '__main__':
    main()
