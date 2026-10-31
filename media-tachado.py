#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Precio tachado animado (reel de oferta): 90 cuadros a 15 fps = 6 s,
# 1080x1920. La foto va arriba (entera, nunca cortada); la animación
# vive en la banda inferior, nunca sobre el producto:
#   0–2 s: solo el precio viejo.
#   2–3 s: la línea de tachado crece sobre el precio viejo.
#   3–6 s: el precio nuevo aparece (fade) y el viejo queda tachado.
# Uso: python3 media-tachado.py <foto> <frames-dir> <precio-viejo> <precio-nuevo>
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter


def font(size, bold=True):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size)
    except Exception:
        return ImageFont.load_default()


def main():
    if len(sys.argv) < 5:
        print("uso: media-tachado.py <foto> <frames-dir> <precio-viejo> <precio-nuevo>")
        return 2
    src, frames_dir, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    os.makedirs(frames_dir, exist_ok=True)
    W, H = 1080, 1920
    foto = Image.open(src).convert("RGB")
    # Foto entera en el área superior (1080x1300, contain + fondo difuminado).
    box_w, box_h = W, 1300
    scale = min(box_w / foto.size[0], box_h / foto.size[1])
    nw, nh = max(1, int(foto.size[0] * scale)), max(1, int(foto.size[1] * scale))
    fondo = foto.resize((W, H)).filter(ImageFilter.GaussianBlur(30))
    base = fondo.copy()
    thumb = foto.resize((nw, nh))
    base.paste(thumb, ((W - nw) // 2, (box_h - nh) // 2))
    f_viejo = font(96)
    f_nuevo = font(150)
    fps, total = 15, 90
    for i in range(total):
        t = i / fps
        im = base.copy()
        d = ImageDraw.Draw(im)
        # Banda inferior (debajo de la foto, nunca sobre ella).
        band_y0 = box_h + 40
        # Precio viejo, gris, centrado.
        wv = d.textlength(viejo, font=f_viejo)
        xv, yv = (W - wv) / 2, band_y0 + 30
        d.text((xv, yv), viejo, font=f_viejo, fill=(170, 170, 170))
        # Tachado: 2–3 s crece de izquierda a derecha.
        if t >= 2:
            prog = min(1.0, (t - 2) / 1.0)
            x1 = xv + wv * prog
            d.line([(xv, yv + 48), (x1, yv + 48)], fill=(255, 107, 107), width=8)
        # Precio nuevo: fade 3–4 s, fijo después.
        if t >= 3:
            alpha = int(255 * min(1.0, (t - 3) / 1.0))
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            dl = ImageDraw.Draw(layer)
            wn = dl.textlength(nuevo, font=f_nuevo)
            dl.text(((W - wn) / 2, band_y0 + 170), nuevo, font=f_nuevo, fill=(254, 193, 77, alpha))
            im = Image.alpha_composite(im.convert("RGBA"), layer).convert("RGB")
        im.save(os.path.join(frames_dir, "f%03d.jpg" % i), "JPEG", quality=90)
    return 0


if __name__ == "__main__":
    sys.exit(main())
