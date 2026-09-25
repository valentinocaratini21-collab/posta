#!/usr/bin/env python3
"""Render de la demo publica de Posta: posteos 1080x1350 estilo premium.

9 estilos distintos (promo, editorial, nocturno, bloque, marco, sello, cita,
tipografico, oferta): foto siempre, Montserrat, colores de marca, watermark
"Hecho con Posta".

Uso: python3 demo_render.py SPEC_JSON OUT_DIR
  SPEC_JSON: {"fonts_dir": "/ruta/a/fonts", "posts": [
      {"photo": "/ruta/foto.webp", "style": "promo", "focus": 0.5,
       "pill": "NUEVO", "bar": "CAFE MARTINEZ",
       "headline": "EL MAS PEDIDO", "subline": "El plato que todos...",
       "cta": "Lo quiero probar", "watermark": "Hecho con Posta"}, ...]}
  Genera OUT_DIR/post-0.png, post-1.png, ...

Sin rutas hardcodeadas: todo llega por el spec. Sin emojis en los textos
(Montserrat no tiene glifos emoji).
"""
import sys
import os
import json
import math

from PIL import Image, ImageDraw, ImageFont, ImageStat, ImageEnhance

NAVY = (10, 30, 51)        # #0A1E33
BODY = (71, 97, 122)       # #47617A
CELESTE = (39, 147, 200)   # #2793C8 celeste brillante de la web
YELLOW = (254, 193, 77)    # #FEC14D
WHITE = (255, 255, 255)

DEFAULT_COLORS = {
    "accent": "#2793C8",      # barra del negocio
    "accent_text": "#FFFFFF",  # texto sobre la barra
    "headline": "#0A1E33",    # titular
    "subline": "#47617A",     # sublínea
    "btn": "#FEC14D",         # pill superior + botón CTA
    "btn_text": "#0A1E33",     # texto sobre pill/CTA
    "watermark": "#47617A",   # marca de agua
}


def hexrgb(h, fb=(0, 0, 0)):
    try:
        h = str(h).strip().lstrip("#")
        if len(h) == 6 and all(c in "0123456789abcdefABCDEF" for c in h):
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except Exception:
        pass
    return fb


def load_colors(spec):
    raw = spec.get("colors") or {}
    out = {}
    for k, fb in DEFAULT_COLORS.items():
        out[k] = hexrgb(raw.get(k, fb), hexrgb(fb))
    return out

W, H = 1080, 1350
MX = 80
MAX_W = W - MX * 2


