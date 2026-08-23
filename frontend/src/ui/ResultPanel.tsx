import { useEffect, useState } from 'react';
import { bus } from '../bus';
import { getOficina, IS_MOCK } from '../api';
import type { Person, SimulationResult } from '../types';
import { tipoChip, tipoChipStyle } from './chips';
import { formatSeconds } from './format';
import './ui.css';

interface ResultPayload {
  result: SimulationResult;
  ms: number;
}

// Color fijo por métrica (guía, sección 07 "SIN ANA · OPS"): tareas
// huérfanas en ROJO, días de empalme en ORO, impacto en TURQUESA. Es por
// significado, no por posición, para que el color no cambie si algún tile
// se oculta por falta de valor.
const STAT_COLOR: Record<string, string> = {
  tareas: 'result-stat__value--rojo',
  dias_recuperacion: 'result-stat__value--oro',
  score: 'result-stat__value--turquesa',
};

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
  // Si hay person_id pero no lo encontramos en `people` (p.ej. getOficina()
  // falló o el backend real usa ids distintos), mostramos el id crudo en
  // vez de un genérico: sigue siendo más útil que "RESULTADO DEL
  // ESCENARIO" para depurar qué persona era. El genérico sólo aplica a los
  // escenarios sin persona objetivo (infra/física).
  const titulo = person
    ? `SIN ${person.nombre.toUpperCase()} · ${person.rol.toUpperCase()}`
    : r.person_id
      ? `SIN ${r.person_id}`
      : 'RESULTADO DEL ESCENARIO';

  const downloadMd = () => {
    const blob = new Blob([r.playbook_md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Sanitizado: person_id/scenario_id son ids internos (guiones bajos,
    // minúsculas) pero por si acaso viene algo con espacios o símbolos raros
    // desde el backend real, no queremos un nombre de archivo roto.
    const safeId = (r.person_id ?? r.scenario_id).replace(/[^a-z0-9_-]/gi, '_');
    a.download = `empalme-${safeId}.md`;
    a.click();
    // Revocar en el mismo tick puede cancelar la descarga en algunos
    // navegadores: se libera en cuanto el click ya se procesó.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="result-panel">
      {/* Cabecera fija: título + chips. No scrollea. */}
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

      {/* Región central: única que scrollea (tiles + impacto + 2 columnas),
          para que la cabecera y los botones nunca se corten a 1366x768. */}
      <div className="result-panel__scroll">
        {/* La API real sólo manda una frase de impacto; el mock trae además
            las métricas numéricas. Pintamos sólo los tiles que tengan valor. */}
        <div className="result-stats">
          {(
            [
              ['tareas', r.impacto.tareas, 'tareas huérfanas'],
              [
                'dias_recuperacion',
                r.impacto.dias_recuperacion,
                'días de empalme estimados',
              ],
              ['score', r.impacto.score, 'impacto sobre la operación'],
            ] as [string, number | undefined, string][]
          )
            .filter(([, value]) => value !== undefined)
            .map(([key, value, label]) => (
              <div className="result-stat" key={key}>
                <span className={`result-stat__value ${STAT_COLOR[key]}`}>
                  {value}
                </span>
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
                    style={tipoChipStyle(item.tipo)}
                  >
                    {tipoChip(item.tipo)}
                  </span>
                  <span className="result-item__desc">
                    {item.descripcion}
                  </span>
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
          </div>
        </div>
      </div>

      {/* Pie fijo: botones a lo ancho, siempre visibles (nunca scrollean). */}
      <div className="result-panel__footer">
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
  );
}
