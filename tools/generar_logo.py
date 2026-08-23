"""Logo de Bus Factor HQ: rejilla 50x50 escalada x20 = 1000x1000.

Medio bus entrando por el borde izquierdo, a punto de arrollar una laptop.
Sangre en el morro. El chiste del bus factor, sin metaforas.
"""

from pathlib import Path

from PIL import Image

SALIDA = str(Path(__file__).resolve().parent.parent / "project-logo.png")
N = 50
ESCALA = 20

C = {
    "fondo":    (20, 20, 38),
    "suelo":    (30, 29, 52),
    "cuerpo":   (158, 54, 112),   # magenta del bus
    "cuerpo_o": (116, 36, 82),
    "coral":    (242, 116, 92),
    "coral_o":  (192, 82, 64),
    "paragolpe": (66, 56, 72),   # gris plomo: si es rojizo se come la sangre
    "naranja":  (245, 166, 62),
    "vidrio":   (56, 60, 92),
    "vidrio_c": (100, 110, 148),
    "borde":    (32, 22, 42),
    "llanta":   (16, 16, 24),
    "rin":      (122, 128, 148),
    "faro":     (255, 244, 200),
    "sangre":   (206, 30, 40),
    "sangre_o": (134, 14, 22),
    "metal":    (150, 156, 172),
    "metal_o":  (92, 98, 116),
    "pantalla": (126, 214, 245),
    "chispa":   (255, 226, 120),
}

lienzo = [[C["fondo"]] * N for _ in range(N)]


def punto(x, y, color):
    if 0 <= x < N and 0 <= y < N:
        lienzo[y][x] = C[color]


def caja(x0, y0, x1, y1, color):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            punto(x, y, color)


def disco(cx, cy, radio, color):
    for dy in range(-radio, radio + 1):
        for dx in range(-radio, radio + 1):
            if dx * dx + dy * dy <= (radio + 0.4) ** 2:
                punto(cx + dx, cy + dy, color)


RUEDA = [
    "..XXXXX..",
    ".XXXXXXX.",
    "XXXXXXXXX",
    "XXXXXXXXX",
    "XXXXXXXXX",
    "XXXXXXXXX",
    "XXXXXXXXX",
    ".XXXXXXX.",
    "..XXXXX..",
]


def rueda(cx, cy):
    """Circulo dibujado a mano: la formula del disco sale dentada como un piñón."""
    for dy, linea in enumerate(RUEDA):
        for dx, ch in enumerate(linea):
            if ch == "X":
                punto(cx - 4 + dx, cy - 4 + dy, "llanta")
    caja(cx - 1, cy - 1, cx + 1, cy + 1, "rin")
    punto(cx, cy, "llanta")


# --- suelo --------------------------------------------------------------------
caja(0, 40, N - 1, 49, "suelo")

# --- bus, cortado por el borde izquierdo --------------------------------------
caja(0, 6, 32, 36, "cuerpo")
caja(26, 0, 32, 6, "fondo")             # chaflan del techo hacia el morro
caja(29, 0, 32, 7, "fondo")
caja(31, 0, 32, 8, "fondo")
caja(0, 6, 25, 6, "borde")
caja(26, 7, 28, 7, "borde")
caja(29, 8, 30, 8, "borde")
caja(31, 9, 32, 9, "borde")
caja(32, 9, 32, 36, "borde")
caja(0, 36, 32, 36, "borde")

caja(2, 12, 21, 21, "vidrio")           # ventanal lateral
caja(2, 12, 21, 12, "vidrio_c")
caja(8, 12, 9, 21, "cuerpo")            # pilares
caja(15, 12, 16, 21, "cuerpo")

caja(24, 11, 31, 23, "vidrio")          # parabrisas
caja(24, 11, 31, 12, "vidrio_c")
caja(22, 11, 23, 23, "cuerpo")          # montante

caja(0, 24, 23, 26, "naranja")          # franjas laterales
caja(0, 27, 23, 29, "coral")
caja(24, 24, 32, 35, "coral")           # morro
caja(24, 32, 32, 35, "paragolpe")       # parachoques
caja(30, 26, 32, 28, "faro")            # faro
caja(0, 30, 23, 36, "cuerpo_o")         # bajos

rueda(7, 36)
rueda(20, 36)

# --- laptop, entera dentro del encuadre ---------------------------------------
caja(36, 24, 46, 36, "metal_o")         # marco de la pantalla
caja(37, 25, 45, 34, "pantalla")
caja(37, 34, 45, 35, "metal_o")
caja(34, 37, 48, 40, "metal")           # teclado
caja(34, 40, 48, 40, "metal_o")

# --- sangre en el morro -------------------------------------------------------
SANGRE = [
    # mancha alta, sobre el parabrisas
    (29, 15), (30, 15), (31, 15), (30, 16), (31, 16), (32, 16), (30, 17),
    (31, 14), (32, 17), (29, 16),
    # chorreado que baja por el morro
    (31, 18), (31, 19), (30, 20), (31, 21),
    # mancha baja, sobre el paragolpes
    (27, 30), (28, 30), (29, 30), (28, 31), (29, 31), (30, 31), (28, 32),
    (29, 29), (30, 30), (27, 31),
    (28, 33), (29, 34),                                   # gotea al suelo
    (33, 18), (34, 27), (33, 34), (35, 22),               # gotas que saltan
]
OSCURA = [
    (30, 16), (31, 16), (30, 17),
    (28, 31), (29, 31), (28, 32),
    (31, 19), (29, 30), (32, 16), (29, 34),
]
for x, y in SANGRE:
    punto(x, y, "sangre")
for x, y in OSCURA:
    punto(x, y, "sangre_o")

imagen = Image.new("RGBA", (N, N))
imagen.putdata([px + (255,) for fila in lienzo for px in fila])
imagen.resize((N * ESCALA, N * ESCALA), Image.NEAREST).save(SALIDA)
print("listo")
