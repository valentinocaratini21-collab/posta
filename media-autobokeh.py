#!/usr/bin/env python3
# media-autobokeh.py — Segmentación AUTOMÁTICA del fondo para bokeh.
# Uso: python3 media-autobokeh.py <foto> <salida> [radio]
# Solo PIL + stdlib (sin modelos, sin numpy, sin red): el fondo se estima
# desde los bordes; si el fondo no es suficientemente uniforme o la máscara
# no valida, REHÚSA (exit 2, motivo en stderr) y la foto queda intacta.
# Nunca se difumina a ciegas y nunca se toca el producto: la salida es
# propuesta (el acepto vive en el servidor), y el interior de la máscara
# conserva los píxeles originales exactos.
import sys
from PIL import Image, ImageFilter

MAX_ANALYSIS = 240  # lado mayor del análisis (rápido, suficiente)


def median(vals):
    s = sorted(vals)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def border_colors(px, w, h):
    """Muestrea los bordes (con 2px de margen para evitar artefactos JPEG)."""
    cols = []
    for x in range(2, w - 2):
        cols.append(px[x, 2])
        cols.append(px[x, h - 3])
    for y in range(2, h - 2):
        cols.append(px[2, y])
        cols.append(px[w - 3, y])
    return cols


def main():
    if len(sys.argv) < 3:
        print('uso: media-autobokeh.py <foto> <salida> [radio]', file=sys.stderr)
        return 1
    src, dst = sys.argv[1], sys.argv[2]
    radius = float(sys.argv[3]) if len(sys.argv) > 3 else 25
    im = Image.open(src).convert('RGB')
    w, h = im.size
    # --- análisis en pequeño ---
    scale = min(1.0, MAX_ANALYSIS / max(w, h))
    aw, ah = max(8, int(w * scale)), max(8, int(h * scale))
    small = im.resize((aw, ah), Image.LANCZOS)
    px = small.load()
    cols = border_colors(px, aw, ah)
    bg = tuple(median([c[i] for c in cols]) for i in range(3))
    # Uniformidad del fondo: distancia media de los bordes a la mediana.
    dists = sorted(sum(abs(c[i] - bg[i]) for i in range(3)) for c in cols)
    spread = dists[int(len(dists) * 0.9)]  # percentil 90
    if spread > 60:
        print('rehusado: fondo no uniforme (spread %d)' % spread, file=sys.stderr)
        return 2
    # Umbral adaptativo: por encima del ruido del fondo, por debajo del sujeto.
    thr = max(48, spread * 2 + 18)
    # --- máscara por distancia al fondo ---
    mask = [[0] * aw for _ in range(ah)]
    for y in range(ah):
        for x in range(aw):
            c = px[x, y]
            d = sum(abs(c[i] - bg[i]) for i in range(3))
            mask[y][x] = 1 if d > thr else 0
    # --- componente conexa mayor que toque el centro ---
    seen = [[False] * aw for _ in range(ah)]
    cx0, cy0, cx1, cy1 = aw // 4, ah // 4, (aw * 3) // 4, (ah * 3) // 4
    best = []
    for y in range(ah):
        for x in range(aw):
            if mask[y][x] and not seen[y][x]:
                comp = []
                stack = [(x, y)]
                seen[y][x] = True
                while stack:
                    cx, cy = stack.pop()
                    comp.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < aw and 0 <= ny < ah and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                if len(comp) > len(best):
                    best = comp
    total = aw * ah
    frac = len(best) / total if total else 0
    if frac < 0.05 or frac > 0.85:
        print('rehusado: sujeto %.1f%% fuera de rango 5-85%%' % (frac * 100), file=sys.stderr)
        return 2
    touches_center = any(cx0 <= x < cx1 and cy0 <= y < cy1 for x, y in best)
    if not touches_center:
        print('rehusado: el sujeto no toca el centro', file=sys.stderr)
        return 2
    # --- máscara final a tamaño real + feather + composite ---
    mimg = Image.new('L', (aw, ah), 0)
    mp = mimg.load()
    for x, y in best:
        mp[x, y] = 255
    mimg = mimg.resize((w, h), Image.BICUBIC)
    feather = max(2, int(min(w, h) / 120))
    mimg = mimg.filter(ImageFilter.GaussianBlur(feather))
    blurred = im.filter(ImageFilter.GaussianBlur(radius))
    out = Image.composite(im, blurred, mimg)
    out.save(dst, quality=92)
    print('ok autobokeh %dx%d sujeto %.1f%% fondo %s spread %d thr %d' % (w, h, frac * 100, tuple(int(v) for v in bg), spread, thr))
    return 0


if __name__ == '__main__':
    sys.exit(main())
