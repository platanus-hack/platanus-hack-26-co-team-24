import { useEffect, useState } from 'react';
import { bus } from '../bus';
import { DEMO_USER_ID, getEscenarios, getOficina } from '../api';
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
  const [personId, setPersonId] = useState(DEMO_USER_ID);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getEscenarios()
      .then((r) => setScenarios(r.scenarios))
      .catch((err) => console.error('getEscenarios', err));
    getOficina()
      .then((o) => {
        setPeople(o.people);
        // Con una API real los ids pueden no incluir el demo `p_ana`: el
        // select mostraría la primera persona mientras el estado apunta a
        // alguien inexistente y la simulación no haría nada.
        setPersonId((p) =>
          o.people.some((x) => x.id === p) ? p : (o.people[0]?.id ?? p),
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
        🕹️ Consola
      </button>

      {open && (
        <div className="arcade-panel">
          <div className="arcade-panel__header">
            <p className="arcade-panel__title">Consola de escenarios</p>
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
              Persona
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
            Simular
          </button>
        </div>
      )}
    </>
  );
}