def load_spec(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def B(fonts_dir, size):
    return ImageFont.truetype(os.path.join(fonts_dir, "Montserrat-Bold.ttf"), size)


def R(fonts_dir, size):
    return ImageFont.truetype(os.path.join(fonts_dir, "Montserrat-Regular.ttf"), size)


def tw(draw, text, font, tracking=0):
    w = 0
    for ch in text:
        w += draw.textlength(ch, font=font) + tracking
    return w - tracking if text else 0


def ltext(draw, x, y, text, font, fill=NAVY, tracking=0):
    cx = x
    for ch in text:
        draw.text((cx, y), ch, font=font, fill=fill)
        cx += draw.textlength(ch, font=font) + tracking
    return y + font.size


def rtext(draw, x_right, y, text, font, fill=BODY, tracking=0):
    w = tw(draw, text, font, tracking)
    return ltext(draw, x_right - w, y, text, font, fill, tracking)


def ctext(draw, cx, y, text, font, fill=NAVY, tracking=0):
    w = tw(draw, text, font, tracking)
    return ltext(draw, cx - w / 2, y, text, font, fill, tracking)


def star_points(cx, cy, r):
    pts = []
    for k in range(10):
        ang = -math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.42
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    return pts


def draw_stars(d, cx, y, n=5, r=26, gap=18, fill=YELLOW):
    total = n * (r * 2 + gap) - gap
    x = cx - total / 2
    for _ in range(n):
        d.polygon(star_points(x + r, y + r, r), fill=fill)
        x += r * 2 + gap
    return y + r * 2


def load_photo(photo_path, w=W, h=H, focus=0.5):
    """Foto graduada (high-key) recortada a w x h. focus 0=arriba, 1=abajo."""
    if not os.path.isfile(photo_path):
        raise FileNotFoundError("foto no encontrada: %s" % photo_path)
    p = Image.open(photo_path).convert("RGB")
    target = w / h
    pw, ph = p.size
    if pw / ph > target:
        nw = int(ph * target)
        x0 = (pw - nw) // 2
        p = p.crop((x0, 0, x0 + nw, ph))
    else:
        nh = int(pw / target)
        y0 = int((ph - nh) * max(0.0, min(1.0, focus)))
        p = p.crop((0, y0, pw, y0 + nh))
    p = p.resize((w, h), Image.LANCZOS)
    return grade_photo(p)


def navy_shade(img, y0=0.30, y1=1.0, max_a=215):
    """Degradado navy desde abajo sobre la imagen."""
    ov = Image.new("L", (1, H), 0)
    px = ov.load()
    for y in range(H):
        t = y / H
        if t <= y0:
            a = 0
        elif t >= y1:
            a = max_a
        else:
            a = int(max_a * (t - y0) / (y1 - y0))
        px[0, y] = a
    ov = ov.resize((W, H))
    return Image.composite(Image.new("RGB", (W, H), NAVY), img, ov)


def white_fade(img, fade_start=0.38, fade_end=0.68):
    mask = Image.new("L", (1, H), 0)
    px = mask.load()
    for y in range(H):
        t = y / H
        if t <= fade_start:
            a = 0
        elif t >= fade_end:
            a = 255
        else:
            a = int(255 * (t - fade_start) / (fade_end - fade_start))
        px[0, y] = a
    mask = mask.resize((W, H))
    return Image.composite(Image.new("RGB", (W, H), WHITE), img, mask)


def wrap_fit(draw, fonts_dir, text, max_w, start_size, max_lines=3):
    """Envuelve el texto en lineas y ajusta el tamano para que entren.
    Devuelve (font, lines)."""
    words = str(text or "").split()
    if not words:
        return B(fonts_dir, start_size), []
    size = start_size
    while size > 18:
        f = B(fonts_dir, size)
        lines, cur = [], ""
        for wd in words:
            t = (cur + " " + wd).strip()
            if tw(draw, t, f) <= max_w or not cur:
                cur = t
            else:
                lines.append(cur)
                cur = wd
        if cur:
            lines.append(cur)
        if len(lines) <= max_lines and all(tw(draw, ln, f) <= max_w for ln in lines):
            return f, lines
        size -= 4
    return B(fonts_dir, 18), [" ".join(words)]


def grade_photo(p):
    """Tratamiento suave: la foto sigue siendo foto (no un fantasma).
    Brillo 1.05 (antes 1.22), velo blanco 0.10 (antes 0.42), contraste 1.06,
    saturacion 1.06 y balance de blancos estrecho a +-8% (antes +-22%)."""
    st = ImageStat.Stat(p)
    mr, mg, mb = st.mean[0], st.mean[1], st.mean[2]
    lum = (mr + mg + mb) / 3.0 or 1.0

    def cg(m):
        return min(max(lum / m, 0.92), 1.08) if m > 1 else 1.0

    r, g, b = p.split()
    egr, egg, egb = cg(mr), cg(mg), cg(mb)
    r = r.point(lambda v: 255 if v * egr >= 255 else int(v * egr))
    g = g.point(lambda v: 255 if v * egg >= 255 else int(v * egg))
    b = b.point(lambda v: 255 if v * egb >= 255 else int(v * egb))
    p = Image.merge("RGB", (r, g, b))
    p = ImageEnhance.Brightness(p).enhance(1.05)
    p = ImageEnhance.Contrast(p).enhance(1.06)
    p = ImageEnhance.Color(p).enhance(1.06)
    p = Image.blend(p, Image.new("RGB", p.size, (255, 255, 255)), 0.10)
    return p


def photo_bg(photo_path, fade_start=0.38, fade_end=0.68, focus=0.5):
    """Foto 1080x1350 full-bleed con fundido a blanco hacia abajo."""
    p = load_photo(photo_path, W, H, focus)
    img = white_fade(p, fade_start, fade_end)
    return img, ImageDraw.Draw(img)


def pill_nuevo(d, fonts_dir, text, C, y=64, x_right=None, left=False):
    f = B(fonts_dir, 34)
    tracking = 6
    pad_x, pad_y = 34, 15
    w = tw(d, text, f, tracking) + pad_x * 2
    h = f.size + pad_y * 2
    if left:
        x0 = MX
    else:
        x1 = W - MX if x_right is None else x_right
        x0 = x1 - w
    d.rounded_rectangle([x0, y, x0 + w, y + h], radius=h // 2, fill=C["btn"])
    cx = x0 + w / 2
    cw = tw(d, text, f, tracking)
    ltext(d, cx - cw / 2, y + pad_y - 5, text, f, fill=C["btn_text"], tracking=tracking)
    return y + h


def celeste_bar(d, fonts_dir, y, text, C):
    f = B(fonts_dir, 40)
    tracking = 8
    # achicar si la etiqueta es muy larga
    while tw(d, text, f, tracking) > MAX_W - 88 and f.size > 20:
        f = B(fonts_dir, f.size - 2)
    pad_x, pad_y = 44, 20
    w = tw(d, text, f, tracking) + pad_x * 2
    h = f.size + pad_y * 2
    d.rectangle([MX, y, MX + w, y + h], fill=C["accent"])
    ltext(d, MX + pad_x, y + pad_y - 5, text, f, fill=C["accent_text"], tracking=tracking)
    return y + h


def cta_button(d, fonts_dir, y, text, C, center=False):
    f = B(fonts_dir, 44)
    while tw(d, text, f) > MAX_W - 128 and f.size > 22:
        f = B(fonts_dir, f.size - 2)
    pad_x = 64
    bh = 108
    w = tw(d, text, f) + pad_x * 2
    x0 = W // 2 - w / 2 if center else MX
    d.rounded_rectangle([x0, y, x0 + w, y + bh], radius=bh // 2, fill=C["btn"])
    ltext(d, x0 + pad_x, y + bh // 2 - f.size // 2 - 5, text, f, fill=C["btn_text"])
    return y + bh


def style_promo(fonts_dir, p, C, hs):
    """Estilo 1 PROMO: foto full-bleed con fundido a blanco, barra del negocio,
    titular grande navy, sublinea y boton CTA."""
    focus = float(p.get("focus", 0.5) or 0.5)
    img, d = photo_bg(p["photo"], focus=focus)
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C)

    y = 600
    y = celeste_bar(d, fonts_dir, y, str(p.get("bar", "")).upper(), C)
    y += 40

    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, hs, 3)
    for ln in lines:
        y = ltext(d, MX, y, ln, f, C["headline"])
        y += int(f.size * 0.04)
    y += 22

    f2 = R(fonts_dir, 42)
    words, cur, slines = str(p.get("subline", "")).split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(d, t, f2) <= MAX_W or not cur:
            cur = t
        else:
            slines.append(cur)
            cur = wd
    if cur:
        slines.append(cur)
    slines = slines[:3]
    for ln in slines:
        y = ltext(d, MX, y, ln, f2, C["subline"])
        y += 10
    y += 34

    y = cta_button(d, fonts_dir, y, p.get("cta", ""), C)
    rtext(d, W - MX, H - 70, p.get("watermark", "Hecho con Posta"), R(fonts_dir, 30), fill=C["watermark"])
    return img, y


def style_editorial(fonts_dir, p, C, hs):
    """Estilo 2 EDITORIAL: foto arriba, aire abajo, kicker sobrio y linea de acento."""
    focus = float(p.get("focus", 0.5) or 0.5)
    photo = load_photo(p["photo"], W, 620, focus)
    img = Image.new("RGB", (W, H), WHITE)
    img.paste(photo, (0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 620, W, 630], fill=C["accent"])
    y = 680
    if p.get("pill"):
        f0 = B(fonts_dir, 32)
        y = ltext(d, MX, y, str(p["pill"]).upper(), f0, fill=C["accent"], tracking=10) + 28

    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, min(hs, 135), 2)
    for ln in lines:
        y = ltext(d, MX, y, ln, f, C["headline"])
        y += int(f.size * 0.06)
    y += 20
    d.rectangle([MX, y, MX + 120, y + 9], fill=C["accent"])
    y += 34

    f2 = R(fonts_dir, 38)
    words, cur, slines = str(p.get("subline", "")).split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(d, t, f2) <= MAX_W or not cur:
            cur = t
        else:
            slines.append(cur)
            cur = wd
    if cur:
        slines.append(cur)
    slines = slines[:2]
    for ln in slines:
        y = ltext(d, MX, y, ln, f2, C["subline"])
        y += 8
    y += 30
    f3 = B(fonts_dir, 38)
    y = ltext(d, MX, y, str(p.get("cta", "")).upper(), f3, fill=C["accent"], tracking=4) + 28
    rtext(d, W - MX, H - 64, p.get("watermark", "Hecho con Posta"), R(fonts_dir, 28), fill=C["watermark"])
    return img, y


def style_nocturno(fonts_dir, p, C, hs):
    """Estilo 3 NOCTURNO: foto con velo navy, texto blanco abajo."""
    focus = float(p.get("focus", 0.5) or 0.5)
    base = load_photo(p["photo"], W, H, focus)
    img = navy_shade(base, y0=0.25, y1=1.0, max_a=225)
    d = ImageDraw.Draw(img)
    white = (255, 255, 255)
    f0 = B(fonts_dir, 32)
    ltext(d, MX, 64, str(p.get("bar", "")).upper(), f0, fill=white, tracking=8)
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C, y=130)

    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, hs, 3)
    block = len(lines) * int(f.size * 1.08) + 30 + 52 + 40 + 108
    y = max(H - 120 - block, 400)
    for ln in lines:
        y = ltext(d, MX, y, ln, f, white)
        y += int(f.size * 0.08)
    y += 24
    f2 = R(fonts_dir, 40)
    words, cur, slines = str(p.get("subline", "")).split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(d, t, f2) <= MAX_W or not cur:
            cur = t
        else:
            slines.append(cur)
            cur = wd
    if cur:
        slines.append(cur)
    slines = slines[:2]
    for ln in slines:
        y = ltext(d, MX, y, ln, f2, white)
        y += 8
    y += 36
    # boton outline blanco
    f3 = B(fonts_dir, 42)
    txt = str(p.get("cta", ""))
    while tw(d, txt, f3) > MAX_W - 140 and f3.size > 22:
        f3 = B(fonts_dir, f3.size - 2)
    bw = tw(d, txt, f3) + 120
    bh = 104
    d.rounded_rectangle([MX, y, MX + bw, y + bh], radius=bh // 2, outline=white, width=5)
    ltext(d, MX + 60, y + bh // 2 - f3.size // 2 - 4, txt, f3, fill=white)
    y += bh
    rtext(d, W - MX, H - 70, p.get("watermark", "Hecho con Posta"), R(fonts_dir, 30), fill=(200, 210, 220))
    return img, y + 40


def style_bloque(fonts_dir, p, C, hs):
    """Estilo 4 BLOQUE: foto arriba, bloque de color de marca abajo con texto blanco."""
    focus = float(p.get("focus", 0.5) or 0.5)
    photo = load_photo(p["photo"], W, 580, focus)
    img = Image.new("RGB", (W, H), WHITE)
    img.paste(photo, (0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 580, W, H], fill=C["accent"])
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C, y=48)

    white = (255, 255, 255)
    y = 660
    f0 = B(fonts_dir, 32)
    y = ltext(d, MX, y, str(p.get("bar", "")).upper(), f0, fill=white, tracking=8) + 38
    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, min(hs, 130), 2)
    for ln in lines:
        y = ltext(d, MX, y, ln, f, white)
        y += int(f.size * 0.06)
    y += 22
    f2 = R(fonts_dir, 38)
    words, cur, slines = str(p.get("subline", "")).split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(d, t, f2) <= MAX_W or not cur:
            cur = t
        else:
            slines.append(cur)
            cur = wd
    if cur:
        slines.append(cur)
    slines = slines[:2]
    for ln in slines:
        y = ltext(d, MX, y, ln, f2, white)
        y += 8
    y += 34
    # boton blanco con texto del color de marca
    f3 = B(fonts_dir, 40)
    txt = str(p.get("cta", ""))
    while tw(d, txt, f3) > MAX_W - 140 and f3.size > 22:
        f3 = B(fonts_dir, f3.size - 2)
    bw = tw(d, txt, f3) + 110
    bh = 100
    d.rounded_rectangle([MX, y, MX + bw, y + bh], radius=bh // 2, fill=white)
    ltext(d, MX + 55, y + bh // 2 - f3.size // 2 - 4, txt, f3, fill=C["accent"])
    y += bh
    rtext(d, W - MX, H - 56, p.get("watermark", "Hecho con Posta"), R(fonts_dir, 28), fill=(235, 240, 245))
    return img, y + 16


def style_marco(fonts_dir, p, C, hs):
    """Estilo 5 MARCO: foto enmarcada con sombra sobre fondo blanco."""
    focus = float(p.get("focus", 0.5) or 0.5)
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    fx0, fy0, fx1, fy1 = 60, 80, W - 60, 620
    d.rounded_rectangle([fx0 + 14, fy0 + 18, fx1 + 14, fy1 + 18], radius=48, fill=(225, 232, 238))
    photo = load_photo(p["photo"], fx1 - fx0, fy1 - fy0, focus)
    mask = Image.new("L", (fx1 - fx0, fy1 - fy0), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, fx1 - fx0, fy1 - fy0], radius=48, fill=255)
    img.paste(photo, (fx0, fy0), mask)
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C, y=fy1 - 42)

    y = 690
    f0 = R(fonts_dir, 32)
    y = ltext(d, MX, y, str(p.get("bar", "")).upper(), f0, fill=C["accent"], tracking=8) + 36
    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, min(hs, 125), 2)
    for ln in lines:
        y = ltext(d, MX, y, ln, f, C["headline"])
        y += int(f.size * 0.06)
    y += 20
    f2 = R(fonts_dir, 38)
    words, cur, slines = str(p.get("subline", "")).split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(d, t, f2) <= MAX_W or not cur:
            cur = t
        else:
            slines.append(cur)
            cur = wd
    if cur:
        slines.append(cur)
    slines = slines[:2]
    for ln in slines:
        y = ltext(d, MX, y, ln, f2, C["subline"])
        y += 8
    y += 34
    y = cta_button(d, fonts_dir, y, p.get("cta", ""), C)
    rtext(d, W - MX, H - 64, p.get("watermark", "Hecho con Posta"), R(fonts_dir, 28), fill=C["watermark"])
    return img, y + 12


