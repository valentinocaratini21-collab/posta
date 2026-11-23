#!/usr/bin/env python3
"""LOTE CONSERJE-BANDEJA — chequeo Chromium real a 390px.
Uso: check-bandeja-chromium.py <base_url>
Imprime una línea JSON por chequeo: {"nombre": ..., "ok": bool, "extra": ...}
y sale 0 solo si todos pasan. El servidor lo levanta la suite node."""
import json, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1]
res = []
def t(nombre, cond, extra=""):
    res.append({"nombre": nombre, "ok": bool(cond), "extra": str(extra)[:160]})

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    ctx.add_init_script("try{localStorage.setItem('posta_admin_token','tok-bandeja')}catch(e){}")
    pg = ctx.new_page()
    pg.goto(BASE + "/conserje", wait_until="load")
    # la bandeja pinta cuando llega la vista (DB vacía: Hoy = todo resuelto)
    for _ in range(40):
        if pg.evaluate("document.getElementById('mBody').innerText.length > 3 && !document.getElementById('mBody').innerText.includes('Cargando')"):
            break
        time.sleep(0.25)
    t("390px: la capa móvil es la que se ve (#movil visible, .app oculta)",
      pg.evaluate("getComputedStyle(document.getElementById('movil')).display === 'flex' && getComputedStyle(document.querySelector('.app')).display === 'none'"))
    t("390px: sin scroll horizontal", pg.evaluate("document.documentElement.scrollWidth <= 391"),
      pg.evaluate("document.documentElement.scrollWidth"))
    t("390px: el fondo del body es el crema de la bandeja",
      pg.evaluate("getComputedStyle(document.body).backgroundColor === 'rgb(255, 249, 240)'"),
      pg.evaluate("getComputedStyle(document.body).backgroundColor"))
    cajas = pg.evaluate("""[...document.querySelectorAll('#movil .m-nav button')].map(b => { const r = b.getBoundingClientRect(); return {h: r.height, txt: b.innerText}; })""")
    t("390px: la navegación inferior trae Hoy/Negocios/Posteos/Más",
      len(cajas) == 4 and all(x in " ".join(c["txt"] for c in cajas) for x in ["Hoy", "Negocios", "Posteos", "Más"]), cajas)
    t("390px: botones de navegación ≥44px de alto", all(c["h"] >= 44 for c in cajas), cajas)
    t("390px: Hoy pinta su estado (todo resuelto con la DB vacía)",
      "Todo resuelto" in pg.inner_text("#mBody"))
    pg.click("#movil .m-nav button[data-mtab='negocios']")
    time.sleep(0.4)
    txt = pg.inner_text("#mBody").upper()
    t("390px: Negocios pinta el tablero (resumen)", "NEGOCIOS" in txt and "PARA VOS" in txt and "PROBLEMA" in txt)
    pg.click("#movil .m-nav button[data-mtab='posteos']")
    time.sleep(0.4)
    txt = pg.inner_text("#mBody").upper()
    t("390px: Posteos pinta la cola de revisión (o su vacío honesto)", "REVISIÓN" in txt or "NO HAY PRODUCCIÓN DE MAÑANA" in txt)
    pg.click("#movil .m-nav button[data-mtab='mas']")
    time.sleep(0.4)
    txt = pg.inner_text("#mBody").upper()
    t("390px: Más pinta accesos y últimas", "ACCESOS" in txt and "ÚLTIMAS DECISIONES" in txt)
    pg.click("#movil [data-mact='escritorio']")
    time.sleep(0.4)
    t("390px: «Consola completa» muestra el escritorio y el botón de volver",
      pg.evaluate("document.body.classList.contains('ver-escritorio') && getComputedStyle(document.querySelector('.app')).display !== 'none' && getComputedStyle(document.getElementById('volverBandeja')).display !== 'none'"))
    pg.click("#volverBandeja")
    time.sleep(0.4)
    t("390px: volver a la bandeja restaura la capa móvil",
      pg.evaluate("!document.body.classList.contains('ver-escritorio') && getComputedStyle(document.getElementById('movil')).display === 'flex'"))
    # escritorio intacto
    pg2 = b.new_page(viewport={"width": 1280, "height": 900})
    pg2.goto(BASE + "/conserje", wait_until="load")
    time.sleep(0.8)
    t("1280px: el escritorio manda (#movil oculto, .app visible)",
      pg2.evaluate("getComputedStyle(document.getElementById('movil')).display === 'none' && getComputedStyle(document.querySelector('.app')).display !== 'none'"))
    b.close()

for r in res:
    print(json.dumps(r, ensure_ascii=False))
sys.exit(0 if all(r["ok"] for r in res) else 1)
