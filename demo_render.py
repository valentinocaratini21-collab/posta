#!/usr/bin/env python3
"""Render de la demo publica de Posta: posteos 1080x1350 estilo premium.

Estilo = lenguaje de hero-post.png: foto full-bleed con fundido a blanco,
barra celeste #2793C8 con etiqueta blanca, titular navy #0A1E33 Montserrat Bold,
sublinea slate #47617A, pill CTA amarillo #FEC14D con texto navy,
watermark "Hecho con Posta".

Uso: python3 demo_render.py SPEC_JSON OUT_DIR
  SPEC_JSON: {"fonts_dir": "/ruta/a/fonts", "posts": [
      {"photo": "/ruta/foto.webp", "pill": "NUEVO", "bar": "CAFE MARTINEZ",
       "headline": "EL MAS PEDIDO", "subline": "El plato que todos...",
       "cta": "Lo quiero probar", "watermark": "Hecho con Posta"}, ...]}
  Genera OUT_DIR/post-0.png, post-1.png, ...

Sin rutas hardcodeadas: todo llega por el spec. Sin emojis en los textos
(Montserrat no tiene glifos emoji).
"""
import sys
import os
import json

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


def photo_bg(photo_path, fade_start=0.38, fade_end=0.68):
    """Foto 1080x1350 full-bleed con fundido a blanco hacia abajo."""
    if not os.path.isfile(photo_path):
        raise FileNotFoundError("foto no encontrada: %s" % photo_path)
    p = Image.open(photo_path).convert("RGB")
    target = W / H
    pw, ph = p.size
    if pw / ph > target:
        nw = int(ph * target)
        x0 = (pw - nw) // 2
        p = p.crop((x0, 0, x0 + nw, ph))
    else:
        nh = int(pw / target)
        y0 = (ph - nh) // 2
        p = p.crop((0, y0, pw, y0 + nh))
    p = p.resize((W, H), Image.LANCZOS)
    p = grade_photo(p)
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
    img = Image.composite(Image.new("RGB", (W, H), WHITE), p, mask)
    return img, ImageDraw.Draw(img)


def pill_nuevo(d, fonts_dir, text, C, y=64):
    f = B(fonts_dir, 34)
    tracking = 6
    pad_x, pad_y = 34, 15
    w = tw(d, text, f, tracking) + pad_x * 2
    h = f.size + pad_y * 2
    x1 = W - MX
    d.rounded_rectangle([x1 - w, y, x1, y + h], radius=h // 2, fill=C["btn"])
    cx = x1 - w / 2
    cw = tw(d, text, f, tracking)
    ltext(d, cx - cw / 2, y + pad_y - 5, text, f, fill=C["btn_text"], tracking=tracking)


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


def cta_button(d, fonts_dir, y, text, C):
    f = B(fonts_dir, 44)
    while tw(d, text, f) > MAX_W - 128 and f.size > 22:
        f = B(fonts_dir, f.size - 2)
    pad_x = 64
    bh = 108
    w = tw(d, text, f) + pad_x * 2
    d.rounded_rectangle([MX, y, MX + w, y + bh], radius=bh // 2, fill=C["btn"])
    ltext(d, MX + pad_x, y + bh // 2 - f.size // 2 - 5, text, f, fill=C["btn_text"])
    return y + bh


def render_post(d, img, fonts_dir, p, hsize_start, C):
    # pill superior
    if p.get("pill"):
        pill_nuevo(d, fonts_dir, str(p["pill"]).upper(), C)

    y = 600
    y = celeste_bar(d, fonts_dir, y, str(p.get("bar", "")).upper(), C)
    y += 40

    # titular
    f, lines = wrap_fit(d, fonts_dir, p.get("headline", ""), MAX_W, hsize_start, 3)
    for ln in lines:
        y = ltext(d, MX, y, ln, f, C["headline"])
        y += int(f.size * 0.04)
    y += 22

    # sublinea
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

    # CTA
    y = cta_button(d, fonts_dir, y, p.get("cta", ""), C)

    # watermark discreto
    rtext(d, W - MX, H - 70, p.get("watermark", "Hecho con Posta"), R(fonts_dir, 30), fill=C["watermark"])
    return y


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
        img, d = photo_bg(p["photo"])
        bottom = None
        for hs in (150, 130, 112, 96):
            # re-render limpio en cada intento
            img, d = photo_bg(p["photo"])
            bottom = render_post(d, img, fonts_dir, p, hs, C)
            if bottom <= 1300:
                break
        out = os.path.join(outdir, "post-%d.png" % i)
        img.save(out)
        print("post-%d OK bottom=%d" % (i, bottom))

    print("DONE %d" % len(spec["posts"]))


if __name__ == "__main__":
    main()
