#!/usr/bin/env python3
"""Render de la demo publica de Posta: posteos 1080x1350 estilo premium.

9 estilos distintos (promo, editorial, nocturno, bloque, marco, sello, cita,
tipografico, oferta): foto siempre, Montserrat, colores de marca.
SIN watermark en los posteos (pedido de Valentino, 2026-10-17).

Uso: python3 demo_render.py SPEC_JSON OUT_DIR
  SPEC_JSON: {"fonts_dir": "/ruta/a/fonts", "posts": [
      {"photo": "/ruta/foto.webp", "style": "promo", "focus": 0.5,
       "pill": "NUEVO", "bar": "CAFE MARTINEZ",
       "headline": "EL MAS PEDIDO", "subline": "El plato que todos...",
       "cta": "Lo quiero probar"}, ...]}
  Genera OUT_DIR/post-0.png, post-1.png, ...

Sin rutas hardcodeadas: todo llega por el spec. Sin emojis en los textos
(Montserrat no tiene glifos emoji).
"""
import sys
import os
import json
import math

from PIL import Image, ImageDraw, ImageFont, ImageStat, ImageEnhance, ImageFilter

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
    "detail": "#FEC14D",      # acento: detalles (anillo del sello, borde del pill)
    "detail_text": "#0A1E33",  # texto sobre el acento
    "poster_bg": "#0A1E33",   # (v196) fondo pleno del póster de marca: el color
                              # oscuro de la paleta del cliente (demo.js lo deriva)
    "poster_dark": "#0A1E33", # (v197) color oscuro de la paleta: textos del
                              # póster cuando el registro heredado es CLARO
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
    # (v231) TRES ROLES TIPOGRÁFICOS (adopción del estudio — sistema
    # Airbnb/Predis): el TITULAR va en ExtraBold (800, voz display).
    # Fallback a Bold si el asset falta (deploy parcial).
    p = os.path.join(fonts_dir, "Montserrat-ExtraBold.ttf")
    if not os.path.isfile(p):
        p = os.path.join(fonts_dir, "Montserrat-Bold.ttf")
    return ImageFont.truetype(p, size)


def SB(fonts_dir, size):
    # (v231) Rol ETIQUETA: SemiBold (600) — pill y rótulos chicos.
    p = os.path.join(fonts_dir, "Montserrat-SemiBold.ttf")
    if not os.path.isfile(p):
        p = os.path.join(fonts_dir, "Montserrat-Bold.ttf")
    return ImageFont.truetype(p, size)


def R(fonts_dir, size):
    # (v231) Rol BAJADA: Regular (400) verdadero. OJO histórico: el
    # archivo que viajaba como "Montserrat-Regular.ttf" era en rigor
    # el SemiBold; la instancia Regular real se generó del VF oficial.
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
    _im = Image.open(photo_path)
    try:
        _im.draft("RGB", (w * 2, h * 2))  # decodifica cerca del tamaño de uso: mismo resultado, menos CPU
    except Exception:
        pass
    p = _im.convert("RGB")
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
    return color_shade(img, NAVY, y0, y1, max_a)


