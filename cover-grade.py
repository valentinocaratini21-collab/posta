#!/usr/bin/env python3
"""Grado tonal de UNA portada (v332, dirección de feed): lleva la luminancia
media de la imagen a la banda de la familia asignada por la composición,
desaturando parcialmente y — si el objetivo es oscuro — tiñendo apenas
hacia el azul profundo. Se aplica SOLO al archivo de portada: el video y la
foto original jamás se tocan.

Uso: cover-grade.py <entrada> <salida> <lum_objetivo 0..1> [tinta: navy|none]
Imprime una línea JSON: {"ok": true, "lumBefore": x, "lumAfter": y}.
Determinístico, local, USD 0 (misma noción de luminancia que grid-stats.py).
"""
import json
import sys

from PIL import Image, ImageEnhance


def mean_lum(im):
    gray = im.convert("L")
    px = list(gray.getdata())
    return (sum(px) / len(px) / 255.0) if px else 0.0


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"ok": False, "error": "args"}))
        return
    src, out = sys.argv[1], sys.argv[2]
    try:
        target = float(sys.argv[3])
    except Exception:
        print(json.dumps({"ok": False, "error": "target"}))
        return
    tint = sys.argv[4] if len(sys.argv) > 4 else "none"
    target = min(0.85, max(0.15, target))
    try:
        im = Image.open(src).convert("RGB")
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return
    before = mean_lum(im)
    # Desaturación parcial: el grado "de la casa" calma el color antes de
    # mover la luz (así una portada cálida deja de gritar sin volverse gris).
    im = ImageEnhance.Color(im).enhance(0.55)
    # Dos pasadas de corrección de brillo hacia el objetivo.
    for _ in range(2):
        cur = mean_lum(im)
        if cur <= 0.01:
            break
        factor = target / cur
        factor = min(1.7, max(0.35, factor))
        if abs(factor - 1.0) < 0.03:
            break
        im = ImageEnhance.Brightness(im).enhance(factor)
    if tint == "navy" and target <= 0.45:
        navy = Image.new("RGB", im.size, (10, 30, 51))
        im = Image.blend(im, navy, 0.16)
    after = mean_lum(im)
    im.save(out, "JPEG", quality=88)
    print(json.dumps({"ok": True, "lumBefore": round(before, 4), "lumAfter": round(after, 4)}))


main()
