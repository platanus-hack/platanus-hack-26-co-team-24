import { useEffect, useState } from 'react';
import { bus } from '../bus';
import type { ItemCritico } from '../types';
import { THEME } from '../game/palette';
import './ui.css';

interface PersonClickPayload {
  id: string;
  nombre: string;
  rol: string;
  score: number;
  items: ItemCritico[];
}

function scoreToBorderColor(score: number): string {
  if (score <= 40) return THEME.riskLow;
  if (score <= 70) return THEME.riskMid;
  return THEME.riskHigh;
}

/** Tooltip flotante (esquina superior derecha) que muestra el riesgo y los
 * items críticos del personaje clickeado en el mapa. Se suscribe a
 * `bus` ('person:click') y se cierra con Escape o el botón "×". */
export function RiskTooltip() {
  const [payload, setPayload] = useState<PersonClickPayload | null>(null);

  useEffect(() => {
    const handler = (data: PersonClickPayload) => setPayload(data);
    bus.on('person:click', handler);
    return () => {
      bus.off('person:click', handler);
    };
  }, []);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPayload(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload) return null;

  return (
    <div
      className="risk-tooltip"
      style={{ borderLeftColor: scoreToBorderColor(payload.score) }}
    >
      <div className="risk-tooltip__header">
        <div>
          <p className="risk-tooltip__name">{payload.nombre}</p>
          <p className="risk-tooltip__rol">{payload.rol}</p>
        </div>
        <button
          type="button"
          className="risk-tooltip__close"
          aria-label="Cerrar"
          onClick={() => setPayload(null)}
        >
          ×
        </button>
      </div>
      <p className="risk-tooltip__score">Riesgo: {payload.score}</p>
      {payload.items.length === 0 ? (
        <p>Sin items críticos</p>
      ) : (
        <ul className="risk-tooltip__items">
          {payload.items.map((item) => (
            <li key={item.id}>{item.descripcion}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
