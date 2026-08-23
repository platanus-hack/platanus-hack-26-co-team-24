import { useEffect, useState } from 'react';
import { bus } from '../bus';
import { getOficina, IS_MOCK } from '../api';
import type { Person, SimulationResult } from '../types';
import { tipoChip, tipoChipColor } from './chips';
import { formatSeconds } from './format';
import './ui.css';

interface ResultPayload {
  result: SimulationResult;
  ms: number;
}

/** Modal con el resultado de la simulación: impacto, items huérfanos y el
 * playbook. También muestra el error si la API falla. */
export function ResultPanel() {
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);

  // Sólo hace falta para el encabezado "SIN <NOMBRE> · <ROL>": una consulta
  // en el montaje basta (el panel vive montado toda la sesión de /oficina).
  useEffect(() => {
    getOficina()
      .then((o) => setPeople(o.people))
      .catch((err) => console.error('getOficina', err));
  }, []);

  useEffect(() => {
    const onResult = (p: ResultPayload) => {
      setError(null);
      setPayload(p);
    };
    const onError = (msg: unknown) => {
      setPayload(null);
      setError(String(msg));
    };
    bus.on('scenario:result', onResult);
    bus.on('scenario:error', onError);
    return () => {
      bus.off('scenario:result', onResult);
      bus.off('scenario:error', onError);
    };
  }, []);

  const close = () => {
    setPayload(null);
    setError(null);
  };

  /** Salir del resultado siempre restaura la oficina: si no, los personajes
   * quedan congelados (stopBehavior) con la consola ya rehabilitada. En la
   * vista de error `restore()` ya corrió en la escena, así que basta cerrar. */
  const closeResult = () => {
    bus.emit('scenario:restore');
    close();
  };

  const visible = payload !== null || error !== null;
  const isError = error !== null;

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (isError ? close : closeResult)();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, isError]);

  if (!visible) return null;

  if (error !== null) {
    return (
      <div className="result-panel">
        <div className="result-panel__header">
          <p className="result-panel__error-title">
            ERROR CONECTANDO A LA API
          </p>
        </div>
        <div className="result-panel__error-body">
          <p className="result-panel__error-msg">{error}</p>
          <div className="result-panel__actions">
            <button
              type="button"
              className="result-btn result-btn--secondary"
              onClick={close}
            >
              CERRAR
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { result: r, ms } = payload!;
  const person = people.find((p) => p.id === r.person_id) ?? null;
  const titulo = person
    ? `SIN ${person.nombre.toUpperCase()} · ${person.rol.toUpperCase()}`
    : 'RESULTADO DEL ESCENARIO';

  const downloadMd = () => {
    const blob = new Blob([r.playbook_md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `empalme-${r.person_id ?? r.scenario_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="result-panel">
      <div className="result-panel__header">
        <div className="result-panel__title-group">
          <p className="result-panel__title">{titulo}</p>
          {IS_MOCK && (
            <span className="result-chip result-chip--mock">
              RESULTADO SIMULADO (DEMO)
            </span>
          )}
        </div>
        <span className="result-panel__meta">
          GENERADO EN {formatSeconds(ms)} S
        </span>
      </div>

      {/* La API real sólo manda una frase de impacto; el mock trae además las
          métricas numéricas. Pintamos sólo los tiles que tengan valor. */}
      <div className="result-stats">
        {(
          [
            [r.impacto.tareas, 'tareas huérfanas'],
            [r.impacto.dias_recuperacion, 'días de empalme estimados'],
            [r.impacto.score, 'impacto sobre la operación'],
          ] as [number | undefined, string][]
        )
          .filter(([value]) => value !== undefined)
          .map(([value, label]) => (
            <div className="result-stat" key={label}>
              <span className="result-stat__value">{value}</span>
              <span className="result-stat__label">{label}</span>
            </div>
          ))}
      </div>

      {r.impacto.texto && (
        <p className="result-panel__impacto">{r.impacto.texto}</p>
      )}

      <div className="result-panel__body">
        <div className="result-section result-section--items">
          <span className="result-section__title">QUÉ QUEDA SIN DUEÑO</span>
          <ul className="result-items">
            {r.items_huerfanos.map((item) => (
              <li key={item.id} className="result-item">
                <span
                  className="result-item__chip"
                  style={tipoChipColor(item.tipo)}
                >
                  {tipoChip(item.tipo)}
                </span>
                <span className="result-item__desc">{item.descripcion}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="result-section result-section--playbook">
          <div className="result-playbook__header">
            <span className="result-section__title result-section__title--lima">
              PLAYBOOK GENERADO
            </span>
            <span className="result-chip result-chip--markdown">
              MARKDOWN
            </span>
          </div>
          {/* ponytail: sin renderer markdown, el playbook se muestra tal cual. */}
          <pre className="result-playbook">{r.playbook_md}</pre>

          <div className="result-panel__actions">
            <button
              type="button"
              className="result-btn result-btn--primary"
              onClick={closeResult}
            >
              RESTAURAR OFICINA
            </button>
            <button
              type="button"
              className="result-btn result-btn--secondary"
              onClick={downloadMd}
            >
              DESCARGAR .MD
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