def luminance(rgb):
    """Luminancia relativa 0..1."""
    r, g, b = [v / 255 for v in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def shade(rgb, amt):
    """Aclara (amt>0) u oscurece (amt<0) un color RGB. amt en -100..100."""
    f = amt / 100
    if f >= 0:
        return tuple(int(v + (255 - v) * f) for v in rgb)
    return tuple(int(v * (1 + f)) for v in rgb)


def color_shade(img, rgb, y0=0.30, y1=1.0, max_a=215):
    """Degradado de un color cualquiera desde abajo sobre la imagen."""
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
    return Image.composite(Image.new("RGB", (W, H), rgb), img, ov)


def brand_veil(rgb):
    """Velo oscuro derivado del color principal: si el principal es claro se
    oscurece para que el texto blanco siga legible, manteniendo su familia."""
    return rgb if luminance(rgb) <= 0.4 else shade(rgb, -55)


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
    """High-key blanco: balance de blancos neutro + exposicion levantada."""
    st = ImageStat.Stat(p)
    mr, mg, mb = st.mean[0], st.mean[1], st.mean[2]
    lum = (mr + mg + mb) / 3.0 or 1.0

    def cg(m, lo, hi):
        return min(max(lum / m, lo), hi) if m > 1 else 1.0

    s = 0.65
    egr = 1 + (cg(mr, 0.86, 1.16) - 1) * s
    egg = 1 + (cg(mg, 0.93, 1.07) - 1) * s
    egb = 1 + (cg(mb, 0.86, 1.22) - 1) * s
    r, g, b = p.split()
    r = r.point(lambda v: 255 if v * egr >= 255 else int(v * egr))
    g = g.point(lambda v: 255 if v * egg >= 255 else int(v * egg))
    b = b.point(lambda v: 255 if v * egb >= 255 else int(v * egb))
    p = Image.merge("RGB", (r, g, b))
    p = ImageEnhance.Brightness(p).enhance(1.22)
    p = Image.blend(p, Image.new("RGB", p.size, (255, 255, 255)), 0.42)
    return p


def photo_bg(photo_path, fade_start=0.38, fade_end=0.68, focus=0.5):
    """Foto 1080x1350 full-bleed con fundido a blanco hacia abajo."""
    p = load_photo(photo_path, W, H, focus)
    img = white_fade(p, fade_start, fade_end)
    return img, ImageDraw.Draw(img)


def pill_nuevo(d, fonts_dir, text, C, y=64, x_right=None, left=False):
    f = SB(fonts_dir, 34)  # (v231) la pill es rol etiqueta: SemiBold
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
    d.rounded_rectangle([x0, y, x0 + w, y + h], radius=h // 2, outline=C["detail"], width=4)
    cx = x0 + w / 2
    cw = tw(d, text, f, tracking)
    ltext(d, cx - cw / 2, y + pad_y - 5, text, f, fill=C["btn_text"], tracking=tracking)
    return y + h


def style_promo(fonts_dir, p, C, hs):
    """Estilo 1 PROMO: foto full-bleed con fundido a blanco, barra del negocio,
    titular grande navy y sublinea."""
    focus = float(p.get("focus", 0.5) or 0.5)
    img, d = photo_bg(p["photo"], focus=focus)
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C)

    y = 600
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

    rtext(d, W - MX, H - 70, p.get("watermark", ""), R(fonts_dir, 30), fill=C["watermark"])
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
    rtext(d, W - MX, H - 64, p.get("watermark", ""), R(fonts_dir, 28), fill=C["watermark"])
    return img, y


def style_nocturno(fonts_dir, p, C, hs):
    """Estilo 3 NOCTURNO: foto con velo del color principal, texto blanco abajo."""
    focus = float(p.get("focus", 0.5) or 0.5)
    base = load_photo(p["photo"], W, H, focus)
    img = color_shade(base, brand_veil(C["accent"]), y0=0.25, y1=1.0, max_a=225)
    d = ImageDraw.Draw(img)
    white = (255, 255, 255)
    f0 = B(fonts_dir, 32)
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C, y=130)

    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, hs, 3)
    block = len(lines) * int(f.size * 1.08) + 30 + 52 + 40
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
    rtext(d, W - MX, H - 70, p.get("watermark", ""), R(fonts_dir, 30), fill=(200, 210, 220))
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
    y += 70  # (v205) sin rótulo: el nombre del negocio ya no se imprime
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
    rtext(d, W - MX, H - 56, p.get("watermark", ""), R(fonts_dir, 28), fill=(235, 240, 245))
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
    y += 68  # (v205) sin rótulo: el nombre del negocio ya no se imprime
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
    rtext(d, W - MX, H - 64, p.get("watermark", ""), R(fonts_dir, 28), fill=C["watermark"])
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
        d.ellipse([ccx - cr, ccy - cr, ccx + cr, ccy + cr], fill=C["accent"])
        d.ellipse([ccx - cr + 12, ccy - cr + 12, ccx + cr - 12, ccy + cr - 12], outline=C["detail"], width=4)
        f0 = B(fonts_dir, 38)
        while tw(d, tag, f0, 6) > cr * 2 - 80 and f0.size > 18:
            f0 = B(fonts_dir, f0.size - 2)
        ctext(d, ccx, ccy - f0.size // 2 - 4, tag, f0, fill=C["accent_text"], tracking=6)

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
    rtext(d, W - MX, H - 64, p.get("watermark", ""), R(fonts_dir, 28), fill=C["watermark"])
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
    tag = str(p.get("pill") or "").upper()  # (v205) sin fallback al nombre del negocio
    ctext(d, W // 2, y, tag, f0, fill=C["accent"], tracking=8)
    y += 90
    rtext(d, W - MX, H - 70, p.get("watermark", ""), R(fonts_dir, 30), fill=C["watermark"])
    return img, y + 20


def style_tipografico(fonts_dir, p, C, hs):
    """Estilo 8 TIPOGRAFICO: fondo derivado del color principal, titular gigante, franja de foto abajo."""
    focus = float(p.get("focus", 0.5) or 0.5)
    bg = brand_veil(C["accent"])
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    white = (255, 255, 255)
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C, y=64, left=True)

    y = 220
    f0 = B(fonts_dir, 34)
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
    top = Image.new("RGB", (W, 160), bg)
    region = img.crop((0, H - band_h, W, H - band_h + 160))
    img.paste(Image.composite(top, region, ov), (0, H - band_h))
    # watermark con pastilla navy para que se lea sobre la foto
    d = ImageDraw.Draw(img)
    wf = R(fonts_dir, 28)
    wt = p.get("watermark", "")
    if wt:
        ww = tw(d, wt, wf) + 56
        wh = 64
        wx1, wy1 = W - MX, H - 36
        d.rounded_rectangle([wx1 - ww, wy1 - wh, wx1, wy1], radius=wh // 2, fill=bg)
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
    # (v205) La banda de marca queda SIN el nombre impreso.
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C, y=76)
    rtext(d, W - MX, 172, p.get("watermark", ""), R(fonts_dir, 26), fill=(240, 246, 250))

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


# =====================================================================
# MOTOR v182 — estilos REALES del catálogo del producto.
# El spec trae por posteo: style (code del catálogo), style_name y
# treatment {skeleton, grade, crop} derivado determinísticamente en
# demo.js (mapeo en DEMO-STYLES.md). Gramática de composite-headline.py:
# foto protagonista a pantalla completa, titular integrado con fondo
# según la luminancia REAL de la zona, barra de acento con la paleta del
# cliente, Montserrat. Sin bloques de color como superficie principal.
# =====================================================================

def grade_v2(p):
    """Grado base suave: balance de blancos + exposición apenas levantada.
    (El grado viejo mezclaba 42% de blanco: lavaba la foto y se veía barato.)"""
    st = ImageStat.Stat(p)
    mr, mg, mb = st.mean[0], st.mean[1], st.mean[2]
    lum = (mr + mg + mb) / 3.0 or 1.0

    def cg(m, lo, hi):
        return min(max(lum / m, lo), hi) if m > 1 else 1.0

    s = 0.65
    egr = 1 + (cg(mr, 0.86, 1.16) - 1) * s
    egg = 1 + (cg(mg, 0.93, 1.07) - 1) * s
    egb = 1 + (cg(mb, 0.86, 1.22) - 1) * s
    r, g, b = p.split()
    r = r.point(lambda v: 255 if v * egr >= 255 else int(v * egr))
    g = g.point(lambda v: 255 if v * egg >= 255 else int(v * egg))
    b = b.point(lambda v: 255 if v * egb >= 255 else int(v * egb))
    p = Image.merge("RGB", (r, g, b))
    p = ImageEnhance.Brightness(p).enhance(1.08)
    p = Image.blend(p, Image.new("RGB", p.size, (255, 255, 255)), 0.14)
    return p


def load_photo_v2(photo_path, focus=0.5, zoom=1.0):
    """Foto full-bleed 1080x1350 con grado v2. zoom>1 = crop más cerrado
    (tratamiento macro/detalle del estilo)."""
    if not os.path.isfile(photo_path):
        raise FileNotFoundError("foto no encontrada: %s" % photo_path)
    _im = Image.open(photo_path)
    try:
        _im.draft("RGB", (W * 2, H * 2))
    except Exception:
        pass
    p = _im.convert("RGB")
    target = W / H
    pw, ph = p.size
    if pw / ph > target:
        nw = int(ph * target)
        x0 = (pw - nw) // 2
        p = p.crop((x0, 0, x0 + nw, ph))
    else:
        nh = int(pw / target)
        y0 = int((ph - nh) * max(0.0, min(1.0, focus)))
        p = p.crop((0, y0, pw, y0 + nh))
    p = p.resize((W, H), Image.LANCZOS)
    if zoom and zoom > 1.01:
        zw, zh = int(W * zoom), int(H * zoom)
        p = p.resize((zw, zh), Image.LANCZOS)
        x0 = (zw - W) // 2
        y0 = int((zh - H) * max(0.0, min(1.0, focus)))
        p = p.crop((x0, y0, x0 + W, y0 + H))
    return grade_v2(p)


def apply_grade(img, grade):
    if grade == "warm":
        img = Image.blend(img, Image.new("RGB", img.size, (255, 190, 120)), 0.06)
        img = ImageEnhance.Color(img).enhance(1.06)
    elif grade == "cool":
        img = Image.blend(img, Image.new("RGB", img.size, (140, 190, 255)), 0.05)
    elif grade == "vivid":
        img = ImageEnhance.Color(img).enhance(1.16)
        img = ImageEnhance.Contrast(img).enhance(1.06)
    elif grade == "soft":
        img = ImageEnhance.Color(img).enhance(0.92)
        img = ImageEnhance.Brightness(img).enhance(1.03)
    return img


def band_lum(img, y0f, y1f):
    """Luminancia media (0..255) de una franja horizontal de la foto."""
    y0 = int(H * y0f)
    y1 = max(y0 + 1, int(H * y1f))
    px = img.crop((0, y0, W, y1)).resize((1, 1)).getpixel((0, 0))
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]


