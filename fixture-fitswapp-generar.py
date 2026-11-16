#!/usr/bin/env python3
# fixture-fitswapp-generar.py — SLICE 4: genera venty-piloto-fitswapp-fixture.json
# desde la ÚNICA fuente permitida: ~/workspace/fitswapp-team/comercial/prospectos.md
# Corte de la fuente: el fundamento (venty-fundamento-fitswapp-borrador.md, 6/11)
# congela el censo en 198 prospectos / 113 borradores / 0 enviados. El archivo
# siguió creciendo después del 6/11 (investigaciones 7/11–12/11, +10 filas):
# esas filas NO son del piloto congelado y quedan fuera del fixture.
# El script no inventa datos: extrae nombre, dirección, handle de IG (solo si
# la fila lo publica como verificado), notas y señales textuales. La zona se
# asigna con una regla determinística sobre la dirección (ver ZONA_REGLAS);
# los 10 fundadores de la oleada 1 fijan su zona por los anclas del borrador §11.
# Uso: python3 fixture-fitswapp-generar.py <prospectos.md> <salida.json>
import json, re, sys, unicodedata

CORTE = "2026-11-06"
FUNDADORES = [
    "Galpón de Ropa", "Urban Luxury", "Eureka Vintage Club", "Boycapel",
    "Sophie's Closet", "Locas por los Trapos", "Meri Salinas Closet",
    "Fresh Store", "El Ropavejero", "tu ropa mi ropa",
]
# Zona de cada fundador según los anclas del borrador §11 (manda sobre la regla).
ZONA_FUNDADOR = {
    "galpon de ropa": 1, "sophie's closet": 1, "meri salinas closet": 1,
    "eureka vintage club": 2, "boycapel": 2, "locas por los trapos": 2,
    "urban luxury": 4,
    "fresh store": 5, "el ropavejero": 5, "tu ropa mi ropa": 5,
}

def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()

# Regla de zona por dirección (determinística, en orden: gana la primera).
# 1 Palermo · 2 San Telmo/Microcentro/Centro · 3 Villa Crespo/Almagro/
# Caballito/Boedo (+ oeste/sur CABA) · 4 Belgrano/Núñez/Colegiales (+ norte
# CABA) · 5 GBA y resto. "solo online" sin ciudad CABA explícita → 5 solo si
# la nota nombra una ciudad GBA; si dice CABA → 1 (bolsa de sellers online).
ZONA_REGLAS = [
    (5, ["quilmes", "la plata", "san isidro", "olivos", "banfield", "moron",
         "avellaneda", "castelar", "tigre", "martinez", "san fernando", "lanus",
         "ituzaingo", "ramos mejia", "caseros", "burzaco", "berazategui",
         "lomas de zamora", "merlo", "moreno", "pilar", "escobar", "campana",
         "zarate", "san miguel", "jose c. paz", "jose c paz", "grand bourg",
         "malvinas", "pablo nogues", "monte grande", "ezeiza", "spegazzini",
         "san vicente", "gonzalez catan", "la matanza", "san martin)",
         "villa centenario", "9 de abril", "claypole", "berazategui",
         "don torcuato", "munro", "villa adelina", "ingeniero maschwitz",
         "maschwitz", "el palomar", "ciudadela", "adrogué", "adrogue",
         "lomas", "temperley", "hurlingham", "tres de febrero", "villa ballester",
         "pablo podesta", "belen de escobar", "paso del rey", "william morris",
         "villa vatteone", "jose ingenieros", "san antonio de padua", "ituzaingo",
         "haedo", "villa luzuriaga", "la plata", "berisso", "ensenada"]),
    (1, ["palermo", "canitas", "cañitas"]),
    (2, ["san telmo", "microcentro", "monserrat", "retiro", "balvanera",
         "recoleta", "barrio norte", "puerto madero", "constitucion",
         "congreso", "centro", "defensa 5", "defensa 1", "suipacha",
         "talcahuano", "viamonte"]),
    (4, ["belgrano", "nunez", "nuñez", "colegiales", "saavedra", "coghlan",
         "villa urquiza", "villa pueyrredon", "chacarita", "villa ortuzar"]),
    (3, ["villa crespo", "almagro", "caballito", "boedo", "flores", "floresta",
         "paternal", "villa del parque", "devoto", "monte castro", "liniers",
         "mataderos", "villa lugano", "parque chacabuco", "san cristobal",
         "abasto"]),
]

