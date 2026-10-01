#!/usr/bin/env python3
# brand-card.py — Tarjeta de marca de respaldo (fallback nivel 2 de ensurePostImage).
# Renderiza un PNG 1080x1350 con PIL: fondo color de marca (o foto del cliente
# con overlay oscuro), titular centrado, nombre del negocio arriba y logo
# abajo-derecha si existe. Nunca crashea por assets faltantes: los ignora.
# Uso: python3 brand-card.py --headline "..." --bg "#0A1E33" --text "#FFFFFF"
#        --business "Mi Negocio" --logo /path/logo.png --photo /path/foto.jpg --out /path/salida.png
import argparse
import sys


def hexcolor(h, default):
    try:
        h = str(h or '').strip().lstrip('#')
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except Exception:
        return default


def load_font(bold, size):
    from PIL import ImageFont
    for name in (['DejaVuSans-Bold.ttf', 'DejaVuSans.ttf'] if bold else ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def wrap(draw, text, font, max_w):
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
    return lines[:8]


def main():
    from PIL import Image, ImageDraw, ImageFilter
    ap = argparse.ArgumentParser()
    ap.add_argument('--headline', default='')
    ap.add_argument('--bg', default='#0A1E33')
    ap.add_argument('--text', default='#FFFFFF')
    ap.add_argument('--business', default='')
    ap.add_argument('--logo', default='')
    ap.add_argument('--photo', default='')
    ap.add_argument('--out', required=True)
    ap.add_argument('--w', type=int, default=1080)
    ap.add_argument('--h', type=int, default=1350)
    ap.add_argument('--mode', default='card')  # card | story (1080x1920, respeta safe areas de IG)
    ap.add_argument('--sub', default='')  # subtítulo/línea secundaria (modo story)
    a = ap.parse_args()

    W, H = a.w, a.h
    story_mode = (a.mode == 'story')
    bg = hexcolor(a.bg, (10, 30, 51))
    fg = hexcolor(a.text, (255, 255, 255))
    img = Image.new('RGB', (W, H), bg)

    # Foto del cliente como fondo (cover) con overlay oscuro para legibilidad.
    if a.photo:
        try:
            ph = Image.open(a.photo).convert('RGB')
            scale = max(W / ph.width, H / ph.height)
            ph = ph.resize((int(ph.width * scale) + 1, int(ph.height * scale) + 1), Image.LANCZOS)
            x = (ph.width - W) // 2
            y = (ph.height - H) // 2
            img.paste(ph.crop((x, y, x + W, y + H)), (0, 0))
            overlay = Image.new('RGBA', (W, H), (0, 0, 0, 150))
            img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
        except Exception as e:
            print('brand-card: foto ignorada:', e, file=sys.stderr)

    d = ImageDraw.Draw(img)
    margin = 90

    # Nombre del negocio arriba (en modo story más abajo: safe area de IG).
    if a.business:
        f_biz = load_font(False, 44)
        biz = str(a.business)[:48]
        d.text((W // 2, 300 if story_mode else 120), biz, font=f_biz, fill=fg, anchor='mm')

    # Titular centrado, auto-shrink hasta que entre.
    headline = str(a.headline or '').strip()
    sub = str(a.sub or '').strip()
    center_y = int(H * 0.42) if story_mode else H // 2
    if headline:
        size = 104
        lines = []
        while size >= 44:
            f = load_font(True, size)
            lines = wrap(d, headline, f, W - margin * 2)
            # medir alto total
            hs = [d.textbbox((0, 0), ln, font=f)[3] for ln in lines]
            total_h = sum(hs) + (len(lines) - 1) * int(size * 0.25)
            if total_h <= H * (0.42 if story_mode else 0.55):
                break
            size -= 8
        f = load_font(True, max(size, 44))
        line_h = int(size * 0.25)
        total = sum(d.textbbox((0, 0), ln, font=f)[3] for ln in lines) + (len(lines) - 1) * line_h
        y = center_y - total // 2
        for ln in lines:
            d.text((W // 2, y), ln, font=f, fill=fg, anchor='ma')
            y += d.textbbox((0, 0), ln, font=f)[3] + line_h
        # Subtítulo debajo del titular (modo story).
        if sub and story_mode:
            f_sub = load_font(True, 56)
            sub_lines = wrap(d, sub, f_sub, W - margin * 2)[:3]
            y += 30
            for ln in sub_lines:
                d.text((W // 2, y), ln, font=f_sub, fill=fg, anchor='ma')
                y += d.textbbox((0, 0), ln, font=f_sub)[3] + 14

    # Logo abajo-derecha (máx 220px), con máscara si tiene alpha.
    if a.logo:
        try:
            lg = Image.open(a.logo).convert('RGBA')
            lg.thumbnail((220, 220), Image.LANCZOS)
            img.paste(lg, (W - lg.width - 70, H - lg.height - 70), lg)
        except Exception as e:
            print('brand-card: logo ignorado:', e, file=sys.stderr)

    img.save(a.out, 'PNG')
    print('ok', a.out)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('brand-card error:', e, file=sys.stderr)
        sys.exit(1)