def style_sello(fonts_dir, p, C, hs):
    """Estilo 6 SELLO: foto arriba y sello circular con la etiqueta, texto centrado."""
    focus = float(p.get("focus", 0.5) or 0.5)
    photo = load_photo(p["photo"], W, 560, focus)
    img = Image.new("RGB", (W, H), WHITE)
    img.paste(photo, (0, 0))
    d = ImageDraw.Draw(img)

    if p.get("pill"):
        tag = str(p["pill"]).upper()
        cr = 140
        ccx, ccy = W // 2, 560
        d.ellipse([ccx - cr, ccy - cr, ccx + cr, ccy + cr], fill=C["btn"])
        d.ellipse([ccx - cr + 12, ccy - cr + 12, ccx + cr - 12, ccy + cr - 12], outline=C["btn_text"], width=4)
        f0 = B(fonts_dir, 38)
        while tw(d, tag, f0, 6) > cr * 2 - 80 and f0.size > 18:
            f0 = B(fonts_dir, f0.size - 2)
        ctext(d, ccx, ccy - f0.size // 2 - 4, tag, f0, fill=C["btn_text"], tracking=6)

    y = 770
    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, min(hs, 125), 2)
    for ln in lines:
        y = ctext(d, W // 2, y, ln, f, C["headline"])
        y += int(f.size * 0.08)
    y += 20
    f2 = R(fonts_dir, 38)
    words, cur, slines = str(p.get("subline", "")).split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(d, t, f2) <= MAX_W or not cur:
            cur = t
        else:
            slines.append(cur)
            cur = wd
    if cur:
        slines.append(cur)
    slines = slines[:2]
    for ln in slines:
        y = ctext(d, W // 2, y, ln, f2, C["subline"])
        y += 8
    y += 30
    f3 = B(fonts_dir, 40)
    txt = str(p.get("cta", ""))
    while tw(d, txt, f3) > MAX_W - 140 and f3.size > 22:
        f3 = B(fonts_dir, f3.size - 2)
    bw = tw(d, txt, f3) + 110
    bh = 100
    d.rounded_rectangle([W // 2 - bw / 2, y, W // 2 + bw / 2, y + bh], radius=bh // 2, fill=C["btn"])
    ltext(d, W // 2 - bw / 2 + 55, y + bh // 2 - f3.size // 2 - 4, txt, f3, fill=C["btn_text"])
    y += bh
    rtext(d, W - MX, H - 64, p.get("watermark", "Hecho con Posta"), R(fonts_dir, 28), fill=C["watermark"])
    return img, y + 12


def style_cita(fonts_dir, p, C, hs):
    """Estilo 7 CITA: aire editorial con comillas gigantes, foto circular y estrellas."""
    focus = float(p.get("focus", 0.5) or 0.5)
    tint = tuple(int(255 * 0.94 + c * 0.06) for c in C["accent"])
    img = Image.new("RGB", (W, H), tint)
    d = ImageDraw.Draw(img)

    fq = B(fonts_dir, 380)
    ctext(d, W // 2, 40, "\u201c", fq, fill=C["accent"])

    dpx = 300
    photo = load_photo(p["photo"], dpx, dpx, focus)
    pmask = Image.new("L", (dpx, dpx), 0)
    ImageDraw.Draw(pmask).ellipse([0, 0, dpx, dpx], fill=255)
    img.paste(photo, (W // 2 - dpx // 2, 400), pmask)
    d = ImageDraw.Draw(img)
    d.ellipse([W // 2 - dpx // 2 - 10, 390, W // 2 + dpx // 2 + 10, 400 + dpx + 10],
              outline=C["accent"], width=8)

    y = 400 + dpx + 60
    y = draw_stars(d, W // 2, y, fill=C["btn"]) + 36

    # la sublinea como cita
    f2 = R(fonts_dir, 52)
    words, cur, slines = str(p.get("subline", "")).split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(d, t, f2) <= MAX_W - 120 or not cur:
            cur = t
        else:
            slines.append(cur)
            cur = wd
    if cur:
        slines.append(cur)
    slines = slines[:4]
    for j, ln in enumerate(slines):
        if j == 0:
            ln = "\u201c" + ln
        if j == len(slines) - 1:
            ln = ln + "\u201d"
        y = ctext(d, W // 2, y, ln, f2, C["headline"])
        y += 14
    y += 30
    f0 = B(fonts_dir, 34)
    tag = str(p.get("pill") or p.get("bar", "")).upper()
    ctext(d, W // 2, y, tag, f0, fill=C["accent"], tracking=8)
    y += 90
    y = cta_button(d, fonts_dir, y, p.get("cta", ""), C, center=True)
    rtext(d, W - MX, H - 70, p.get("watermark", "Hecho con Posta"), R(fonts_dir, 30), fill=C["watermark"])
    return img, y + 20


def style_tipografico(fonts_dir, p, C, hs):
    """Estilo 8 TIPOGRAFICO: fondo navy, titular gigante, franja de foto abajo."""
    focus = float(p.get("focus", 0.5) or 0.5)
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    white = (255, 255, 255)
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C, y=64, left=True)

    y = 220
    f0 = B(fonts_dir, 34)
    ltext(d, MX, y, str(p.get("bar", "")).upper(), f0, fill=C["accent"], tracking=8)
    y += 90
    big = min(hs + 30, 175)
    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, big, 4)
    for j, ln in enumerate(lines):
        col = C["btn"] if j == len(lines) - 1 else white
        y = ltext(d, MX, y, ln, f, col)
        y += int(f.size * 0.10)
    y += 30
    f2 = R(fonts_dir, 42)
    words, cur, slines = str(p.get("subline", "")).split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(d, t, f2) <= MAX_W or not cur:
            cur = t
        else:
            slines.append(cur)
            cur = wd
    if cur:
        slines.append(cur)
    slines = slines[:2]
    for ln in slines:
        y = ltext(d, MX, y, ln, f2, (205, 215, 225))
        y += 10
    y += 48
    y = cta_button(d, fonts_dir, y, p.get("cta", ""), C)

    # franja de foto abajo con fundido navy arriba
    band_h = 300
    photo = load_photo(p["photo"], W, band_h + 120, focus)
    img.paste(photo, (0, H - band_h))
    d = ImageDraw.Draw(img)
    ov = Image.new("L", (1, 160), 0)
    px = ov.load()
    for yy in range(160):
        px[0, yy] = int(255 * (1 - yy / 160))
    ov = ov.resize((W, 160))
    top = Image.new("RGB", (W, 160), NAVY)
    region = img.crop((0, H - band_h, W, H - band_h + 160))
    img.paste(Image.composite(top, region, ov), (0, H - band_h))
    # watermark con pastilla navy para que se lea sobre la foto
    d = ImageDraw.Draw(img)
    wf = R(fonts_dir, 28)
    wt = p.get("watermark", "Hecho con Posta")
    ww = tw(d, wt, wf) + 56
    wh = 64
    wx1, wy1 = W - MX, H - 36
    d.rounded_rectangle([wx1 - ww, wy1 - wh, wx1, wy1], radius=wh // 2, fill=NAVY)
    rtext(d, wx1 - 28, wy1 - wh // 2 - 14, wt, wf, fill=(235, 240, 245))
    return img, y + 20


def style_oferta(fonts_dir, p, C, hs):
    """Estilo 9 OFERTA: banda de marca arriba, foto al medio, titular enorme abajo."""
    focus = float(p.get("focus", 0.5) or 0.5)
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 220], fill=C["accent"])
    white = (255, 255, 255)
    f0 = B(fonts_dir, 42)
    bar = str(p.get("bar", "")).upper()
    while tw(d, bar, f0, 8) > MAX_W - 340 and f0.size > 22:
        f0 = B(fonts_dir, f0.size - 2)
    ltext(d, MX, 110 - f0.size // 2, bar, f0, fill=white, tracking=8)
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C, y=76)
    rtext(d, W - MX, 172, p.get("watermark", "Hecho con Posta"), R(fonts_dir, 26), fill=(240, 246, 250))

    photo = load_photo(p["photo"], W, 500, focus)
    img.paste(photo, (0, 220))
    d = ImageDraw.Draw(img)

    y = 750
    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, min(hs, 120), 2)
    for ln in lines:
        y = ltext(d, MX, y, ln, f, C["headline"])
        y += int(f.size * 0.06)
    y += 20
    f2 = R(fonts_dir, 38)
    words, cur, slines = str(p.get("subline", "")).split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(d, t, f2) <= MAX_W or not cur:
            cur = t
        else:
            slines.append(cur)
            cur = wd
    if cur:
        slines.append(cur)
    slines = slines[:2]
    for ln in slines:
        y = ltext(d, MX, y, ln, f2, C["subline"])
        y += 8
    y += 30
    y = cta_button(d, fonts_dir, y, p.get("cta", ""), C)
    return img, y + 12


STYLES = {
    "promo": style_promo,
    "editorial": style_editorial,
    "nocturno": style_nocturno,
    "bloque": style_bloque,
    "marco": style_marco,
    "sello": style_sello,
    "cita": style_cita,
    "tipografico": style_tipografico,
    "oferta": style_oferta,
}


def render_post(d, img, fonts_dir, p, hsize_start, C):
    # compat: estilo promo clasico
    _img, bottom = style_promo(fonts_dir, p, C, hsize_start)
    return bottom


def main():
    if len(sys.argv) != 3:
        print("uso: demo_render.py SPEC_JSON OUT_DIR", file=sys.stderr)
        sys.exit(2)
    spec = load_spec(sys.argv[1])
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    fonts_dir = spec["fonts_dir"]
    if not os.path.isfile(os.path.join(fonts_dir, "Montserrat-Bold.ttf")):
        print("no se encontraron las fuentes en %s" % fonts_dir, file=sys.stderr)
        sys.exit(2)

    C = load_colors(spec)
    for i, p in enumerate(spec["posts"]):
        fn = STYLES.get(str(p.get("style") or "promo"), style_promo)
        bottom, img = None, None
        for hs in (150, 130, 112, 96):
            # re-render limpio en cada intento
            img, bottom = fn(fonts_dir, p, C, hs)
            if bottom <= 1300:
                break
        out = os.path.join(outdir, "post-%d.png" % i)
        img.save(out)
        print("post-%d OK style=%s bottom=%d" % (i, p.get("style", "promo"), bottom))

    print("DONE %d" % len(spec["posts"]))


if __name__ == "__main__":
    main()