def zona_de(direccion, notas, nombre):
    n = norm(nombre)
    if n in ZONA_FUNDADOR:
        return ZONA_FUNDADOR[n]
    d = norm(direccion)
    texto = d + " " + norm(notas)
    if "solo online" in d:
        for z, claves in ZONA_REGLAS:
            if z == 5 and any(c in texto for c in claves):
                return 5
        return 1  # seller online de CABA sin barrio: bolsa zona 1
    for z, claves in ZONA_REGLAS:
        if any(c in d for c in claves):
            return z
    # calles del centro/san telmo sin barrio escrito en la dirección
    if any(c in d for c in ["defensa", "estados unidos", "humberto", "suipacha",
                            "talcahuano", "viamonte", "sarmiento 1", "sarmiento 3",
                            "corrientes 4", "25 de mayo", "tucuman 8", "paraguay 2",
                            "solis", "san jose", "parana 6", "montevideo 2",
                            "rodriguez pena", "av. de mayo", "avenida de mayo",
                            "santiago del estero", "bartolome mitre", "9 de julio"]):
        return 2
    if any(c in d for c in ["santa fe 1", "santa fe 2", "azcuenaga", "pacheco de melo",
                            "quintana", "libertad 9", "callao", "junin"]):
        return 2  # recoleta / barrio norte / retiro
    if any(c in d for c in ["gorriti", "costa rica", "thames", "bonpland",
                            "fray justo", "gurruchaga", "serrano", "guemes",
                            "el salvador", "honduras", "cabrera", "soler 5",
                            "charcas 5", "guatemala 4", "angel justiniano carranza"]):
        return 1  # palermo por calle
    if any(c in d for c in ["rivadavia 4", "rivadavia 5", "acevedo", "jufre",
                            "mario bravo", "acuna de figueroa", "sanchez de loria",
                            "boedo 5", "corrientes 52", "gascon", "artigas 1",
                            "pedro lozano", "corrientes 5233"]):
        return 3
    if any(c in d for c in ["lacroze", "dragones", "alvarez thomas", "deheza",
                            "jose cubas", "leiva"]):
        return 4
    return 5  # sin señal CABA: queda en la bolsa GBA/resto, nunca se inventa barrio

def main():
    src, out = sys.argv[1], sys.argv[2]
    lines = open(src, encoding="utf-8").read().splitlines()
    filas, incluir = [], True
    for l in lines:
        if l.startswith("##"):
            m = re.search(r"2026-\d\d-\d\d", l)
            incluir = not (m and m.group(0) > CORTE)
        if not incluir:
            continue
        s = l.strip()
        if not s.startswith("|") or "---" in s:
            continue
        partes = [p.strip() for p in s.strip("|").split("|")]
        if not partes or partes[0] in ("Local", "") or len(partes) < 5:
            continue
        filas.append(partes)
    res = []
    for p in filas:
        nombre, direccion = p[0].replace("\\|", "|").strip(), p[1].strip()
        # dos formatos de tabla: (Local|Dirección|Horario|Notas|..) sin IG e
        # (Local|Dirección|IG|Notas|..). El IG solo existe en el 2.º formato.
        col3 = p[2] if len(p) > 2 else ""
        notas = p[3] if len(p) > 3 else ""
        ig = None
        m = re.search(r"@([A-Za-z0-9_.]+)", col3)
        if m and "sin ig" not in norm(col3):
            ig = "@" + m.group(1)
        texto = norm(nombre + " " + direccion + " " + col3 + " " + notas)
        email = None
        me = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", notas)
        if me:
            email = me.group(0).lower()
        res.append({
            "nombre": nombre,
            "direccion": direccion,
            "ig": ig,
            "email": email,
            "notas": notas[:400],
            "tiene_borrador": "dm redactado" in texto,
            "tienda_online": any(k in texto for k in ["tienda online", "mitiendanube", "empretienda", "tiendanube", "tienda.valgo", "mercadoshops", ".com.ar activa", "somosronda.ar", "secondtienda.com"]),
            "consignacion": "consignacion" in texto or "consignment" in texto,
            "fundador_star": ("⭐" in (col3 + notas)) or ("prioridad fundadora" in texto) or ("candidat" in texto and "fundador" in texto),
            "es_fundador_oleada1": nombre in FUNDADORES,
            "cerrado": ("permanentemente cerrado" in texto) or ("descartado por ahora" in texto),
            "temporalmente_cerrado": "temporarily closed" in texto or "possibly temporarily" in texto,
            "mayorista": "mayorista" in texto,
            "infantil": any(k in texto for k in ["infantil", "bebes y ninos", "ropa infantil", "secondhand infantil", "kids"]) and "mujer" not in texto.split("infantil")[0][-40:],
            "hogar": nombre == "Feria Americana del Hogar",
            "sin_verificar": ("reverificar en persona" in texto) or ("sin dm por ahora" in texto),
            "zona": zona_de(direccion, notas, nombre),
            "fuente": "prospectos.md (corte 2026-11-06)",
        })
    json.dump({"corte": CORTE, "total": len(res), "prospectos": res},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"fixture: {len(res)} prospectos -> {out}")

if __name__ == "__main__":
    main()
