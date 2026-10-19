#!/usr/bin/env python3
# brand-card.py — Tarjeta de marca de respaldo (fallback nivel 2 de ensurePostImage).
# Renderiza un PNG 1080x1350 con PIL: fondo color de marca (o foto del cliente
# con overlay oscuro), titular centrado y logo abajo-derecha si existe.
# (v205: el nombre del negocio ya NO se imprime en la pieza.)
# Nunca crashea por assets faltantes: los ignora.
# Uso: python3 brand-card.py --headline "..." --bg "#0A1E33" --text "#FFFFFF"
#        --business "Mi Negocio" --logo /path/logo.png --photo /path/foto.jpg --out /path/salida.png
import argparse
import sys


def hexcolor(h, default):
    try:
        h = str(h or '').strip().lstrip('#')
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except Exception:
        return default


def load_font(bold, size):
    import os
    from PIL import ImageFont
    fdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
    names = (['Montserrat-800.ttf', 'Montserrat-700.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans.ttf']
             if bold else
             ['Montserrat-600.ttf', 'Montserrat-700.ttf', 'DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'])
    for name in names:
        for cand in (os.path.join(fdir, name), name):
            try:
                return ImageFont.truetype(cand, size)
            except Exception:
                continue
    return ImageFont.load_default()


