"""La cadena completa, en un vistazo.

    python -m cerebro

Para el ensayo del demo (P5) y para que P3 vea qué forma tiene la salida.
Sin API key funciona igual, con playbook sin narración.
"""

from . import calcular_riesgo, cargar_eventos, extraer, generar_digest, resiliencia_equipo, simular


def main() -> int:
    eventos = cargar_eventos()
    items = extraer(eventos)
    scores = calcular_riesgo(items, eventos)

    print(f"\n{len(eventos)} eventos → {len(items)} elementos de conocimiento")
    print(f"Resiliencia del equipo: {resiliencia_equipo(items):.1f}/100\n")

    print("── Oficina ──")
    for s in scores:
        barra = "█" * (s.score // 5)
        print(f"  {s.score:3d} {barra:<20} {s.persona_id}")

    objetivo = scores[0].persona_id
    print(f"\n── Simulando: renuncia de {objetivo} ──")
    sim = simular("renuncia", items, objetivo, eventos)
    print(f"  {sim.impacto}  [{sim.generado_por}]")
    for a in sim.advertencias:
        print(f"  ⚠ {a}")
    print()
    print("\n".join("  " + l for l in sim.playbook_md.splitlines()))

    print("\n── Quests del viernes ──")
    for q in generar_digest(items, scores, eventos):
        print(f"  [{q.puntos:2d} pts] {q.asignado_a}: {q.accion}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
