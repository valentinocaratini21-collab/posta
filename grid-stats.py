#!/usr/bin/env python3
"""Estadísticas tonales determinísticas de imágenes para el EQUILIBRIO DE
GRILLA (v224): por cada imagen imprime una línea JSON con
  lum     luminancia media 0..1 (canal L de PIL, ITU-R 601-2 — la misma
          noción claro/oscuro que usa feed-luminance.py)
  sat     saturación media 0..1 (canal S de HSV)
  hueFam  familia de tono dominante entre los píxeles con color real
          (saturación y brillo suficientes): rojo | naranja | amarillo |
          verde | celeste | azul | violeta | rosa | neutro
Uso: grid-stats.py <img1> [img2 ...]  ->  una línea JSON por imagen, EN EL
MISMO ORDEN que la entrada. Si una imagen no se puede leer, su línea es
{"ok": false} (el llamador la salta). Costo: cero IA, todo local.
"""
import json
import sys

from PIL import Image

SECTORS = [
    (15, "rojo"), (45, "naranja"), (70, "amarillo"), (160, "verde"),
    (200, "celeste"), (255, "azul"), (290, "violeta"), (345, "rosa"),
    (361, "rojo"),
]


def family_of(deg):
    for limit, name in SECTORS:
        if deg < limit:
            return name
    return "rojo"


def stats_for(path):
    try:
        im = Image.open(path)
    except Exception:
        return {"ok": False}
    try:
        rgb = im.convert("RGB")
        rgb.thumbnail((96, 96))
        gray = rgb.convert("L")
        px = list(gray.getdata())
        if not px:
            return {"ok": False}
        lum = sum(px) / len(px) / 255.0
        hsv = rgb.convert("HSV")
        hp, sp, _vp = hsv.split()
        hdata = list(hp.getdata())
        sdata = list(sp.getdata())
        sat = sum(sdata) / len(sdata) / 255.0
        # Tono dominante: sectores de matiz ponderados por saturación, solo
        # píxeles con color real (los grises y los bordes apagados no votan).
        weights = {}
        sat_weight = 0.0
        for h, s in zip(hdata, sdata):
            if s < 60:
                continue
            deg = h * 360.0 / 255.0
            fam = family_of(deg)
            w = s / 255.0
            weights[fam] = weights.get(fam, 0.0) + w
            sat_weight += w
        total = max(1, len(hdata))
        if sat_weight / total < 0.08:
            fam = "neutro"
            share = 0.0
        else:
            fam = max(weights, key=weights.get)
            share = weights[fam] / sat_weight
        return {
            "ok": True,
            "lum": round(lum, 4),
            "sat": round(sat, 4),
            "hueFam": fam,
            "hueShare": round(share, 3),
        }
    except Exception:
        return {"ok": False}


def main():
    for path in sys.argv[1:]:
        print(json.dumps(stats_for(path)))


main()
