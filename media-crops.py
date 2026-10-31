#!/usr/bin/env python3
"""media-crops.py — variantes por formato de UNA foto del cliente.

Uso: python3 media-crops.py <entrada> <salida-dir> [caja-sujeto-json]
  caja-sujeto-json: {"x":..,"y":..,"w":..,"h":..} en píxeles de la
  foto original, o ausente.

Produce SIEMPRE las 3 variantes 'pad' (feed 4:5, historia 9:16,
portada 1:1): la foto entera cabe con fondo difuminado — CERO corte,
el producto nunca se corta. Además, si hay caja de sujeto y queda
entera dentro del recorte centrado (2% de margen), produce la variante
'crop' de cada formato; si no, ese crop se REPORTA como no hecho
(reason: sin-caja-sujeto | sujeto-fuera-recorte), nunca se corta a
ciegas. Salida: una línea JSON con {formats: [...]}.
Falla (código 1) solo si la entrada no se puede leer.
"""
import json
import os
import sys

try:
    from PIL import Image, ImageFilter
except Exception as e:  # noqa: BLE001
    print(json.dumps({"error": "sin-PIL: " + str(e)[:100]}))
    sys.exit(1)

FORMATS = [("feed", 1080, 1350), ("historia", 1080, 1920), ("portada", 1080, 1080)]


def pad_variant(im, tw, th):
    """Foto entera centrada sobre fondo difuminado de sí misma."""
    bg = im.copy()
    # Fondo: cubrir el lienzo y difuminar fuerte.
    scale = max(tw / im.width, th / im.height)
    bg = bg.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))))
    x0 = (bg.width - tw) // 2
    y0 = (bg.height - th) // 2
    bg = bg.crop((x0, y0, x0 + tw, y0 + th)).filter(ImageFilter.GaussianBlur(24))
    # Frente: la foto entera quepa sin cortar.
    scale2 = min(tw / im.width, th / im.height)
    fg = im.resize((max(1, round(im.width * scale2)), max(1, round(im.height * scale2))))
    out = bg.copy()
    out.paste(fg, ((tw - fg.width) // 2, (th - fg.height) // 2))
    return out


def crop_rect(src_w, src_h, tw, th):
    target = tw / th
    src = src_w / src_h
    if abs(src - target) < 0.005:
        return (0, 0, src_w, src_h)
    if src > target:
        ch, cw = src_h, round(src_h * target)
        return ((src_w - cw) // 2, 0, cw, ch)
    cw, ch = src_w, round(src_w / target)
    return (0, (src_h - ch) // 2, cw, ch)


def box_inside(box, rect, m=0.02):
    cx, cy, cw, ch = rect
    return (box["x"] >= cx + cw * m and box["y"] >= cy + ch * m
            and box["x"] + box["w"] <= cx + cw - cw * m
            and box["y"] + box["h"] <= cy + ch - ch * m)


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "uso: media-crops.py <entrada> <salida-dir> [caja-json]"}))
        return 1
    src, outdir = sys.argv[1], sys.argv[2]
    box = None
    if len(sys.argv) >= 4 and sys.argv[3]:
        try:
            box = json.loads(sys.argv[3])
        except Exception:
            box = None
    try:
        im = Image.open(src)
        im.load()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": str(e)[:120]}))
        return 1
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    os.makedirs(outdir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(src))[0]
    out = {"formats": []}
    for key, tw, th in FORMATS:
        pad = pad_variant(im, tw, th)
        pad_name = f"{stem}-{key}-pad.jpg"
        pad.save(os.path.join(outdir, pad_name), "JPEG", quality=90)
        entry = {"format": key, "w": tw, "h": th, "pad": pad_name, "crop": None, "crop_reason": None}
        rect = crop_rect(im.width, im.height, tw, th)
        if box is None:
            entry["crop_reason"] = "sin-caja-sujeto"
        elif not box_inside(box, rect):
            entry["crop_reason"] = "sujeto-fuera-recorte"
        else:
            cx, cy, cw, ch = rect
            crop = im.crop((cx, cy, cx + cw, cy + ch)).resize((tw, th))
            crop_name = f"{stem}-{key}-crop.jpg"
            crop.save(os.path.join(outdir, crop_name), "JPEG", quality=90)
            entry["crop"] = crop_name
        out["formats"].append(entry)
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
