import { useEffect, useState } from 'react';
import { bus } from '../bus';
import { getOficina } from '../api';
import type { ItemCritico } from '../types';
import type { CSSProperties } from 'react';
import { THEME } from '../game/palette';
import { riskLevel, type RiskLevel } from '../game/risk';
import { tipoChip, tipoChipColor } from './chips';
import './ui.css';

interface PersonClickPayload {
  id: string;
  nombre: string;
  rol: string;
  score: number;
  items: ItemCritico[];
}

const SCORE_COLOR: Record<RiskLevel, string> = {
  bajo: THEME.lima,
  medio: THEME.oro,
  alto: THEME.rojo,
};

// ponytail: el contrato v1 no manda género; en vez de un mapa persona ->
// pronombre (o pedirle un campo nuevo a P3), basta con adivinar por la
// terminación del nombre para el título "SOLO ELLA/ÉL SABE HACER ESTO".
const posesivo = (nombre: string): 'ELLA' | 'ÉL' =>
  nombre.trim().toLowerCase().endsWith('a') ? 'ELLA' : 'ÉL';

// El mapeo tipo -> etiqueta/color vive en `./chips` (compartido con
// ResultPanel.tsx). Fidelidad literal a guia-visual.dc.html (sección 07):
// cada tipo conocido tiene su propio color de chip (sin borde); los tipos
// sin receta (conocimiento, resumen, item...) caen al chip neutro LINE ya
// definido en `.risk-tooltip__chip` (bg LINE + borde 1px #6E4FA8).
const tipoChipStyle = (tipo: string): CSSProperties | undefined => {
  const c = tipoChipColor(tipo);
  return c ? { ...c, border: 'none' } : undefined;
};

/** Tooltip flotante (esquina superior derecha, debajo de la tarjeta
 * RESILIENCIA) que muestra el riesgo y los items críticos del personaje
 * clickeado en el mapa. Se suscribe a `bus` ('person:click') y se cierra con
 * Escape o clic fuera. */
export function RiskTooltip() {
  const [payload, setPayload] = useState<PersonClickPayload | null>(null);
  const [officeName, setOfficeName] = useState('');

  useEffect(() => {
    getOficina()
      .then((o) => setOfficeName(o.office.nombre))
      .catch((err) => console.error('getOficina', err));
  }, []);

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
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.risk-tooltip'))
        setPayload(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [payload]);

  if (!payload) return null;

  const level = riskLevel(payload.score);

  return (
    <div className="risk-tooltip">
      <div className="risk-tooltip__header">
        <div>
          <p className="risk-tooltip__name">{payload.nombre}</p>
          <p className="risk-tooltip__rol">
            {payload.rol} · OFICINA {officeName.toUpperCase()}
          </p>
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

      <div className="risk-tooltip__score-row">
        <p
          className="risk-tooltip__score"
          style={{ color: SCORE_COLOR[level] }}
        >
          {payload.score}
        </p>
        <span className="risk-tooltip__score-label">riesgo</span>
      </div>

      <p className="risk-tooltip__section-title">
        SOLO {posesivo(payload.nombre)} SABE HACER ESTO
      </p>
      {payload.items.length === 0 ? (
        <p className="risk-tooltip__empty">Sin items críticos</p>
      ) : (
        <ul className="risk-tooltip__items">
          {payload.items.map((item) => (
            <li key={item.id} className="risk-tooltip__item">
              <span
                className="risk-tooltip__chip"
                style={tipoChipStyle(item.tipo)}
              >
                {tipoChip(item.tipo)}
              </span>
              <span className="risk-tooltip__desc">{item.descripcion}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