def grad_scrim(img, rgb, y0f, y1f, alpha_max, from_top=False):
    """Degradé vertical de un color: fuerte en un borde, cero en y1f/y0f."""
    col = Image.new("L", (1, H), 0)
    px = col.load()
    for y in range(H):
        t = y / H
        if from_top:
            a = 0 if t >= y1f else int(alpha_max * (1 - t / max(y1f, 0.01))) if t > 0 else alpha_max
            if t <= 0:
                a = alpha_max
        else:
            if t <= y0f:
                a = 0
            elif t >= y1f:
                a = alpha_max
            else:
                a = int(alpha_max * (t - y0f) / (y1f - y0f))
        px[0, y] = max(0, min(255, a))
    mask = col.resize((W, H))
    return Image.composite(Image.new("RGB", (W, H), rgb), img, mask)


def sub_wrap(draw, fonts_dir, text, max_w, size=40, max_lines=2):
    f2 = R(fonts_dir, size)
    words, cur, lines = str(text or "").split(), "", []
    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(draw, t, f2) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return f2, lines[:max_lines]


# (v231) PRESUPUESTO DE TEXTO MEDIBLE (adopción n.º 1 del estudio):
# el bloque de texto (titular + bajada) ocupa como máximo el 20% del
# área de la pieza — el rango medido en las piezas ganadoras es
# 8–20%. La medición es la caja del bloque (alto × MAX_W) sobre el
# área del lienzo; el baseline pre-v231 medía ~25%.
TEXT_BUDGET_PCT = 20.0


def text_area_pct(total):
    """% del área de la pieza que ocupa un bloque de `total` px."""
    return (float(total) * MAX_W) / float(W * H) * 100.0


def block_layout(draw, fonts_dir, p, hs):
    """Mide el bloque de texto (barra + titular + sublínea).
    (v209) SIN botón CTA: el CTA vive en el caption, nunca pintado.
    (v231) GUARD DE ÁREA: si el bloque supera el presupuesto (20%),
    cede en este orden — titular más chico, bajada más chica, bajada
    recortada a 1 línea — hasta entrar. Régimen estricto sobre foto:
    sobre la foto manda el titular; la bajada es lo primero que cede."""
    f, lines = wrap_fit(draw, fonts_dir, p.get("headline", ""), MAX_W, min(hs, 118), 3)
    f2, slines = sub_wrap(draw, fonts_dir, p.get("subline", ""), MAX_W, 40, 2)

    def _total():
        head_h = sum(f.size + int(f.size * 0.08) for _ in lines)
        sub_h = sum(f2.size + 10 for _ in slines)
        return 9 + 30 + head_h + 18 + sub_h + 14

    total = _total()
    if text_area_pct(total) > TEXT_BUDGET_PCT:
        for size in (100, 88, 78, 68):
            if f.size <= size:
                continue
            f, lines = wrap_fit(draw, fonts_dir, p.get("headline", ""), MAX_W, size, 3)
            total = _total()
            if text_area_pct(total) <= TEXT_BUDGET_PCT:
                break
    if text_area_pct(total) > TEXT_BUDGET_PCT and slines:
        for ssize in (34, 30):
            f2, slines = sub_wrap(draw, fonts_dir, p.get("subline", ""), MAX_W, ssize, 2)
            total = _total()
            if text_area_pct(total) <= TEXT_BUDGET_PCT:
                break
    if text_area_pct(total) > TEXT_BUDGET_PCT and len(slines) > 1:
        slines = slines[:1]
        total = _total()
    return {"f": f, "lines": lines, "f2": f2, "slines": slines, "total": total,
            "area_pct": round(text_area_pct(total), 1)}


