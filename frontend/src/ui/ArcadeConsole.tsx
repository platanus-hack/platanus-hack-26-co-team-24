import { useEffect, useState } from 'react';
import { bus } from '../bus';
import { getEscenarios, getOficina, miId, resolverMiId } from '../api';
import { sfx, unlock } from '../audio';
import type { Person, Scenario } from '../types';
import './ui.css';

/** Consola arcade: botón flotante (y el objeto `console` de la escena) que
 * abre el panel de escenarios. Lanza la simulación por el bus y se bloquea
 * mientras hay una corriendo. */
export function ArcadeConsole() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // `miId` como inicializador perezoso: el primer render no puede esperar
  // al perfil, así que arranca con lo que se sepa y el efecto lo corrige.
  const [personId, setPersonId] = useState(miId);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getEscenarios()
      .then((r) => setScenarios(r.scenarios))
      .catch((err) => console.error('getEscenarios', err));
    // El objetivo por defecto es uno mismo: la gracia del juego es "qué se
    // rompe si falto YO". Se piden la oficina y la identidad a la vez porque
    // hay que cruzarlas: el id de la sesión puede no estar entre los miembros
    // (recién registrado, sin conocimiento asignado) y entonces el select
    // mostraría a la primera persona mientras el estado apunta a alguien
    // inexistente y SIMULAR no haría nada.
    Promise.all([getOficina(), resolverMiId()])
      .then(([o, yoId]) => {
        setPeople(o.people);
        setPersonId(
          o.people.some((x) => x.id === yoId)
            ? yoId
            : (o.people[0]?.id ?? yoId),
        );
      })
      .catch((err) => console.error('getOficina', err));
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onDone = () => setRunning(false);
    bus.on('console:open', onOpen);
    bus.on('scenario:result', onDone);
    bus.on('scenario:error', onDone);
    return () => {
      bus.off('console:open', onOpen);
      bus.off('scenario:result', onDone);
      bus.off('scenario:error', onDone);
    };
  }, []);

  // Escape cierra el panel, igual que el tooltip de riesgo y el panel de
  // resultado (ver RiskTooltip.tsx / ResultPanel.tsx).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const selected = scenarios.find((s) => s.id === selectedId) ?? null;

  const simulate = () => {
    if (!selected) return;
    unlock();
    sfx('click');
    setRunning(true);
    setOpen(false);
    bus.emit('scenario:start', {
      scenario_id: selected.id,
      person_id: selected.requiere_persona ? personId : undefined,
    });
  };

  return (
    <>
      <button
        type="button"
        className="arcade-open"
        disabled={running}
        onClick={() => {
          unlock();
          sfx('click');
          setOpen((v) => !v);
        }}
      >
        <span>🕹️</span>
        <span>CONSOLA</span>
      </button>

      {open && (
        <div className="arcade-panel">
          <div className="arcade-panel__header">
            <div className="arcade-panel__title-group">
              <span className="arcade-panel__icon" aria-hidden="true">
                🕹️
              </span>
              <p className="arcade-panel__title">CONSOLA DE EMERGENCIAS</p>
            </div>
            <div className="arcade-panel__header-right">
              <span className="arcade-panel__count">
                {scenarios.length} ESCENARIOS
              </span>
              <button
                type="button"
                className="arcade-close"
                aria-label="Cerrar"
                onClick={() => {
                  sfx('click');
                  setOpen(false);
                }}
              >
                ×
              </button>
            </div>
          </div>

          <ul className="arcade-list">
            {scenarios.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={
                    'arcade-item' +
                    (s.id === selectedId ? ' arcade-item--active' : '')
                  }
                  onClick={() => {
                    sfx('click');
                    setSelectedId(s.id);
                  }}
                >
                  <span className="arcade-item__name">{s.nombre}</span>
                  <span className="arcade-item__desc">{s.descripcion}</span>
                </button>
              </li>
            ))}
          </ul>

          {selected?.requiere_persona && (
            <label className="arcade-field">
              PERSONA
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.rol})
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            className="arcade-run"
            disabled={!selected || running}
            onClick={simulate}
          >
            SIMULAR ▶
          </button>
        </div>
      )}
    </>
  );
}