def wrap(draw, text, font, max_w):
    words = str(text or '').split()
    lines, cur = [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines[:8]


# ---------------------------------------------------------------------------
# BANDAS DE HISTORIA (v231, 2026-10-18): en modo story el texto JAMÁS va en
# el centro de la pieza (orden de Valentino tras la gemela que le pegó el
# caption entero sobre los ojos a la mascota): va en la banda superior o
# inferior. Con --band auto se analiza el lienzo YA compuesto (misma idea
# que analyze_photo en demo_render.py, espejada acá en chico porque este
# renderer es otro): grilla de detalle (qué banda está más cargada) +
# heurística de piel (una banda que pisa una cara probable queda prohibida
# si la otra está libre). Márgenes seguros de IG: arriba se despeja la UI
# del perfil (~280px) y abajo la caja de respuesta (~380px).
# ---------------------------------------------------------------------------
BAND_TOP_Y = 300
BAND_BOTTOM_MARGIN = 380


def _story_analysis(img):
    """(grid 90x160 de detalle 0..1 | None, cajas de piel en coords del lienzo)."""
    try:
        import numpy as np
    except Exception:
        return None, []
    W, H = img.size
    try:
        small = img.resize((270, 480))
        a = np.asarray(small.convert('L')).astype(np.float32) / 255.0
        g = np.zeros_like(a)
        g[:, :-1] += np.abs(np.diff(a, axis=1))
        g[:-1, :] += np.abs(np.diff(a, axis=0))
        grid = np.clip(g[:480, :270].reshape(160, 3, 90, 3).mean(axis=(1, 3)) / 0.16, 0.0, 1.0)
    except Exception:
        grid = None
    boxes = []
    try:
        from collections import deque
        rgb = np.asarray(small).astype(np.int16)
        R, G, B = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
        skin = (R > 90) & (G > 35) & (B > 18) & ((R - G) > 8) & ((R - B) > 14)
        skin |= (R > 60) & (G > 28) & (B > 12) & (R >= G) & ((R - B) > 9) & ((R - G) > 3)
        m = skin[:480, :270].reshape(160, 3, 90, 3).mean(axis=(1, 3)) >= 0.5
        seen = np.zeros(m.shape, dtype=bool)
        for gy in range(160):
            for gx in range(90):
                if not m[gy, gx] or seen[gy, gx]:
                    continue
                q = deque([(gy, gx)])
                seen[gy, gx] = True
                cells = []
                while q:
                    cy, cx = q.popleft()
                    cells.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < 160 and 0 <= nx < 90 and m[ny, nx] and not seen[ny, nx]:
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
                # Filtros de cara (los mismos de demo_render): compacta, de
                # tamaño acotado, no pegada al fondo del encuadre.
                wf = bw * 12.0 / W
                hf = bh * 12.0 / H
                if wf < 0.07 or wf > 0.42 or hf < 0.06 or hf > 0.40:
                    continue
                if (min(ys) + max(ys)) / 2.0 * 12.0 / H > 0.72:
                    continue
                asp = bw / float(bh)
                if asp < 0.5 or asp > 1.9:
                    continue
                if area < 0.5 * bw * bh:
                    continue
                boxes.append((min(xs) * 12 - 12, min(ys) * 12 - 12,
                              (max(xs) + 1) * 12 + 12, (max(ys) + 1) * 12 + 12))
    except Exception:
        boxes = []
    return grid, boxes


def _band_busy(grid, rect):
    if grid is None:
        return 0.0
    x0, y0, x1, y1 = rect
    cx0 = max(0, int(x0 / 12))
    cx1 = min(90, int(x1 / 12) + 1)
    cy0 = max(0, int(y0 / 12))
    cy1 = min(160, int(y1 / 12) + 1)
    if cx1 <= cx0 or cy1 <= cy0:
        return 0.0
    sub = grid[cy0:cy1, cx0:cx1]
    return float(0.65 * (sub > 0.45).mean() + 0.35 * sub.mean())


def _band_hits_skin(boxes, rect):
    x0, y0, x1, y1 = rect
    for (fx0, fy0, fx1, fy1) in boxes:
        if fx0 < x1 and fx1 > x0 and fy0 < y1 and fy1 > y0:
            return True
    return False


def choose_story_band(img, total_h):
    """Elige 'top'|'bottom' para un bloque de total_h px en un lienzo story."""
    W, H = img.size
    rects = {
        'top': (90, BAND_TOP_Y, W - 90, BAND_TOP_Y + total_h),
        'bottom': (90, H - BAND_BOTTOM_MARGIN - total_h, W - 90, H - BAND_BOTTOM_MARGIN),
    }
    grid, boxes = _story_analysis(img)
    hit = {z: _band_hits_skin(boxes, r) for z, r in rects.items()}
    if hit['top'] and not hit['bottom']:
        return 'bottom'
    if hit['bottom'] and not hit['top']:
        return 'top'
    busy = {z: _band_busy(grid, r) for z, r in rects.items()}
    if busy['bottom'] <= busy['top']:
        return 'bottom'
    return 'top'


def main():
    from PIL import Image, ImageDraw, ImageFilter
    ap = argparse.ArgumentParser()
    ap.add_argument('--headline', default='')
    ap.add_argument('--bg', default='#0A1E33')
    ap.add_argument('--text', default='#FFFFFF')
    ap.add_argument('--business', default='')
    ap.add_argument('--logo', default='')
    ap.add_argument('--photo', default='')
    ap.add_argument('--out', required=True)
    ap.add_argument('--w', type=int, default=1080)
    ap.add_argument('--h', type=int, default=1350)
    ap.add_argument('--mode', default='card')  # card | story (1080x1920, respeta safe areas de IG)
    ap.add_argument('--sub', default='')  # subtítulo/línea secundaria (modo story)
    ap.add_argument('--band', default='')  # story: top|bottom|auto = banda del bloque (vacío = centrado heredado)
    a = ap.parse_args()

    W, H = a.w, a.h
    story_mode = (a.mode == 'story')
    bg = hexcolor(a.bg, (10, 30, 51))
    fg = hexcolor(a.text, (255, 255, 255))
    img = Image.new('RGB', (W, H), bg)

    # Foto del cliente como fondo (cover) con overlay oscuro para legibilidad.
    if a.photo:
        try:
            ph = Image.open(a.photo).convert('RGB')
            scale = max(W / ph.width, H / ph.height)
            ph = ph.resize((int(ph.width * scale) + 1, int(ph.height * scale) + 1), Image.LANCZOS)
            x = (ph.width - W) // 2
            y = (ph.height - H) // 2
            img.paste(ph.crop((x, y, x + W, y + H)), (0, 0))
            overlay = Image.new('RGBA', (W, H), (0, 0, 0, 150))
            img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
        except Exception as e:
            print('brand-card: foto ignorada:', e, file=sys.stderr)

    d = ImageDraw.Draw(img)
    margin = 90

    # (v205) El nombre del negocio NO se imprime en la pieza (orden de
    # Valentino, 2026-10-18): vive en el caption y en la UI, no como
    # rótulo en la imagen. El arg --business se sigue aceptando por
    # compatibilidad con los llamadores, pero ya no se dibuja.

    # Titular centrado horizontal, auto-shrink hasta que entre. Vertical:
    # heredado = centrado; modo story con --band = anclado a la banda
    # superior o inferior (v231: palabras en el medio, nunca más).
    headline = str(a.headline or '').strip()
    sub = str(a.sub or '').strip()
    center_y = int(H * 0.42) if story_mode else H // 2
    band_req = str(a.band or '').strip().lower() if story_mode else ''
    if headline:
        size = 104
        lines = []
        while size >= 44:
            f = load_font(True, size)
            lines = wrap(d, headline, f, W - margin * 2)
            # medir alto total
            hs = [d.textbbox((0, 0), ln, font=f)[3] for ln in lines]
            total_h = sum(hs) + (len(lines) - 1) * int(size * 0.25)
            if total_h <= H * (0.42 if story_mode else 0.55):
                break
            size -= 8
        f = load_font(True, max(size, 44))
        line_h = int(size * 0.25)
        total = sum(d.textbbox((0, 0), ln, font=f)[3] for ln in lines) + (len(lines) - 1) * line_h
        # Subtítulo (modo story): se mide ANTES de anclar para que el bloque
        # entero (titular + sub) viva dentro de la banda elegida.
        sub_lines = []
        f_sub = None
        sub_h = 0
        if sub and story_mode:
            f_sub = load_font(True, 56)
            sub_lines = wrap(d, sub, f_sub, W - margin * 2)[:3]
            if sub_lines:
                sub_h = 30 + sum(d.textbbox((0, 0), ln, font=f_sub)[3] for ln in sub_lines) + (len(sub_lines) - 1) * 14
        block_total = total + sub_h
        if band_req in ('top', 'bottom', 'auto'):
            chosen = choose_story_band(img, block_total) if band_req == 'auto' else band_req
            y = BAND_TOP_Y if chosen == 'top' else H - BAND_BOTTOM_MARGIN - block_total
            print('band=' + chosen)
        else:
            y = center_y - total // 2
        for ln in lines:
            d.text((W // 2, y), ln, font=f, fill=fg, anchor='ma')
            y += d.textbbox((0, 0), ln, font=f)[3] + line_h
        # Subtítulo debajo del titular (modo story).
        if sub_lines:
            y += 30
            for ln in sub_lines:
                d.text((W // 2, y), ln, font=f_sub, fill=fg, anchor='ma')
                y += d.textbbox((0, 0), ln, font=f_sub)[3] + 14

    # Logo abajo-derecha (máx 220px), con máscara si tiene alpha.
    if a.logo:
        try:
            lg = Image.open(a.logo).convert('RGBA')
            lg.thumbnail((220, 220), Image.LANCZOS)
            img.paste(lg, (W - lg.width - 70, H - lg.height - 70), lg)
        except Exception as e:
            print('brand-card: logo ignorado:', e, file=sys.stderr)

    if a.out.lower().endswith('.jpg'):
        img.convert('RGB').save(a.out, 'JPEG', quality=90, optimize=True)
    else:
        img.save(a.out, 'PNG')
    print('ok', a.out)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('brand-card error:', e, file=sys.stderr)
        sys.exit(1)