def block_draw(d, fonts_dir, p, C, lay, y, dark, center=False, accent_override=None):
    head_col = (255, 255, 255) if dark else C["headline"]
    sub_col = (208, 219, 231) if dark else C["subline"]
    bar_col = accent_override or C["accent"]
    if center:
        d.rectangle([W // 2 - 60, y, W // 2 + 60, y + 9], fill=bar_col)
    else:
        d.rectangle([MX, y, MX + 120, y + 9], fill=bar_col)
    y += 39
    for ln in lay["lines"]:
        if center:
            y = ctext(d, W // 2, y, ln, lay["f"], head_col)
        else:
            y = ltext(d, MX, y, ln, lay["f"], head_col)
        y += int(lay["f"].size * 0.08)
    y += 18
    for ln in lay["slines"]:
        if center:
            y = ctext(d, W // 2, y, ln, lay["f2"], sub_col)
        else:
            y = ltext(d, MX, y, ln, lay["f2"], sub_col)
        y += 10
    y += 14
    return y


# (v205) SIN NOMBRE DEL NEGOCIO EN LA PIEZA (orden de Valentino,
# 2026-10-18, caso "MILAGROS" en la semana de Mili): el nombre
# del cliente NO se imprime como masthead/rótulo en ningún
# esqueleto — vive en el caption y en el perfil, no en la
# imagen. Acá vivía draw_bar_name (arriba a la izquierda en
# los 5 esqueletos de foto): eliminado, no reintroducir.


def draw_footer(d, fonts_dir, p, dark_bg):
    """Fila inferior: solo la etiqueta del estilo (izquierda).

    Sin watermark "Hecho con Posty" en los posteos (pedido de Valentino,
    2026-10-17): el posteo es del cliente, no publicidad nuestra."""
    col = (198, 212, 226) if dark_bg else (110, 128, 148)
    name = str(p.get("style_name") or "").strip()
    if name:
        f = SB(fonts_dir, 24)  # (v231) rótulo = rol etiqueta (SemiBold)
        ltext(d, MX, H - 56, ("ESTILO · " + name).upper(), f, fill=col, tracking=3)


def _pic_watermark_on(img, pic_path):
    """(v197) Marca suave grande: la foto de perfil del negocio como
    fantasma de marca en la esquina inferior derecha de la foto. Va
    SOBRE la foto pero BAJO scrims y textos (se aplica en la base, antes
    de que el esqueleto dibuje): es el segundo uso posible de la foto de
    perfil en una semana — el otro es el medallón del póster, y nunca
    son el mismo tratamiento dos veces."""
    try:
        if not pic_path or not os.path.isfile(str(pic_path)):
            return img
        src = Image.open(str(pic_path)).convert("RGB")
        S = 470
        s = max(S / src.width, S / src.height)
        src = src.resize((max(S, int(src.width * s)), max(S, int(src.height * s))), Image.LANCZOS)
        ox = (src.width - S) // 2
        oy = (src.height - S) // 2
        src = src.crop((ox, oy, ox + S, oy + S)).filter(ImageFilter.GaussianBlur(0.7))
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, S, S], fill=46)
        mask = mask.filter(ImageFilter.GaussianBlur(8))
        img.paste(src, (W - S - 34, H - S - 120), mask)
    except Exception:
        pass
    return img


# =====================================================================
# (v209) ZONAS SEGURAS — EL TEXTO NUNCA PELEA CON LA FOTO.
# Regla dura de Valentino (2026-10-18, semana de Mili): el titular no
# puede pisar pinceles/producto ni caer sobre caras u ojos. Antes el
# bloque se ubicaba SOLO por luminancia de la banda: una cara luminosa
# o un flat-lay cargado recibían el texto encima igual.
# Ahora cada esqueleto de foto MIDE la foto antes de ubicar el bloque:
#   · CARAS: manifest relevado del stock (demo-faces.json, cajas
#     relativas mapeadas al lienzo replicando el recorte de
#     load_photo_v2) + heurística de piel en vivo para fotos fuera del
#     manifest (subidas del cliente). Una banda con cara queda
#     PROHIBIDA para el texto.
#   · DETALLE: mapa de textura por celdas (gradiente): el bloque va a
#     la zona más tranquila; si la elegida sigue cargada, gana un scrim
#     LOCALIZADO detrás del bloque (no sobre toda la foto).
#   · Si ninguna banda sirve (cara o detalle extremo en ambas), la
#     pieza cae al PANEL EDITORIAL: foto arriba, panel pleno de la
#     paleta abajo y el texto sobre el panel — jamás sobre el sujeto.
# La zona final de cada posteo se imprime en el log (zone=...) y los
# tests la verifican contra el manifest.
# =====================================================================
import json as _json
from collections import deque as _deque

try:
    import numpy as _np
except Exception:  # pragma: no cover — el entorno de render trae numpy
    _np = None

_FACES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo-faces.json")
_FACES_CACHE = None
_LAST_ZONE = {"zone": "", "busy": 0.0}

# Umbrales de ocupación (0..1) calibrados sobre el stock del demo:
# >0.42 la banda se considera cargada (candidata a flip si la otra está
# tranquila); >0.60 ni con scrim localizado alcanza → panel editorial.
ZONE_FLIP = 0.42
ZONE_PANEL = 0.60
ZONE_SCRIM = 0.16


def _faces_manifest():
    global _FACES_CACHE
    if _FACES_CACHE is None:
        try:
            with open(_FACES_PATH, "r", encoding="utf-8") as f:
                _FACES_CACHE = _json.load(f).get("photos", {})
        except Exception:
            _FACES_CACHE = {}
    return _FACES_CACHE


def _manifest_faces_canvas(photo_path, focus, zoom, key="faces"):
    """Cajas del manifest (relativas a la foto fuente) → lienzo
    1080x1350, replicando el recorte cover de load_photo_v2 y su zoom.
    Se expanden un margen de seguridad (8% + 10 px). key: 'faces'
    (prohibición dura) o 'hero' (el objeto protagonista: señal blanda)."""
    try:
        entry = _faces_manifest().get(os.path.basename(str(photo_path or "")))
        if not entry:
            return []
        boxes = entry.get(key) or []
        if not boxes:
            return []
        with Image.open(photo_path) as im:
            pw, ph = im.size
        target = W / H
        if pw / ph > target:
            nw = ph * target
            x0s, y0s, vw, vh = (pw - nw) / 2.0, 0.0, nw, float(ph)
        else:
            nh = pw / target
            x0s, y0s, vw, vh = 0.0, (ph - nh) * max(0.0, min(1.0, focus)), float(pw), nh
        out = []
        for (fx0, fy0, fx1, fy1) in boxes:
            cx0 = (fx0 * pw - x0s) / vw * W
            cx1 = (fx1 * pw - x0s) / vw * W
            cy0 = (fy0 * ph - y0s) / vh * H
            cy1 = (fy1 * ph - y0s) / vh * H
            if zoom and zoom > 1.01:
                zx0 = (W * zoom - W) / 2.0
                zy0 = (H * zoom - H) * max(0.0, min(1.0, focus))
                cx0, cx1 = cx0 * zoom - zx0, cx1 * zoom - zx0
                cy0, cy1 = cy0 * zoom - zy0, cy1 * zoom - zy0
            mx = (cx1 - cx0) * 0.08 + 10
            my = (cy1 - cy0) * 0.08 + 10
            cx0, cy0 = max(0.0, cx0 - mx), max(0.0, cy0 - my)
            cx1, cy1 = min(float(W), cx1 + mx), min(float(H), cy1 + my)
            if cx1 > cx0 and cy1 > cy0:
                out.append((cx0, cy0, cx1, cy1))
        return out
    except Exception:
        return []


def _skin_faces_canvas(img):
    """Heurística de piel en vivo: respaldo para fotos fuera del
    manifest (la subida del cliente). Componentes conexas de piel en
    una grilla de 90x112; se quedan las compactas con tamaño de cara
    (ni manchas chicas ni superficies enormes tipo piso de madera)."""
    if _np is None:
        return []
    try:
        small = img.resize((270, 338))
        a = _np.asarray(small).astype(_np.int16)
        R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
        skin = (R > 90) & (G > 35) & (B > 18) & ((R - G) > 8) & ((R - B) > 14)
        skin |= (R > 60) & (G > 28) & (B > 12) & (R >= G) & ((R - B) > 9) & ((R - G) > 3)
        m = skin[:336, :270].reshape(112, 3, 90, 3).mean(axis=(1, 3)) >= 0.5
        seen = _np.zeros(m.shape, dtype=bool)
        boxes = []
        for gy in range(112):
            for gx in range(90):
                if not m[gy, gx] or seen[gy, gx]:
                    continue
                q = _deque([(gy, gx)])
                seen[gy, gx] = True
                cells = []
                while q:
                    cy, cx = q.popleft()
                    cells.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < 112 and 0 <= nx < 90 and m[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
                area = len(cells)
                if area < 22:
                    continue
                ys = [c[0] for c in cells]
                xs = [c[1] for c in cells]
                bw = max(xs) - min(xs) + 1
                bh = max(ys) - min(ys) + 1
                if bw < 3 or bh < 3:
                    continue
                # Filtros de CARA (calibrados contra el stock: la piel
                # suelta — mármol crema, madera, paredes cálidas, brazos
                # — forma manchas enormes, estiradas o bajas; una cara
                # es compacta, de tamaño acotado y vive en la mitad
                # superior del encuadre típico de retrato/servicio).
                wf = bw * 12.0 / W
                hf = bh * 12.05 / H
                if wf < 0.07 or wf > 0.42 or hf < 0.06 or hf > 0.40:
                    continue
                if (min(ys) + max(ys)) / 2.0 * 12.05 / H > 0.72:
                    continue
                asp = bw / float(bh)
                if asp < 0.5 or asp > 1.9:
                    continue
                if area < 0.5 * bw * bh:
                    continue
                sx = W / 90.0
                sy = H / 112.0
                boxes.append((min(xs) * sx - 12, min(ys) * sy - 12,
                              (max(xs) + 1) * sx + 12, (max(ys) + 1) * sy + 12))
        return boxes
    except Exception:
        return []


def _detail_grid(img):
    """Mapa de textura 0..1 en celdas de ~12 px (90x112): energía de
    bordes normalizada — 0 = superficie plana, 1 = muy cargada."""
    if _np is None:
        return None
    try:
        a = _np.asarray(img.resize((270, 338)).convert("L")).astype(_np.float32) / 255.0
        g = _np.zeros_like(a)
        g[:, :-1] += _np.abs(_np.diff(a, axis=1))
        g[:-1, :] += _np.abs(_np.diff(a, axis=0))
        cells = g[:336, :270].reshape(112, 3, 90, 3).mean(axis=(1, 3))
        return _np.clip(cells / 0.16, 0.0, 1.0)
    except Exception:
        return None


def _rect_busy(grid, rect):
    """Ocupación de un rect del lienzo: mezcla de fracción de celdas con
    textura fuerte y energía media."""
    if grid is None:
        return 0.0
    x0, y0, x1, y1 = rect
    cx0 = max(0, int(x0 / 12))
    cx1 = min(90, int(x1 / 12) + 1)
    cy0 = max(0, int(y0 / 12.05))
    cy1 = min(112, int(y1 / 12.05) + 1)
    if cx1 <= cx0 or cy1 <= cy0:
        return 0.0
    sub = grid[cy0:cy1, cx0:cx1]
    return float(0.65 * (sub > 0.45).mean() + 0.35 * sub.mean())


def _rect_hits_face(faces, rect):
    x0, y0, x1, y1 = rect
    for (fx0, fy0, fx1, fy1) in faces:
        if fx0 < x1 and fx1 > x0 and fy0 < y1 and fy1 > y0:
            return True
    return False


def analyze_photo(img, p, zoom_override=None):
    """Análisis completo de la foto YA compuesta en el lienzo:
    'faces' = caras del manifest (prohibición DURA: el texto jamás va
    ahí); 'soft' = objeto héroe del manifest + manchas de piel de la
    heurística en vivo (señal BLANDA: mueve el bloque si la otra banda
    está libre y fuerza scrim si el bloque queda encima — la heurística
    sola no puede distinguir una cara de un sillón beige, por eso no
    prohíbe en duro); 'all' = la unión. Más el mapa de detalle."""
    tr = p.get("treatment") or {}
    focus = float(p.get("focus", 0.5) or 0.5)
    zoom = zoom_override if zoom_override is not None else (1.28 if tr.get("crop") == "tight" else 1.0)
    faces = _manifest_faces_canvas(p.get("photo"), focus, zoom, "faces")
    soft = _manifest_faces_canvas(p.get("photo"), focus, zoom, "hero")
    soft += _skin_faces_canvas(img)
    return {"grid": _detail_grid(img), "faces": faces, "soft": soft, "all": faces + soft}


def text_rects(total):
    """Rectángulos que ocuparía el bloque de texto en cada banda."""
    rb = (40, (H - 110) - total, W - 40, H - 96)
    rt = (40, 132, W - 40, 164 + total)
    return rb, rt


def _rect_soft_ratio(soft, rect):
    """Mayor fracción del rect cubierta por UNA caja blanda (héroe o
    piel): 0 = libre, 1 = la caja se come todo el bloque."""
    x0, y0, x1, y1 = rect
    area = max(1.0, (x1 - x0) * (y1 - y0))
    best = 0.0
    for (fx0, fy0, fx1, fy1) in soft:
        ix = max(0.0, min(x1, fx1) - max(x0, fx0))
        iy = max(0.0, min(y1, fy1) - max(y0, fy0))
        if ix > 0 and iy > 0:
            best = max(best, (ix * iy) / area)
    return best


def choose_text_zone(an, total, prefer):
    """Decide la zona del bloque → (zona, busy, protect).
    Cara del manifest en la banda = prohibida (duro). Señal blanda
    (héroe o piel) en la banda preferida = se mueve a la otra si está
    libre; si la elegida conserva una señal blanda encima, protect=True
    (scrim localizado fuerte). Banda muy cargada = la otra si está
    tranquila. Extremo en la elegida = panel editorial."""
    rb, rt = text_rects(total)
    rects = {"bottom": rb, "top": rt}
    busy = {z: _rect_busy(an["grid"], r) for z, r in rects.items()}
    hard = {z: _rect_hits_face(an["faces"], r) for z, r in rects.items()}
    sratio = {z: _rect_soft_ratio(an["soft"], r) for z, r in rects.items()}
    other = "top" if prefer == "bottom" else "bottom"
    if hard[prefer] and hard[other]:
        return "panel", busy[prefer], True
    if hard[prefer]:
        return other, busy[other], sratio[other] > 0.10
    z = prefer
    # Señal blanda fuerte en la preferida y claramente menor en la otra
    # (el pote de la foto de agenda: 36% del bloque arriba, 10% abajo):
    # el bloque se muda aunque la otra banda también roce la señal.
    if sratio[z] > 0.22 and not hard[other] and sratio[other] < sratio[z] * 0.6:
        z = other
    if busy[z] > ZONE_FLIP and not hard[other] and busy[other] < busy[z] * 0.62:
        z = other
    if busy[z] > ZONE_PANEL:
        if not hard[other] and busy[other] <= busy[z]:
            z = other
        if busy[z] > ZONE_PANEL:
            return "panel", busy[z], True
    return z, busy[z], sratio[z] > 0.10


def local_scrim(img, rect, rgb, alpha):
    """Velo localizado y difuminado detrás del bloque: el texto gana una
    superficie calma sin tapar el resto de la foto."""
    x0, y0, x1, y1 = [int(v) for v in rect]
    x0 = max(0, x0 - 26)
    y0 = max(0, y0 - 24)
    x1 = min(W, x1 + 26)
    y1 = min(H, y1 + 24)
    mask = Image.new("L", (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, x1 - x0, y1 - y0], radius=30, fill=int(alpha))
    mask = mask.filter(ImageFilter.GaussianBlur(16))
    img.paste(Image.new("RGB", (x1 - x0, y1 - y0), rgb), (x0, y0), mask)
    return img


def white_fade_top(img):
    """Espejo vertical de white_fade (para el esqueleto claro cuando el
    bloque va arriba)."""
    return white_fade(img.transpose(Image.FLIP_TOP_BOTTOM), 0.52, 0.86).transpose(Image.FLIP_TOP_BOTTOM)


# (v231) CONTRASTE ≥ 4,5:1 (adopción n.º 6 — vara WCAG AA de las
# reseñas pro): ratio de luminancia relativa entre el color del texto
# y el fondo REAL detrás del bloque (muestreado de la pieza ya
# compuesta, scrims incluidos).
def _rel_lum(rgb):
    def _f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * _f(r) + 0.7152 * _f(g) + 0.0722 * _f(b)


def contrast_ratio(rgb_a, rgb_b):
    la, lb = _rel_lum(rgb_a), _rel_lum(rgb_b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _band_mean_rgb(img, rect):
    x0, y0, x1, y1 = [int(v) for v in rect]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(W, x1), min(H, y1)
    if x1 <= x0 or y1 <= y0:
        return (128, 128, 128)
    crop = img.crop((x0, y0, x1, y1)).resize((24, 24))
    px = list(crop.getdata())
    n = max(1, len(px))
    return tuple(sum(c[i] for c in px) // n for i in range(3))


def _pill_for(p):
    """(v231) TEST DE SUSTRACCIÓN a nivel render (adopción n.º 10): la
    pila máxima por pieza es titular + UN elemento extra (bajada O
    pastilla, nunca ambos). La regla vive en el spec desde v228; esto
    es la red de seguridad del renderer para cualquier spec que la
    viole: la pastilla cede."""
    if not str(p.get("pill") or "").strip():
        return ""
    if str(p.get("headline") or "").strip() and str(p.get("subline") or "").strip():
        return ""
    return p.get("pill")


def _note_zone(zone, total, rect):
    """Registra la medición del bloque para el log/tests: zona, % de
    área y la REGLA DE BANDAS (Valentino, 2026-10-18 — "nada de
    palabras en el medio del posteo"): el centro vertical del bloque
    NUNCA puede caer en el tercio medio de la pieza; el texto vive
    solo en la banda superior o la inferior."""
    cy = (rect[1] + rect[3]) / 2.0
    band_ok = not (H / 3.0 < cy < 2.0 * H / 3.0)
    _LAST_ZONE.update(zone=zone, area=round(text_area_pct(total), 1), band_ok=band_ok)
    return band_ok


def _sk_panel(fonts_dir, p, C, hs, base, lay):
    """Panel editorial (última ratio de la regla): foto arriba y panel
    pleno de la paleta del cliente abajo con el bloque completo. El
    texto jamás pisa el sujeto porque no hay foto detrás."""
    total = lay["total"]
    panel_h = total + 150
    photo_h = H - panel_h
    dark = _lum(C["poster_bg"]) < 0.5
    img = Image.new("RGB", (W, H), C["poster_bg"] if dark else WHITE)
    img.paste(base.crop((0, 0, W, photo_h)), (0, 0))
    d = ImageDraw.Draw(img)
    if _pill_for(p):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C)
    y = block_draw(d, fonts_dir, p, C, lay, photo_h + 36, dark)
    draw_footer(d, fonts_dir, p, dark)
    _note_zone("panel", total, (0, photo_h, W, H))
    return img, y


def _sk_photo_block(fonts_dir, p, C, hs, prefer, kind):
    """Gramática foto+bloque con ZONAS SEGURAS (v209). kind: 'abajo' |
    'arriba' (degradé según la luz de la zona elegida), 'velo' (navy
    fuerte, siempre oscuro), 'claro' (fundido a blanco, siempre claro).
    La zona preferida es la identidad del esqueleto; la regla de zonas
    puede mover el bloque a la otra banda o al panel editorial."""
    img = _v2_base(fonts_dir, p, C)
    if kind == "velo":
        img = ImageEnhance.Brightness(img).enhance(0.94)
    probe = ImageDraw.Draw(img)
    lay = block_layout(probe, fonts_dir, p, hs)
    an = analyze_photo(img, p)
    zone, busy, protect = choose_text_zone(an, lay["total"], prefer)
    _LAST_ZONE.update(zone=zone, busy=round(busy, 2))
    if zone == "panel":
        return _sk_panel(fonts_dir, p, C, hs, img, lay)
    rb, rt = text_rects(lay["total"])
    rect = rb if zone == "bottom" else rt
    # (v231) REGLA DE BANDAS (Valentino, 2026-10-18 — "nada de
    # palabras en el medio del posteo"): si el centro vertical del
    # bloque cayera en el tercio medio (bloque gigante), la pieza cae
    # al panel editorial inferior. El texto vive SOLO en las bandas.
    if not _note_zone(zone, lay["total"], rect):
        return _sk_panel(fonts_dir, p, C, hs, img, lay)
    if kind == "velo":
        dark = True
    elif kind == "claro":
        dark = False
    elif zone == "bottom":
        dark = band_lum(img, 0.55, 1.0) < 165
    else:
        dark = band_lum(img, 0.0, 0.45) < 165
    if kind == "claro":
        img = white_fade(img, fade_start=0.52, fade_end=0.86) if zone == "bottom" else white_fade_top(img)
    elif zone == "bottom":
        a_max = 236 if kind == "velo" else (218 if dark else 228)
        y0f, y1f = (0.30, 0.96) if kind == "velo" else (0.48, 0.94)
        img = grad_scrim(img, NAVY if dark else WHITE, y0f, y1f, a_max)
    else:
        a_max = 236 if kind == "velo" else (218 if dark else 228)
        y1f = 0.70 if kind == "velo" else 0.52
        img = grad_scrim(img, NAVY if dark else WHITE, 0.0, y1f, a_max, from_top=True)
    if protect:
        img = local_scrim(img, rect, NAVY if dark else WHITE, 225)
    elif busy > ZONE_SCRIM:
        img = local_scrim(img, rect, NAVY if dark else WHITE, int(min(235, 100 + busy * 190)))
    # (v231) GATE DE CONTRASTE ≥ 4,5:1 (adopción n.º 6): el titular se
    # mide contra el fondo REAL detrás del bloque (ya con scrims); si
    # no alcanza la vara, se refuerza el velo localizado y se remide.
    text_rgb = (255, 255, 255) if dark else C["headline"]
    ratio = contrast_ratio(text_rgb, _band_mean_rgb(img, rect))
    if ratio < 4.5:
        img = local_scrim(img, rect, NAVY if dark else WHITE, 235)
        ratio = contrast_ratio(text_rgb, _band_mean_rgb(img, rect))
    if ratio < 4.5:
        img = local_scrim(img, rect, NAVY if dark else WHITE, 255)
        ratio = contrast_ratio(text_rgb, _band_mean_rgb(img, rect))
    _LAST_ZONE["contrast"] = round(ratio, 2)
    d = ImageDraw.Draw(img)
    if _pill_for(p):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C)
    aov = C["btn"] if kind == "velo" else None
    if zone == "bottom":
        y = block_draw(d, fonts_dir, p, C, lay, (H - 110) - lay["total"], dark, accent_override=aov)
        draw_footer(d, fonts_dir, p, dark)
    else:
        y = block_draw(d, fonts_dir, p, C, lay, 150, dark, accent_override=aov)
        draw_footer(d, fonts_dir, p, band_lum(img, 0.8, 1.0) < 150)
    return img, y


def _sk_clean(fonts_dir, p, C, skel):
    """(v209) Pieza LIMPIA de la dosificación: la foto sale sin titular,
    sin pill y sin scrims de texto — solo el grado del tratamiento (y el
    split del dúo, que es lenguaje visual, sin chips ni bloque)."""
    if skel == "duo":
        tr = p.get("treatment") or {}
        focus = float(p.get("focus", 0.5) or 0.5)
        base = load_photo_v2(p["photo"], focus, 1.0)
        base = apply_grade(base, tr.get("grade") or "neutral")
        left = ImageEnhance.Color(base.crop((0, 0, W // 2, H))).enhance(0.22)
        left = ImageEnhance.Brightness(left).enhance(0.94)
        right = ImageEnhance.Color(base.crop((W // 2, 0, W, H))).enhance(1.14)
        img = Image.new("RGB", (W, H))
        img.paste(left, (0, 0))
        img.paste(right, (W // 2, 0))
        ImageDraw.Draw(img).rectangle([W // 2 - 3, 0, W // 2 + 3, H], fill=(255, 255, 255))
        return img
    return _v2_base(fonts_dir, p, C)


def _v2_base(fonts_dir, p, C):
    tr = p.get("treatment") or {}
    focus = float(p.get("focus", 0.5) or 0.5)
    zoom = 1.28 if tr.get("crop") == "tight" else 1.0
    img = load_photo_v2(p["photo"], focus, zoom)
    img = apply_grade(img, tr.get("grade") or "neutral")
    if p.get("pic_mark") == "watermark":
        img = _pic_watermark_on(img, p.get("pic_path"))
    return img


def sk_abajo(fonts_dir, p, C, hs):
    """Degradé inferior (navy o blanco según la luz de la zona) + bloque
    abajo — con zonas seguras v209: el bloque puede subir o ir al panel
    si abajo hay una cara o detalle extremo."""
    return _sk_photo_block(fonts_dir, p, C, hs, "bottom", "abajo")


def sk_arriba(fonts_dir, p, C, hs):
    """Degradé superior + bloque arriba: la foto respira abajo — con
    zonas seguras v209 (puede bajar o ir al panel si arriba hay cara)."""
    return _sk_photo_block(fonts_dir, p, C, hs, "top", "arriba")


def sk_velo(fonts_dir, p, C, hs):
    """Cine/nocturno: foto levemente oscurecida + velo navy fuerte —
    zona segura v209 (el velo sigue al bloque si este se mueve)."""
    return _sk_photo_block(fonts_dir, p, C, hs, "bottom", "velo")


def sk_claro(fonts_dir, p, C, hs):
    """Editorial luminoso: fundido a blanco tardío (la foto manda hasta
    el 52%) — zona segura v209 (el fundido se espeja si el bloque sube)."""
    return _sk_photo_block(fonts_dir, p, C, hs, "bottom", "claro")


def sk_centro(fonts_dir, p, C, hs):
    """(v231) RETIRADO — REGLA DE VALENTINO (2026-10-18, textual):
    "Nada de palabras en el medio del posteo". El texto va SOLO en
    las bandas superior o inferior de la pieza, NUNCA en el centro —
    posteos, historias y reels. Este esqueleto dibujaba un panel
    central con el texto en el medio (pisó la cara del personaje en
    una pieza real): quedó retirado SIN excepciones por identidad de
    familia, y cualquier spec que lo pida cae al panel editorial
    inferior (sk_panel) — el mismo destino que ya tenía cuando el
    panel central pisaba una cara."""
    img = _v2_base(fonts_dir, p, C)
    probe = ImageDraw.Draw(img)
    lay = block_layout(probe, fonts_dir, p, hs)
    return _sk_panel(fonts_dir, p, C, hs, img, lay)


def sk_duo(fonts_dir, p, C, hs):
    """Antes/después: misma foto partida — izquierda apagada, derecha viva."""
    tr = p.get("treatment") or {}
    focus = float(p.get("focus", 0.5) or 0.5)
    base = load_photo_v2(p["photo"], focus, 1.0)
    base = apply_grade(base, tr.get("grade") or "neutral")
    left = ImageEnhance.Color(base.crop((0, 0, W // 2, H))).enhance(0.22)
    left = ImageEnhance.Brightness(left).enhance(0.94)
    right = ImageEnhance.Color(base.crop((W // 2, 0, W, H))).enhance(1.14)
    img = Image.new("RGB", (W, H))
    img.paste(left, (0, 0))
    img.paste(right, (W // 2, 0))
    img = grad_scrim(img, NAVY, 0.74, 0.98, 228)
    d = ImageDraw.Draw(img)
    d.rectangle([W // 2 - 3, 0, W // 2 + 3, int(H * 0.78)], fill=(255, 255, 255))
    # chips ANTES / DESPUÉS
    fchip = SB(fonts_dir, 28)  # (v231) chips = rol etiqueta (SemiBold)
    for label, x0, fill, tcol in (("ANTES", MX, NAVY, (255, 255, 255)), ("DESPUÉS", W - MX, C["accent"], C["accent_text"])):
        wch = tw(d, label, fchip, 4) + 44
        xa = x0 if label == "ANTES" else x0 - wch
        d.rounded_rectangle([xa, 56, xa + wch, 56 + 62], radius=31, fill=fill)
        ltext(d, xa + 22, 56 + 15, label, fchip, fill=tcol, tracking=4)
    lay = block_layout(d, fonts_dir, p, hs)
    # (v209) Si el bloque inferior del dúo cae sobre una cara o una zona
    # muy cargada del split, scrim localizado sólido detrás del bloque.
    _an = analyze_photo(img, p, zoom_override=1.0)
    _rb, _rt = text_rects(lay["total"])
    _busy_duo = _rect_busy(_an["grid"], _rb)
    _LAST_ZONE.update(zone="duo", busy=round(_busy_duo, 2))
    _note_zone("duo", lay["total"], _rb)  # (v231) banda inferior + área
    if _rect_hits_face(_an["all"], _rb) or _busy_duo > 0.55:
        img = local_scrim(img, _rb, NAVY, 235)
        d = ImageDraw.Draw(img)
    y = (H - 110) - lay["total"]
    y = block_draw(d, fonts_dir, p, C, lay, y, True)
    draw_footer(d, fonts_dir, p, True)
    return img, y


def _lum(rgb):
    return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255.0


def _blend(rgb, other, t):
    return tuple(int(round(rgb[i] + (other[i] - rgb[i]) * t)) for i in range(3))


def sk_poster(fonts_dir, p, C, hs):
    """(v196) PÓSTER DE MARCA para perfiles de servicios/contenido: fondo
    PLENO del color oscuro de la paleta del cliente, su foto de perfil como
    medallón protagonista (anillo de marca + halo suave) y titular enorme.
    Es el lenguaje de los posteos de una marca con protagonista (ilustración
    + titular gigante sobre color), no una foto de stock con texto encima.
    Sin foto de perfil utilizable → póster tipográfico con las iniciales
    del negocio en el medallón. Nada de foto de stock en esta pieza."""
    bg = C["poster_bg"]
    # (v197) Registro heredado del feed: si el fondo que manda demo.js
    # es CLARO (feed luminoso), el póster entero se lee en clave clara —
    # textos navy/oscuros de la paleta sobre el tinte crema de su marca.
    dark_bg = _lum(bg) < 0.5
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    if _pill_for(p):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C)
    # (v205) Sin nombre del negocio impreso arriba: la identidad
    # la cargan el medallón, la paleta y el titular — no un rótulo.

    # Medallón protagonista (centrado, tercio superior).
    cx, cy, r = W // 2, 402, 196
    halo = _blend(bg, (255, 255, 255), 0.10) if dark_bg else _blend(bg, NAVY, 0.05)
    d.ellipse([cx - r - 40, cy - r - 40, cx + r + 40, cy + r + 40], fill=halo)
    pic = p.get("photo")
    medallion = None
    if pic and os.path.isfile(str(pic)):
        try:
            src = Image.open(str(pic)).convert("RGB")
            s = max((2 * r) / src.width, (2 * r) / src.height)
            src = src.resize((max(2 * r, int(src.width * s)), max(2 * r, int(src.height * s))), Image.LANCZOS)
            ox = (src.width - 2 * r) // 2
            oy = (src.height - 2 * r) // 2
            medallion = src.crop((ox, oy, ox + 2 * r, oy + 2 * r))
            # La foto de perfil de IG llega chica (100px): un toque de
            # nitidez tras el upscale para que el medallón no se vea lavado.
            medallion = medallion.filter(ImageFilter.UnsharpMask(radius=2, percent=68, threshold=2))
        except Exception:
            medallion = None
    if medallion is not None:
        mask = Image.new("L", (2 * r, 2 * r), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, 2 * r, 2 * r], fill=255)
        img.paste(medallion, (cx - r, cy - r), mask)
        d = ImageDraw.Draw(img)
    else:
        # Medallón tipográfico: círculo del color vivo de la paleta con las
        # iniciales del negocio (la identidad entra igual, sin foto).
        fill = C["accent"] if _lum(C["accent"]) >= _lum(C["btn"]) else C["btn"]
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
        name = str(p.get("bar", "") or "").strip()
        initials = "".join(w[0] for w in name.split()[:2]).upper() or "•"
        f_ini = B(fonts_dir, 168)
        tcol = (10, 30, 51) if _lum(fill) > 0.55 else (255, 255, 255)
        iw = tw(d, initials, f_ini)
        d.text((cx - iw / 2, cy - f_ini.size * 0.58), initials, font=f_ini, fill=tcol)
    # Anillo de marca sobre el medallón (doble: vivo + blanco fino).
    ring = C["btn"] if _lum(C["btn"]) > 0.18 else C["accent"]
    d.ellipse([cx - r - 7, cy - r - 7, cx + r + 7, cy + r + 7], outline=ring, width=13)
    outer = (255, 255, 255) if dark_bg else _blend(bg, NAVY, 0.22)
    d.ellipse([cx - r - 18, cy - r - 18, cx + r + 18, cy + r + 18], outline=outer, width=4)

    if dark_bg:
        # Titular enorme: el color claro de la paleta si contrasta; si no, blanco.
        light = C["accent"] if _lum(C["accent"]) >= _lum(C["btn"]) else C["btn"]
        head_col = light if _lum(light) >= 0.45 else (255, 255, 255)
        rule_col = C["btn"] if head_col == C["accent"] else C["accent"]
        if abs(_lum(rule_col) - _lum(bg)) < 0.08:
            rule_col = head_col  # la regla no puede fundirse con el fondo
    else:
        # Registro claro: titular en el color oscuro de SU paleta y la
        # regla en el color de paleta más visible sobre claro.
        head_col = C["poster_dark"]
        rule_col = C["accent"] if _lum(C["accent"]) <= _lum(C["btn"]) else C["btn"]
        if rule_col == head_col:
            rule_col = C["btn"] if rule_col == C["accent"] else C["accent"]
    # (v231) REGLA DE BANDAS (Valentino, 2026-10-18) también en el
    # póster: el bloque se ancla a la BANDA INFERIOR — antes colgaba
    # del medallón y su centro caía en el tercio medio de la pieza.
    # El layout sale de block_layout: manda el guard de área (≤20%).
    lay = block_layout(d, fonts_dir, p, hs)
    y = max(cy + r + 56, H - 104 - lay["total"])
    block_top = y
    d.rectangle([cx - 60, y, cx + 60, y + 10], fill=rule_col)
    y += 52
    f, lines = lay["f"], lay["lines"]
    for ln in lines:
        y = ctext(d, cx, y, ln, f, head_col)
        y += int(f.size * 0.10)
    y += 16
    sub_col = _blend(bg, (255, 255, 255), 0.78) if dark_bg else _blend(bg, NAVY, 0.62)
    f2, slines = lay["f2"], lay["slines"]
    for ln in slines:
        y = ctext(d, cx, y, ln, f2, sub_col)
        y += 12
    y += 34
    _note_zone("poster", lay["total"], (0, block_top, W, y))
    draw_footer(d, fonts_dir, p, dark_bg)
    return img, y


SKELETONS_V2 = {
    "abajo": sk_abajo,
    "arriba": sk_arriba,
    "velo": sk_velo,
    "claro": sk_claro,
    "centro": sk_centro,
    "duo": sk_duo,
    "poster": sk_poster,
}


def _hero_width_frac(p, zoom):
    """Ancho del héroe (caja 'hero' del manifest) como fracción del
    ancho del lienzo, al zoom indicado. None si la foto no declara
    héroe (nada que verificar)."""
    try:
        boxes = _manifest_faces_canvas(p.get("photo"), float(p.get("focus", 0.5) or 0.5), zoom, "hero")
        if not boxes:
            return None
        return max((x1 - x0) for (x0, y0, x1, y1) in boxes) / float(W)
    except Exception:
        return None


def render_v2(fonts_dir, p, C, hs):
    tr = p.get("treatment") or {}
    skel = str(tr.get("skeleton") or "abajo")
    fn = SKELETONS_V2.get(skel, sk_abajo)
    # (v209) Pieza LIMPIA de la dosificación (sin titular y sin pill en
    # el spec de render): la foto sale limpia — sin bloque, sin scrims
    # de texto, solo el grado del tratamiento. El póster es tipográfico
    # por definición: nunca va por esta vía.
    clean = skel != "poster" and not str(p.get("headline") or "").strip() \
        and not str(p.get("pill") or "").strip()
    if clean:
        _LAST_ZONE.update(zone="clean", busy=0.0, area=0.0, band_ok=True)
        img, bottom = _sk_clean(fonts_dir, p, C, skel), H
    else:
        img, bottom = fn(fonts_dir, p, C, hs)
    # (v231) SUBJECT_SCALE verificado (adopción n.º 2): si el héroe de
    # la foto queda por debajo del rango de su familia (con texto o
    # limpio según la pieza), se reintenta UNA vez con crop tight
    # (zoom) — el mismo patrón de ajuste/reintento que usa el QA.
    ss = p.get("subject_scale") or {}
    if ss and p.get("photo") and skel != "poster":
        rng = ss.get("clean") if clean else ss.get("text")
        if rng:
            zoom = 1.28 if tr.get("crop") == "tight" else 1.0
            frac = _hero_width_frac(p, zoom)
            if frac is not None:
                _LAST_ZONE["hero"] = round(frac, 2)
                if frac < float(rng[0]) - 0.03 and tr.get("crop") != "tight":
                    p2 = dict(p)
                    p2["treatment"] = dict(tr, crop="tight")
                    if clean:
                        img, bottom = _sk_clean(fonts_dir, p2, C, skel), H
                    else:
                        img, bottom = fn(fonts_dir, p2, C, hs)
                    _LAST_ZONE["scale_adj"] = "zoom"
    return img, bottom


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
        # v182: si el posteo trae treatment, manda el motor nuevo (estilos
        # reales del catálogo); si no, los estilos legacy de siempre.
        fn = render_v2 if p.get("treatment") else STYLES.get(str(p.get("style") or "promo"), style_promo)
        bottom, img = None, None
        _LAST_ZONE.update(zone="", busy=0.0, area=None, band_ok=None, contrast=None, hero=None, scale_adj=None)
        for hs in (150, 130, 112, 96):
            # re-render limpio en cada intento
            img, bottom = fn(fonts_dir, p, C, hs)
            if bottom <= 1300:
                break
        out = os.path.join(outdir, "post-%d.jpg" % (int(spec.get("index_offset", 0)) + i))
        # JPEG q90 en vez de PNG (2026-10-17, velocidad de la prueba): los
        # diseños son fotos compuestas sin transparencia; el PNG pesaba
        # 3-5x más y tardaba más en codificarse, viajar y pintarse en el
        # teléfono del visitante, sin ninguna diferencia visible.
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(out, quality=90)
        print("post-%d OK style=%s bottom=%d zone=%s busy=%s area=%s band_ok=%s contrast=%s hero=%s" % (int(spec.get("index_offset", 0)) + i, p.get("style", "promo"), bottom, _LAST_ZONE.get("zone") or "-", _LAST_ZONE.get("busy", 0), _LAST_ZONE.get("area"), _LAST_ZONE.get("band_ok"), _LAST_ZONE.get("contrast"), _LAST_ZONE.get("hero")))

    print("DONE %d" % len(spec["posts"]))


if __name__ == "__main__":
    main()
