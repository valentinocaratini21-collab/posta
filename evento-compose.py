#!/usr/bin/env python3
"""evento-compose.py — LOTE EVENTO + PEDIDO DE CERO (extensión de Subir).

Compone el flyer de un evento SOLO con material real y tipografía de
programa:
  · la foto de la persona aportada por el cliente entra COMO FOTO —
    un rectángulo fotográfico con marco, píxeles intactos (resize/crop
    cover, nada dibujado encima) — jamás pasa por un modelo de imagen;
  · el fondo son fotos reales del negocio (cover) o, sin fotos, un
    color de su paleta oscurecido;
  · el nombre del evento, la fecha y el quién los dibuja este programa
    con la tipografía del sistema (Montserrat), como en flyer-compose:
    la IA jamás escribe un nombre ni una fecha.

Uso: python3 evento-compose.py <spec.json>
spec = {
  out, w, h, titulo, fecha, quien, negocio,
  fotoPersona: path|null, fotosNegocio: [paths], paleta: ['#hex', ...]
}
Salida: una línea JSON {ok, out, w, h} o {ok:false, error}.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))


def font_path(*cands):
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None


VF = os.path.expanduser('~/.fonts/Montserrat-VF.ttf')
EXTRA = os.path.join(HERE, 'assets/fonts/Montserrat-ExtraBold.ttf')
F800 = os.path.join(HERE, 'fonts/Montserrat-800.ttf')
BOLD7 = os.path.join(HERE, 'assets/fonts/Montserrat-Bold.ttf')
F700 = os.path.join(HERE, 'fonts/Montserrat-700.ttf')
DEJA = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
HERO_FONT = (VF, 'Black') if os.path.exists(VF) else (font_path(EXTRA, F800, DEJA), None)
BOLD_FONT = (font_path(EXTRA, F800), None) if font_path(EXTRA, F800) else (VF, 'ExtraBold')
REG_FONT = (font_path(BOLD7, F700), None) if font_path(BOLD7, F700) else (VF, 'Bold')


def F(spec, size):
    path, variation = spec
    f = ImageFont.truetype(path, size)
    if variation:
        try:
            f.set_variation_by_name(variation)
        except Exception:
            pass
    return f


def hero_font(size):
    return F(HERO_FONT, size)


def tracked(draw, cx, y, text, fnt, fill, tracking=0, stroke_w=0, stroke_fill=None):
    widths = [draw.textlength(ch, font=fnt) for ch in text]
    total = sum(widths) + tracking * max(0, len(text) - 1)
    x = cx - total / 2
    for ch, wch in zip(text, widths):
        draw.text((x, y), ch, font=fnt, fill=fill, stroke_width=stroke_w, stroke_fill=stroke_fill)
        x += wch + tracking
    return total


def fit(draw, text, target_w, start, font_fn):
    sz = start
    while sz > 24:
        f = font_fn(sz)
        if draw.textlength(text, font=f) <= target_w:
            return f, sz
        sz -= 4
    return font_fn(sz), sz


def cover(im, w, h):
    iw, ih = im.size
    scale = max(w / iw, h / ih)
    im2 = im.resize((round(iw * scale), round(ih * scale)), Image.LANCZOS)
    x = (im2.size[0] - w) // 2
    y = (im2.size[1] - h) // 2
    return im2.crop((x, y, x + w, y + h))


def hexrgb(hx, default):
    try:
        hx = str(hx).lstrip('#')
        return tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return default


def darken(rgb, f):
    return tuple(max(0, min(255, round(c * f))) for c in rgb)


def main():
    spec = json.load(open(sys.argv[1]))
    W, H = int(spec.get('w') or 1080), int(spec.get('h') or 1350)
    cx = W // 2
    paleta = [c for c in (spec.get('paleta') or []) if c]
    base_col = hexrgb(paleta[0], (18, 30, 43)) if paleta else (18, 30, 43)
    accent = hexrgb(paleta[1], (254, 193, 77)) if len(paleta) > 1 else (254, 193, 77)

    fotos = [p for p in (spec.get('fotosNegocio') or []) if p and os.path.exists(p)]
    persona = spec.get('fotoPersona')
    if persona and not os.path.exists(persona):
        persona = None

    # ----- fondo: foto real del negocio (cover, apenas oscurecida) o
    # color de la paleta. Nunca una imagen generada.
    if fotos:
        bg = cover(Image.open(fotos[0]).convert('RGB'), W, H)
        dark = Image.new('RGB', (W, H), (0, 0, 0))
        img = Image.blend(bg, dark, 0.34 if persona else 0.28)
    else:
        img = Image.new('RGB', (W, H), darken(base_col, 0.8))

    d = ImageDraw.Draw(img)

    # ----- bloque superior: negocio → titular → fecha → quién -----
    y = round(H * 0.075)
    negocio = str(spec.get('negocio') or '').strip()
    if negocio:
        tracked(d, cx, y, negocio.upper(), F(BOLD_FONT, 38), (235, 235, 245), tracking=10)
        y += 58
    titulo = str(spec.get('titulo') or '').strip().upper()
    if titulo:
        max_w = W * 0.9
        hf, hs = fit(d, titulo, max_w, 170, hero_font)
        lines = [titulo]
        if hs < 92 and ' ' in titulo:
            words = titulo.split(' ')
            mid = (len(words) + 1) // 2
            lines = [' '.join(words[:mid]), ' '.join(words[mid:])]
            hf, hs = fit(d, max(lines, key=len), max_w, 170, hero_font)
        for ln in lines:
            lw = d.textlength(ln, font=hf)
            d.text((cx - lw / 2, y), ln, font=hf, fill=(255, 255, 255),
                   stroke_width=3, stroke_fill=(10, 8, 24))
            y += hs * 1.05
        y += 14
    fecha = str(spec.get('fecha') or '').strip().upper()
    if fecha:
        ff, fs = fit(d, fecha, W * 0.88, 66, lambda sz: F(BOLD_FONT, sz))
        tracked(d, cx, y, fecha, ff, accent, tracking=1)
        y += fs + 26
    quien = str(spec.get('quien') or '').strip()
    if quien:
        qf, qs = fit(d, 'CON ' + quien.upper(), W * 0.86, 52, lambda sz: F(BOLD_FONT, sz))
        tracked(d, cx, y, 'CON ' + quien.upper(), qf, (245, 245, 250), tracking=1)
        y += qs + 20

    if persona:
        # ----- la foto aportada, COMO FOTO: marco fotográfico en la
        # mitad inferior. El marco se dibuja sobre el fondo y la foto
        # se pega adentro (cover): ningún trazo cae sobre la foto.
        fw = round(W * 0.8)
        fh = round(H * 0.44)
        fx = (W - fw) // 2
        fy = H - fh - round(H * 0.055)
        borde = 12
        marco = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        md = ImageDraw.Draw(marco)
        md.rounded_rectangle([fx - borde, fy - borde, fx + fw + borde, fy + fh + borde],
                             radius=36, fill=(255, 255, 255, 255))
        sombra = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sombra)
        sd.rounded_rectangle([fx - borde + 6, fy - borde + 14, fx + fw + borde + 6, fy + fh + borde + 14],
                             radius=36, fill=(0, 0, 0, 110))
        sombra = sombra.filter(ImageFilter.GaussianBlur(14))
        img = Image.alpha_composite(img.convert('RGBA'), sombra)
        img = Image.alpha_composite(img, marco)
        foto = cover(Image.open(persona).convert('RGB'), fw, fh)
        mask = Image.new('L', (fw, fh), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, fw, fh], radius=28, fill=255)
        img.paste(foto, (fx, fy), mask)
        img = img.convert('RGB')
    elif len(fotos) > 1:
        # Sin persona: una segunda foto real del negocio como banda
        # inferior (cover, con su borde superior limpio).
        bh = round(H * 0.34)
        by = H - bh
        banda = cover(Image.open(fotos[1]).convert('RGB'), W, bh)
        img.paste(banda, (0, by))
        d = ImageDraw.Draw(img)
        d.rectangle([0, by, W, by + 6], fill=accent)

    img = img.convert('RGB')
    img.save(spec['out'], quality=92)
    print(json.dumps({'ok': True, 'out': spec['out'], 'w': W, 'h': H}))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)
