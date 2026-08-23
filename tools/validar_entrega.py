"""Las reglas del validador del hackathon, corridas antes de mergear.

    python tools/validar_entrega.py

Frank (el bot de Platanus) revisa esto en cada merge a main y avisa cuando ya
es tarde. Esto es lo mismo, antes. Ya pasó una vez: un logo de 799 KB entró y
solo se supo cuatro merges después.
"""

import json
import os
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MAX_KB = 500
LADO = 1000


def revisar() -> list[str]:
    fallos = []

    logo = RAIZ / "project-logo.png"
    if not logo.exists():
        fallos.append("falta project-logo.png")
    else:
        kb = os.path.getsize(logo) / 1024
        if kb > MAX_KB:
            fallos.append(f"project-logo.png pesa {kb:.0f} KB, el máximo son {MAX_KB}")
        try:
            from PIL import Image

            ancho, alto = Image.open(logo).size
            if (ancho, alto) != (LADO, LADO):
                fallos.append(f"project-logo.png es {ancho}x{alto}, debe ser {LADO}x{LADO}")
        except ImportError:
            print("  (sin Pillow: no se verifican las dimensiones del logo)")

    crudo = (RAIZ / "platanus-hack-project.jsonc").read_text(encoding="utf-8")
    datos = json.loads(re.sub(r"^\s*//.*$", "", crudo, flags=re.M))
    for clave, valor in datos.items():
        if not str(valor).strip() or str(valor).startswith("<"):
            fallos.append(f"platanus-hack-project.jsonc: {clave} sin llenar")

    if "Put your project description" in (RAIZ / "project-description.md").read_text(encoding="utf-8"):
        fallos.append("project-description.md sigue con el texto de la plantilla")

    if "Before Submitting" in (RAIZ / "README.md").read_text(encoding="utf-8"):
        fallos.append("README.md sigue con la plantilla de Platanus")

    return fallos


def main() -> int:
    fallos = revisar()
    if fallos:
        for f in fallos:
            print(f"  ✗ {f}")
        print(f"\n{len(fallos)} problema(s): Frank rechazaría este commit.")
        return 1
    print("  ✓ la entrega pasa las reglas del validador")
    return 0


if __name__ == "__main__":
    sys.exit(main())
