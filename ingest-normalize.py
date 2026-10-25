#!/usr/bin/env python3
"""ingest-normalize.py — Normalización de TODA foto que entra a Posty
(Gap 10 de la auditoría de material del cliente, 2026-10-25).

Hasta hoy la extensión se derivaba del content-type y todo lo que no era
jpeg/webp se guardaba como `.png`: un HEIC de iPhone (el dispositivo
principal de los clientes) quedaba mal rotulado y sin transcodificar, y
ningún paso aplicaba la orientación EXIF (una foto vertical salía
acostada en cualquier superficie que no leyera el EXIF).

Este paso corre UNA sola vez, en la ingesta:
  - PIL abre la foto → orientación EXIF aplicada → JPEG (q92).
  - Si PIL no puede abrirla (HEIC sin pillow-heif es el caso típico),
    se intenta ffmpeg (trae decodificador HEVC y demuxer HEIF).
  - Si nada puede, {"error": …} y código 1: el llamador guarda los
    bytes originales con la regla histórica — la subida nunca se pierde
    por la normalización.

Uso: python3 ingest-normalize.py --in crudo.bin --out final.jpg
Salida: una línea JSON {"ok":true,"via":"pil"|"ffmpeg","w":…,"h":…}.
"""
import argparse
import json
import subprocess
import sys


def via_pil(inp, out):
    from PIL import Image, ImageOps
    img = Image.open(inp)
    img.load()
    img = ImageOps.exif_transpose(img)
    if img.mode in ('RGBA', 'LA', 'P'):
        rgba = img.convert('RGBA')
        bg = Image.new('RGB', rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        img = bg
    else:
        img = img.convert('RGB')
    img.save(out, 'JPEG', quality=92)
    return img.size


def via_ffmpeg(inp, out):
    r = subprocess.run(
        ['ffmpeg', '-y', '-v', 'error', '-i', inp, '-frames:v', '1', '-q:v', '3', out],
        capture_output=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or b'').decode('utf-8', 'replace')[:140] or 'ffmpeg falló')
    from PIL import Image
    img = Image.open(out)
    img.load()
    return img.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    errors = []
    for name, fn in (('pil', via_pil), ('ffmpeg', via_ffmpeg)):
        try:
            w, h = fn(a.inp, a.out)
            print(json.dumps({'ok': True, 'via': name, 'w': w, 'h': h}))
            return
        except Exception as e:  # noqa: BLE001 — se prueba la otra vía
            errors.append(f'{name}: {str(e)[:100]}')
    print(json.dumps({'error': ' | '.join(errors)}))
    sys.exit(1)


if __name__ == '__main__':
    main()
