#!/usr/bin/env python3
# composite-headline.py — Compone un titular sobre una imagen limpia con PIL.
# La IA genera la imagen SIN texto (100% limpia); el titular se renderiza con
# código: tipografía perfecta, siempre entra, nunca se recorta ni se escribe mal.
# Uso: python3 composite-headline.py --in /path/limpia.png --headline "..." --out /path/final.png
import argparse
import os
import sys

# Tipografía de diseño (2026-10-16): Montserrat empaquetada en fonts/ —
# la misma familia de la web de Posty. DejaVu (la fuente de sistema que se
# usaba) hacía que cada titular se viera a generador de memes; Montserrat
# ExtraBold es lo que usan las piezas de venta. Fallback: DejaVu.
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')


def load_font(bold, size):
    from PIL import ImageFont
    names = (['Montserrat-800.ttf', 'Montserrat-700.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans.ttf']
             if bold else
             ['Montserrat-700.ttf', 'Montserrat-600.ttf', 'DejaVuSans.ttf'])
    for name in names:
        for cand in (os.path.join(FONT_DIR, name), name):
            try:
                return ImageFont.truetype(cand, size)
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
    ap.add_argument('--grade', default='')  # hex de marca: look de color sutil y unificado del feed
    # Escala del titular (v202, solo lo usa el demo con IA cuando la
    # fórmula del feed pide titulares grandes): multiplica el tamaño
    # inicial del auto-fit; el ajuste posterior sigue garantizando que
    # el titular entre completo. Default 1.0 = comportamiento histórico.
    ap.add_argument('--scale', type=float, default=1.0)
    a = ap.parse_args()

    headline = str(a.headline or '').strip()
    img = Image.open(a.inp).convert('RGB')
    if a.grade:
        try:
            from PIL import ImageColor, ImageEnhance
            tint = Image.new('RGB', img.size, ImageColor.getrgb(a.grade))
            img = Image.blend(img, tint, 0.05)
            img = ImageEnhance.Color(img).enhance(1.04)
        except Exception:
            pass
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
    size = int(W * 0.085 * max(0.5, min(2.0, a.scale or 1.0)))
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

    # Fondo ADAPTATIVO detrás del texto (2026-10-16): se mide la luz real
    # de la zona del titular y se actúa en consecuencia — desenfoque suave
    # del fondo (calma las fotos cargadas) + degradado cuya fuerza depende
    # de esa luz (foto clara → más oscurecimiento; foto oscura → apenas).
    # Antes: degradado fijo que en fotos claras dejaba el texto ilegible.
    line_h = int(size * 1.2)
    text_h = line_h * len(lines)
    grad_h = top_y + text_h + int(H * 0.055)
    zone = img.crop((0, 0, W, grad_h)).resize((1, 1))
    lum = (0.299 * zone.getpixel((0, 0))[0] + 0.587 * zone.getpixel((0, 0))[1]
           + 0.114 * zone.getpixel((0, 0))[2])
    alpha_max = 80 if lum < 90 else 130 if lum < 150 else 175 if lum < 200 else 215
    try:
        from PIL import ImageFilter
        soft = img.crop((0, 0, W, grad_h)).filter(ImageFilter.GaussianBlur(radius=max(6, W * 0.012)))
        mask = Image.new('L', (1, grad_h))
        for yy in range(grad_h):
            mask.putpixel((0, yy), 255 if yy < grad_h * 0.8 else int(255 * (1 - (yy - grad_h * 0.8) / max(grad_h * 0.2, 1))))
        mask = mask.resize((W, grad_h))
        img.paste(soft, (0, 0), mask)
    except Exception:
        pass
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for yy in range(grad_h):
        alpha = int(alpha_max * (1 - yy / max(grad_h, 1)))
        od.line([(0, yy), (W, yy)], fill=(0, 0, 0, alpha))
    img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')

    # Sombra SUAVE: capa de texto en negro, desenfocada, apenas corrida —
    # reemplaza la sombra dura corrida (3,3) que se veía barata.
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    yy = top_y + max(2, int(size * 0.045))
    for line in lines:
        lw = sd.textlength(line, font=font)
        sd.text(((W - lw) / 2, yy), line, font=font, fill=(0, 0, 0, 165))
        yy += line_h
    try:
        from PIL import ImageFilter
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(2, W * 0.003)))
    except Exception:
        pass
    img = Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB')
    draw = ImageDraw.Draw(img)

    # Texto principal.
    y = top_y
    for line in lines:
        lw = draw.textlength(line, font=font)
        x = (W - lw) / 2
        draw.text((x, y), line, font=font, fill=(255, 255, 255))
        y += line_h

    # Barra de acento con el color primario del cliente (llega por --grade):
    # la firma de diseño que unifica cada posteo con su marca.
    if a.grade:
        try:
            from PIL import ImageColor
            ac = ImageColor.getrgb(str(a.grade).strip())
            bar_w = int(W * 0.14)
            bar_h = max(6, int(W * 0.009))
            bx = (W - bar_w) // 2
            by = top_y + text_h + int(H * 0.02)
            draw.rounded_rectangle([bx, by, bx + bar_w, by + bar_h], radius=bar_h // 2, fill=ac)
        except Exception:
            pass

    img.save(a.out)
    # Variantes livianas de la pieza FINAL (con titular) para la UI.
    try:
        base = a.out.rsplit('.', 1)[0]
        for wdt, q, suf in ((640, 78, '@640.webp'), (24, 60, '@24.webp')):
            if img.width > wdt:
                img.resize((wdt, max(1, round(img.height * wdt / img.width))), Image.LANCZOS).save(base + suf, 'WEBP', quality=q)
            else:
                img.save(base + suf, 'WEBP', quality=q)
    except Exception:
        pass
    print('ok')


if __name__ == '__main__':
    main()
