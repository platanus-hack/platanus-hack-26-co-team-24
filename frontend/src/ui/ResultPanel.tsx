import { useEffect, useState } from 'react';
import { bus } from '../bus';
import type { SimulationResult } from '../types';
import './ui.css';

/** Modal con el resultado de la simulación: impacto, items huérfanos y el
 * playbook. También muestra el error si la API falla. */
export function ResultPanel() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onResult = (r: SimulationResult) => {
      setError(null);
      setResult(r);
    };
    const onError = (msg: unknown) => {
      setResult(null);
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
    setResult(null);
    setError(null);
  };

  const visible = result !== null || error !== null;

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!visible) return null;

  if (error !== null) {
    return (
      <div className="result-panel">
        <p className="result-panel__title">
          Error conectando a la API — reintenta
        </p>
        <p className="result-panel__error">{error}</p>
        <div className="result-panel__actions">
          <button type="button" className="result-btn" onClick={close}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const r = result!;
  return (
    <div className="result-panel">
      <p className="result-panel__title">Resultado de la simulación</p>

      <div className="result-stats">
        <div className="result-stat">
          <span className="result-stat__value">{r.impacto.tareas}</span>
          <span className="result-stat__label">tareas huérfanas</span>
        </div>
        <div className="result-stat">
          <span className="result-stat__value">
            {r.impacto.dias_recuperacion}
          </span>
          <span className="result-stat__label">días de recuperación</span>
        </div>
        <div className="result-stat">
          <span className="result-stat__value">{r.impacto.score}</span>
          <span className="result-stat__label">impacto</span>
        </div>
      </div>

      <ul className="result-items">
        {r.items_huerfanos.map((item) => (
          <li key={item.id}>
            [{item.tipo}] {item.descripcion}
          </li>
        ))}
      </ul>

      {/* ponytail: sin renderer markdown, el playbook se muestra tal cual. */}
      <pre className="result-playbook" style={{ whiteSpace: 'pre-wrap' }}>
        {r.playbook_md}
      </pre>

      <div className="result-panel__actions">
        <button
          type="button"
          className="result-btn"
          onClick={() => {
            bus.emit('scenario:restore');
            close();
          }}
        >
          Restaurar oficina
        </button>
        <button
          type="button"
          className="result-btn result-btn--ghost"
          onClick={close}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
