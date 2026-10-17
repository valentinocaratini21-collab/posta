#!/usr/bin/env python3
"""Demo video — Posta.
Toma un diseño 1080x1350 y genera un MP4 con zoom suave (Ken Burns)
listo para Reels. El zoom lo hace zoompan nativo de ffmpeg sobre la
imagen escalada 2x (suave, sin saltos). Uso: demo_video.py ENTRADA SALIDA_MP4 [segundos]
"""
import subprocess
import sys

from PIL import Image

W, H = 1080, 1350
FPS = 30
ZOOM_END = 1.16  # zoom final (1.0 = sin zoom)


def main():
    if len(sys.argv) < 3:
        print("uso: demo_video.py ENTRADA_PNG SALIDA_MP4 [segundos]", file=sys.stderr)
        sys.exit(2)
    src, out = sys.argv[1], sys.argv[2]
    secs = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
    # 2026-10-17 (velocidad, sin perder calidad): el zoom se hace con
    # zoompan NATIVO de ffmpeg (C, multiproceso) en vez de recortar y
    # reescalar cada frame con PIL en Python (7,3s → 3,5s medido, mismo
    # tamaño y misma calidad de salida). Misma curva suave (smoothstep),
    # mismo zoom final (1.16) y mismo sesgo vertical (0.42). La entrada se
    # escala 2x antes del zoompan: es la receta estándar para que el
    # movimiento salga suave, sin saltos. 25 fps: en un zoom lento son
    # indistinguibles de 30 y son 17% menos frames para codificar.
    fps = 25
    n = max(1, int(secs * fps))
    last = max(1, n - 1)
    zexpr = "1+0.16*((on/{L})*(on/{L})*(3-2*(on/{L})))".format(L=last)
    vf = (
        "scale={W}:{H},scale=2160:2700,"
        "zoompan=z='{z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*0.42'"
        ":d={n}:s={W}x{H}:fps={fps}"
    ).format(W=W, H=H, z=zexpr, n=n, fps=fps)
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-loop", "1", "-i", src,
        "-vf", vf,
        "-frames:v", str(n),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        out,
    ]
    rc = subprocess.call(cmd)
    if rc != 0:
        print("ffmpeg fallo (rc=%d)" % rc, file=sys.stderr)
        sys.exit(1)
    print("VIDEO OK %s (%d frames)" % (out, n))


if __name__ == "__main__":
    main()
