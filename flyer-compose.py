#!/usr/bin/env python3
"""flyer-compose.py — MODO FLYER de Posty (v315): compone la tipografía
de un flyer sobre el arte generado. El texto JAMÁS lo dibuja la IA: lo
pone este programa con la tipografía real del sistema (Montserrat
ExtraBold/Bold de assets/fonts), así una fecha, un lineup o un precio
salen siempre perfectos.

Uso: python3 flyer-compose.py <spec.json>
spec = {
  art, out, w, h, variant: 'feed'|'story',
  club, fiesta, fecha, lineup: [...], apertura, entradas, edad, promo,
  accent: '#8AFF3C', glow: '#A855F7',
  plate: null | 'FALTAN 3 DÍAS'        (placa de cuenta regresiva, historias)
}
Solo se dibujan los renglones que vienen con dato: lo que el dueño no
confirmó no se inventa ni se dibuja.
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
# (path, variación) — la variación solo aplica si el path es la VF.
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
    # Black si está la variable; si no, la ExtraBold estática del repo.
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


def main():
    spec = json.load(open(sys.argv[1]))
    art = Image.open(spec['art']).convert('RGB')
    W, H = int(spec['w']), int(spec['h'])
    variant = spec.get('variant', 'feed')
    accent = hexrgb(spec.get('accent'), (138, 255, 60))
    glow = hexrgb(spec.get('glow'), (168, 85, 247))
    cx = W // 2

    if variant == 'story':
        # Fondo: el arte difuminado y oscurecido a pantalla completa; el
        # arte nítido (4:5) centrado — su centro libre recibe el titular
        # igual que en el flyer de feed.
        bg = cover(art, W, H).filter(ImageFilter.GaussianBlur(38))
        dark = Image.new('RGB', (W, H), (0, 0, 0))
        img = Image.blend(bg, dark, 0.38)
        sharp_w = W
        sharp_h = round(W * art.size[1] / art.size[0])
        sharp = art.resize((sharp_w, sharp_h), Image.LANCZOS)
        oy = (H - sharp_h) // 2
        img.paste(sharp, (0, oy))
        block_h = sharp_h
        block_y = oy
    else:
        img = cover(art, W, H)
        block_h = H
        block_y = 0

    # Velo suave tras el bloque de texto (legibilidad sin tapar el arte).
    veil = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    vd = ImageDraw.Draw(veil)
    vd.ellipse([cx - W * 0.52, block_y + block_h * 0.24, cx + W * 0.52, block_y + block_h * 0.78],
               fill=(0, 0, 0, 66))
    veil = veil.filter(ImageFilter.GaussianBlur(60))
    img = Image.alpha_composite(img.convert('RGBA'), veil).convert('RGB')
    d = ImageDraw.Draw(img)

    # ----- bloque central: club → fiesta → fecha → lineup -----
    y = block_y + block_h * 0.315
    club = str(spec.get('club') or '').strip()
    if club:
        tracked(d, cx, y, club.upper(), F(BOLD_FONT, 40), (235, 235, 245), tracking=10)
        y += 62
    fiesta = str(spec.get('fiesta') or '').strip().upper()
    if fiesta:
        max_w = W * 0.9
        hf, hs = fit(d, fiesta, max_w, 190, hero_font)
        lines = [fiesta]
        if hs < 96 and ' ' in fiesta:
            words = fiesta.split(' ')
            mid = (len(words) + 1) // 2
            lines = [' '.join(words[:mid]), ' '.join(words[mid:])]
            hf, hs = fit(d, max(lines, key=len), max_w, 190, hero_font)
        glow_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow_layer)
        ly = y
        for ln in lines:
            lw = d.textlength(ln, font=hf)
            gd.text((cx - lw / 2, ly), ln, font=hf, fill=glow + (255,))
            ly += hs * 1.04
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(15))
        img.paste(Image.alpha_composite(img.convert('RGBA'), glow_layer).convert('RGB'), (0, 0))
        d = ImageDraw.Draw(img)
        ly = y
        for ln in lines:
            lw = d.textlength(ln, font=hf)
            d.text((cx - lw / 2, ly), ln, font=hf, fill=(255, 255, 255),
                   stroke_width=3, stroke_fill=(12, 0, 30))
            ly += hs * 1.04
        y = ly + 18
    fecha = str(spec.get('fecha') or '').strip().upper()
    if fecha:
        ff, fs = fit(d, fecha, W * 0.88, 74, lambda sz: F(BOLD_FONT, sz))
        tracked(d, cx, y, fecha, ff, accent, tracking=1)
        y += fs + 34
    for dj in (spec.get('lineup') or [])[:4]:
        dj = str(dj or '').strip().upper()
        if not dj:
            continue
        lf, ls = fit(d, dj, W * 0.86, 56, lambda sz: F(BOLD_FONT, sz))
        tracked(d, cx, y, dj, lf, (245, 245, 250), tracking=1)
        y += ls + 16

    # ----- bloque práctico (abajo): promo → apertura → entradas/edad -----
    bottom = []
    if spec.get('promo'):
        bottom.append((str(spec['promo']).strip(), accent, 44, BOLD_FONT, 1))
    if spec.get('apertura'):
        _ap_label = str(spec.get('aperturaLabel') or 'APERTURA').strip().upper()
        bottom.append(((_ap_label + ' ' if _ap_label else '') + str(spec['apertura']).strip().upper(), (240, 240, 248), 42, BOLD_FONT, 4))
    tail = ' · '.join(x for x in [str(spec.get('entradas') or '').strip(),
                                  str(spec.get('edad') or '').strip()] if x)
    if tail:
        bottom.append((tail.upper(), (208, 208, 222), 36, REG_FONT, 2))
    by = (block_y + round(block_h * 0.845)) if variant == 'feed' else (H - 190)
    for text, fill, size, fpath, trk in reversed(bottom):
        fnt = F(fpath, size)
        tw = sum(d.textlength(ch, font=fnt) for ch in text) + trk * max(0, len(text) - 1)
        if tw > W * 0.92:
            fnt = F(fpath, max(26, int(size * (W * 0.92) / tw)))
        by -= size + 14
        tracked(d, cx, by, text, fnt, fill, tracking=trk, stroke_w=2, stroke_fill=(10, 0, 25))
    # En historias el bloque práctico va en la banda inferior difuminada.
    if variant == 'story' and bottom:
        pass  # ya ubicado sobre H-210 (banda inferior)

    # ----- placa de cuenta regresiva (solo historias) -----
    plate = str(spec.get('plate') or '').strip()
    if plate:
        pf = F(BOLD_FONT, 64)
        tw = d.textlength(plate, font=pf)
        pad_x, pad_y = 44, 20
        x0, y0 = cx - tw / 2 - pad_x, 84
        x1, y1 = cx + tw / 2 + pad_x, 84 + 64 + pad_y * 2
        pill = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        pd = ImageDraw.Draw(pill)
        pd.rounded_rectangle([x0, y0, x1, y1], radius=(y1 - y0) // 2, fill=(0, 0, 0, 168),
                             outline=accent + (255,), width=3)
        img.paste(Image.alpha_composite(img.convert('RGBA'), pill).convert('RGB'), (0, 0))
        d = ImageDraw.Draw(img)
        d.text((cx - tw / 2, y0 + pad_y - 4), plate, font=pf, fill=(255, 255, 255))

    img.save(spec['out'], quality=92)
    print(json.dumps({'ok': True, 'out': spec['out'], 'w': W, 'h': H}))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)
