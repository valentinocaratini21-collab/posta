#!/usr/bin/env python3
"""Test lote APROBAR-TODO. Corre sobre work/ y compara contra la base v626.

Uso: python3 test-loteaprobartodo.py [workdir] [basedir]
  workdir default: ./work ; basedir default: ~/workspace/.lotechatpildora-release/work
Sale 0 solo si TODO pasa. No escribe nada.
"""
import subprocess
import sys
from pathlib import Path

WORK = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "work"
BASE = (
    Path(sys.argv[2])
    if len(sys.argv) > 2
    else Path.home() / "workspace" / ".lotechatpildora-release" / "work"
)

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'} {name} {detail}")
    if not cond:
        fails.append(name)


def read_bytes(p):
    return p.read_bytes()


def main():
    app = read_bytes(WORK / "public" / "app.js")
    base_app = read_bytes(BASE / "public" / "app.js")
    css = read_bytes(WORK / "public" / "styles.css")
    base_css = read_bytes(BASE / "public" / "styles.css")

    # 1. Texto del botón del encabezado (SOLO esa línea)
    lines = app.split(b"\n")
    hdr = [ln for ln in lines if b'id="hfAcceptAllWeek"' in ln]
    check("header-line-unica", len(hdr) == 1, f"({len(hdr)})")
    if hdr:
        check(
            "header-dice-aprobar",
            b"Aprobar todo" in hdr[0] and b"Approve all" in hdr[0],
        )
        check(
            "header-sin-aceptar",
            b"Aceptar todo" not in hdr[0] and b"Accept all" not in hdr[0],
        )
    check("aprobar-todo-x1", app.count(b"Aprobar todo") == 1)
    check("approve-all-x1", app.count(b"Approve all") == 1)

    # 2. Lo demás NO se tocó
    pill = [ln for ln in lines if b'id="${id}"' in ln and b"accept-pill" in ln]
    check(
        "agenda-pill-intacta",
        len(pill) == 1
        and b"Aceptar todo" in pill[0]
        and b"Accept all" in pill[0],
    )
    hs = [ln for ln in lines if b'id="hsAcceptAll"' in ln]
    check(
        "agenda-hs-intacto",
        len(hs) == 1 and b"Aceptar todo" in hs[0],
    )
    check(
        "btnAcceptAll-reset-intacto",
        b"pzIc('checkCircle', 18) + ' Aceptar todo'" in app,
    )
    check(
        "detalle-aceptar-intacto",
        b"onclick=\"bbAccion(${i.id}, 'aceptar', this)\">Aceptar</button>" in app,
    )

    # 3. Handler intacto
    check("handler-def", b"async function pzAcceptAllWeek(btn)" in app)
    check(
        "handler-binding",
        b"pzAcceptWeekHTML = pzAcceptWeekCands.length" in app
        and b"acceptBarHTML(pzAcceptWeekCands.length)" in app,
    )

    # 4. CSS: nota centrada, resto intacto
    css_lines = css.split(b"\n")
    note = [ln for ln in css_lines if ln.startswith(b".hf-accept-note{")]
    check("note-regla-unica", len(note) == 1, f"({len(note)})")
    if note:
        check("note-align-self-center", b"align-self:center" in note[0])
    check(
        "pacts-accept-static-intacto",
        b".hf-pacts-accept .hf-accept-bar{position:static}" in css,
    )
    check(
        "pacts-accept-flex-intacto",
        b".hf-pacts-accept{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;padding:12px 10px 2px}"
        in css,
    )
    check("grayscale-v624-intacto", css.count(b"grayscale(1)") == base_css.count(b"grayscale(1)"))

    # 5. Guardas y linaje
    check("chunk-v-intacto", b"const CHUNK_V = '20261101-v624';" in app)
    check("collapse-guard-7", app.count(b"pzHeadCollapseEcho") == 7)
    check("chat-pill-intacta", app.count(b"mzChatPlus") == 1)
    check(
        "server-intacto",
        read_bytes(WORK / "server.js") == read_bytes(BASE / "server.js"),
    )
    check(
        "diff-acotado",
        sum(1 for a, b in zip(base_app.split(b"\n"), lines) if a != b) == 1
        and sum(1 for a, b in zip(base_css.split(b"\n"), css.split(b"\n")) if a != b) == 1,
        "(1 línea app.js + 1 línea styles.css)",
    )

    # 6. Sintaxis
    r = subprocess.run(
        ["node", "--check", str(WORK / "public" / "app.js")],
        capture_output=True,
    )
    check("node-check", r.returncode == 0)

    print(f"\n{len(fails)} FAILS" if fails else "\nTODO OK")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
