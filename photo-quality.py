#!/usr/bin/env python3
"""photo-quality.py — medición DETERMINÍSTICA de calidad de una foto del
cliente (v237, gate de calidad al subir). Sin IA: luminancia media,
varianza de bordes (proxy de nitidez/blur) y resolución útil, con PIL.

Uso: python3 photo-quality.py <path>
Salida (stdout, una línea JSON): {"w":…, "h":…, "lum":…, "edge":…}
  w,h  — dimensiones reales en píxeles.
  lum  — luminancia media (0–255) sobre una copia ≤256px.
  edge — desvío estándar del mapa de bordes (FIND_EDGES) sobre la misma
         copia: una foto nítida típica da >10; una movida/sin detalle
         cae por debajo de ~5. Es un proxy conservador, no un veredicto:
         el gate lo combina con la clasificación por visión.
Ante cualquier error imprime {"error": "…"} y sale con código 0: medir
nunca debe romper la subida ni la generación.
"""
import json
import sys

try:
    from PIL import Image, ImageFilter, ImageStat

    im = Image.open(sys.argv[1])
    im.load()
    w, h = im.size
    g = im.convert("L")
    small = g.copy()
    small.thumbnail((256, 256))
    lum = ImageStat.Stat(small).mean[0]
    edge = ImageStat.Stat(small.filter(ImageFilter.FIND_EDGES)).stddev[0]
    print(json.dumps({"w": w, "h": h, "lum": round(lum, 1), "edge": round(edge, 2)}))
except Exception as e:  # noqa: BLE001 — medir nunca bloquea
    print(json.dumps({"error": str(e)[:120]}))
