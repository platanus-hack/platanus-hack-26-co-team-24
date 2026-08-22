"""Los 9 de la oficina demo: lo que el cerebro no sabe.

`cerebro` solo conoce emails — es lo único consistente entre Slack, GitHub y
Meet. Nombre, rol, sprite y avatar son de P3, y esta tabla es la semilla hasta
que Supabase esté arriba. Los emails son los mismos de `cerebro.mocks.EQUIPO` y
de `data/raw/fixture_p2.json`; si se desincronizan, `GET /oficina` deja de
cruzar y la oficina sale vacía.

`avatar_config` es JSON libre: el formato lo define P4, aquí solo se guarda.
"""

OFICINA = {"id": "of-demo", "nombre": "Bus Factor HQ"}


def _avatar(cuerpo: int, peinado: int, ropa: int, paleta: str) -> dict:
    return {"cuerpo": cuerpo, "peinado": peinado, "ropa": ropa, "paleta": paleta}


PERSONAS: dict[str, dict] = {
    "ana@empresa.com": {
        "nombre": "Ana Sofía Suárez",
        "rol": "Operaciones",
        "sprite": "lpc-01",
        "avatar_config": _avatar(1, 3, 2, "coral"),
    },
    "david@empresa.com": {
        "nombre": "David Morales",
        "rol": "Infraestructura",
        "sprite": "lpc-02",
        "avatar_config": _avatar(2, 1, 4, "azul"),
    },
    "brayan@empresa.com": {
        "nombre": "Brayan Barajas",
        "rol": "IT y Workspace",
        "sprite": "lpc-03",
        "avatar_config": _avatar(2, 5, 1, "verde"),
    },
    "jorge@empresa.com": {
        "nombre": "Jorge Jaimes",
        "rol": "Datos",
        "sprite": "lpc-04",
        "avatar_config": _avatar(1, 2, 3, "morado"),
    },
    "andres@empresa.com": {
        "nombre": "Andrés Uribe",
        "rol": "Plataforma",
        "sprite": "lpc-05",
        "avatar_config": _avatar(3, 4, 2, "naranja"),
    },
    "samuel@empresa.com": {
        "nombre": "Samuel Rojas",
        "rol": "Backend",
        "sprite": "lpc-06",
        "avatar_config": _avatar(2, 2, 5, "cian"),
    },
    "laura@empresa.com": {
        "nombre": "Laura Peña",
        "rol": "Finanzas",
        "sprite": "lpc-07",
        "avatar_config": _avatar(1, 6, 1, "rosa"),
    },
    "camilo@empresa.com": {
        "nombre": "Camilo Torres",
        "rol": "Finanzas",
        "sprite": "lpc-08",
        "avatar_config": _avatar(3, 1, 3, "amarillo"),
    },
    "valentina@empresa.com": {
        "nombre": "Valentina Gómez",
        "rol": "Soporte",
        "sprite": "lpc-09",
        "avatar_config": _avatar(1, 4, 4, "turquesa"),
    },
}


def nombre_de(email: str) -> str:
    persona = PERSONAS.get(email)
    return persona["nombre"] if persona else email.split("@")[0].capitalize()


def buscar_por_nombre(texto: str, excluir: str = "") -> str | None:
    """Encuentra a quién nombra un texto libre (la `accion` de una quest).

    Las quests dicen "comparte el acceso con Samuel", no el email. Buscamos el
    nombre de pila porque es lo que el modelo escribe; el apellido rara vez.
    """
    minuscula = texto.lower()
    for email, persona in PERSONAS.items():
        if email == excluir:
            continue
        pila = persona["nombre"].split()[0].lower()
        if pila in minuscula:
            return email
    return None
