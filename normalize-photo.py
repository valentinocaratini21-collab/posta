#!/usr/bin/env python3
"""normalize-photo.py — Normalización DETERMINÍSTICA de la foto del cliente
(Gap 3 de la auditoría de material del cliente, 2026-10-25).

La foto que cae al fallback de fidelidad ES la foto cruda del cliente:
sin este paso salía publicada en su aspecto nativo (16:9, 1:1, el que
traiga) y sin ningún pulido — Instagram la recortaba a 4:5 como quería.
Este script garantiza, haya o no titular en la pieza:

  1. Orientación EXIF aplicada (la foto sale derecha).
  2. Encuadre 4:5 EXACTO (1080×1350) con foco: el recorte se centra en
     el foco medido (centroide de energía de bordes, determinístico,
     sin IA) o en el foco que pase el llamador (--focus-x/--focus-y).
  3. El MISMO grade del composite de titulares (blend 5% hacia el hex
     de marca + saturación ×1,04) cuando llega --grade.

Uso: python3 normalize-photo.py --in foto.jpg --out foto.jpg [--grade #2793C8]
     [--focus-x 0.42] [--focus-y 0.5]
Salida: una línea JSON {w,h,focus_x,focus_y,src_w,src_h}. Ante error,
{"error": "…"} y código 1: el llamador sigue con la foto como estaba —
normalizar nunca puede costar una pieza.
"""
import argparse
import json
import sys


def measure_focus(img):
    """Centroide de la energía de bordes sobre una copia chica. Una zona
    con detalle (el sujeto) pesa más que un fondo liso. Sin detalle
    medible → centro. Determinístico: misma foto, mismo foco."""
    from PIL import ImageFilter
    small = img.convert('L')
    small.thumbnail((320, 320))
    edges = small.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(radius=2))
    w, h = edges.size
    px = edges.load()
    total = 0.0
    sx = 0.0
    sy = 0.0
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            if v:
                total += v
                sx += v * x
                sy += v * y
    if total <= 0:
        return 0.5, 0.5
    fx = (sx / total) / max(w - 1, 1)
    fy = (sy / total) / max(h - 1, 1)
    # Clamp conservador: el foco guía el recorte, no lo manda al borde.
    fx = min(0.75, max(0.25, fx))
    fy = min(0.75, max(0.25, fy))
    return round(fx, 3), round(fy, 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--grade', default='')
    ap.add_argument('--focus-x', type=float, default=-1)
    ap.add_argument('--focus-y', type=float, default=-1)
    a = ap.parse_args()
    try:
        from PIL import Image, ImageColor, ImageEnhance, ImageOps
        img = Image.open(a.inp)
        img = ImageOps.exif_transpose(img)
        if img.mode in ('RGBA', 'LA', 'P'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img.convert('RGBA'), mask=img.convert('RGBA').split()[-1])
            img = bg
        else:
            img = img.convert('RGB')
        src_w, src_h = img.size
        fx = a.focus_x if 0 <= a.focus_x <= 1 else None
        fy = a.focus_y if 0 <= a.focus_y <= 1 else None
        if fx is None or fy is None:
            mfx, mfy = measure_focus(img)
            if fx is None:
                fx = mfx
            if fy is None:
                fy = mfy
        # Recorte 4:5 (w/h = 0,8) alrededor del foco.
        target = 0.8
        W, H = img.size
        if W / H > target:
            cw = int(H * target)
            ch = H
            cx = int(fx * W - cw / 2)
            cx = max(0, min(W - cw, cx))
            box = (cx, 0, cx + cw, ch)
        else:
            cw = W
            ch = int(W / target)
            cy = int(fy * H - ch / 2)
            cy = max(0, min(H - ch, cy))
            box = (0, cy, cw, cy + ch)
        img = img.crop(box).resize((1080, 1350), Image.LANCZOS)
        if a.grade:
            try:
                tint = Image.new('RGB', img.size, ImageColor.getrgb(a.grade))
                img = Image.blend(img, tint, 0.05)
                img = ImageEnhance.Color(img).enhance(1.04)
            except Exception:
                pass
        img.save(a.out, 'JPEG', quality=90)
        # Variantes livianas de la pieza final, como hace el composite.
        try:
            base = a.out.rsplit('.', 1)[0]
            for wdt, q, suf in ((640, 78, '@640.webp'), (24, 60, '@24.webp')):
                img.resize((wdt, max(1, round(img.height * wdt / img.width))), Image.LANCZOS).save(base + suf, 'WEBP', quality=q)
        except Exception:
            pass
        print(json.dumps({'w': 1080, 'h': 1350, 'focus_x': fx, 'focus_y': fy, 'src_w': src_w, 'src_h': src_h}))
    except Exception as e:  # noqa: BLE001 — normalizar nunca rompe la pieza
        print(json.dumps({'error': str(e)[:160]}))
        sys.exit(1)


if __name__ == '__main__':
    main()
