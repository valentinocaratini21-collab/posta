#!/usr/bin/env python3
"""Demo video — Posta.
Toma un diseño 1080x1350 (PNG) y genera un MP4 con zoom suave (Ken Burns)
listo para Reels. Los frames se renderizan con PIL y se envian por pipe a
ffmpeg (sin archivos intermedios). Uso: demo_video.py ENTRADA_PNG SALIDA_MP4 [segundos]
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
    n = max(1, int(secs * FPS))

    base = Image.open(src).convert("RGB")
    if base.size != (W, H):
        base = base.resize((W, H), Image.LANCZOS)

    ff = subprocess.Popen(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H),
            "-framerate", str(FPS), "-i", "-",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            out,
        ],
        stdin=subprocess.PIPE,
    )
    try:
        for i in range(n):
            t = i / max(1, n - 1)
            e = t * t * (3 - 2 * t)  # ease-in-out suave
            z = 1.0 + (ZOOM_END - 1.0) * e
            cw, ch = int(W / z), int(H / z)
            x0 = (W - cw) // 2
            y0 = int((H - ch) * 0.42)  # leve sesgo hacia arriba (la foto)
            frame = base.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.BILINEAR)
            ff.stdin.write(frame.tobytes())
    finally:
        try:
            ff.stdin.close()
        except Exception:
            pass
    rc = ff.wait()
    if rc != 0:
        print("ffmpeg fallo (rc=%d)" % rc, file=sys.stderr)
        sys.exit(1)
    print("VIDEO OK %s (%d frames)" % (out, n))


if __name__ == "__main__":
    main()
