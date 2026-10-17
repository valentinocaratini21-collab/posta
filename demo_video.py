#!/usr/bin/env python3
"""Demo video — Posta.
Dos modos:
  1) Clásico: demo_video.py ENTRADA SALIDA_MP4 [segundos]
     Un diseño 1080x1350 con zoom suave (Ken Burns) listo para Reels.
  2) Tour (v182): demo_video.py --tour SALIDA_MP4 SEG_POR_PIEZA IMG1 IMG2 ...
     Recorre TODOS los diseños de la semana con cortes cortos y zooms
     alternados (entra/sale): se lee como un reel, no como una tarjeta
     estática animada.
El zoom lo hace zoompan nativo de ffmpeg sobre la imagen escalada 2x
(suave, sin saltos), con la misma curva smoothstep de siempre.
"""
import subprocess
import sys

W, H = 1080, 1350
FPS = 25
ZOOM_END = 1.16  # zoom final del modo clásico (1.0 = sin zoom)


def smooth_expr(last, z_from, z_to):
    t = "((on/{L})*(on/{L})*(3-2*(on/{L})))".format(L=last)
    return "{A}+{D}*{T}".format(A=z_from, D=round(z_to - z_from, 4), T=t)


def zoompan(zexpr, n):
    return (
        "scale={W}:{H},scale=2160:2700,"
        "zoompan=z='{z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*0.42'"
        ":d={n}:s={W}x{H}:fps={fps}"
    ).format(W=W, H=H, z=zexpr, n=n, fps=FPS)


def run(cmd):
    rc = subprocess.call(cmd)
    if rc != 0:
        print("ffmpeg fallo (rc=%d)" % rc, file=sys.stderr)
        sys.exit(1)


def classic(src, out, secs):
    n = max(1, int(secs * FPS))
    last = max(1, n - 1)
    vf = zoompan(smooth_expr(last, 1.0, ZOOM_END), n)
    run([
        "ffmpeg", "-y", "-v", "error",
        "-loop", "1", "-i", src,
        "-vf", vf,
        "-frames:v", str(n),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        out,
    ])
    print("VIDEO OK %s (%d frames)" % (out, n))


def tour(out, seg_secs, images):
    frames = max(8, int(seg_secs * FPS))
    last = max(1, frames - 1)
    cmd = ["ffmpeg", "-y", "-v", "error"]
    # OJO: cada imagen entra como UN SOLO frame (sin -loop): zoompan con
    # d=frames genera exactamente `frames` salidas por entrada. Con -loop,
    # zoompan multiplica (frames_de_entrada x d) y el video explota.
    for img in images:
        cmd += ["-i", img]
    parts = []
    for i in range(len(images)):
        # Alterna: pieza par entra (1→1.13), impar sale (1.13→1).
        z = smooth_expr(last, 1.0, 1.13) if i % 2 == 0 else smooth_expr(last, 1.13, 1.0)
        parts.append("[{i}:v]{f}[v{i}]".format(i=i, f=zoompan(z, frames)))
    concat_in = "".join("[v%d]" % i for i in range(len(images)))
    parts.append("{c}concat=n={n}:v=1:a=0,format=yuv420p[out]".format(c=concat_in, n=len(images)))
    cmd += [
        "-filter_complex", ";".join(parts),
        "-map", "[out]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-movflags", "+faststart",
        out,
    ]
    run(cmd)
    print("VIDEO TOUR OK %s (%d piezas x %d frames)" % (out, len(images), frames))


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "--tour":
        if len(sys.argv) < 5:
            print("uso: demo_video.py --tour SALIDA_MP4 SEG_POR_PIEZA IMG1 IMG2 ...", file=sys.stderr)
            sys.exit(2)
        tour(sys.argv[2], float(sys.argv[3]), sys.argv[4:])
        return
    if len(sys.argv) < 3:
        print("uso: demo_video.py ENTRADA SALIDA_MP4 [segundos]", file=sys.stderr)
        sys.exit(2)
    src, out = sys.argv[1], sys.argv[2]
    secs = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
    classic(src, out, secs)


if __name__ == "__main__":
    main()
