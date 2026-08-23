import { useEffect, useState } from 'react';
import { getOficina } from '../api';
import type { Oficina } from '../types';
import { MuteButton } from './MuteButton';
import './ui.css';

/** HUD permanente sobre el canvas: caja mute + tarjeta "OFICINA <NOMBRE>"
 * arriba-izquierda, tarjeta RESILIENCIA arriba-derecha. Un único fetch de
 * `getOficina()` (cacheado por el navegador/mock) alimenta ambas. */
export function Hud() {
  const [oficina, setOficina] = useState<Oficina | null>(null);

  useEffect(() => {
    getOficina()
      .then(setOficina)
      .catch((err) => console.error('getOficina', err));
  }, []);

  const nombre = oficina?.office.nombre ?? '';
  const personas = oficina?.people.length ?? 0;
  const resiliencia = oficina?.resiliencia;
  const delta = oficina?.resiliencia_delta;

  return (
    <>
      <div className="hud-topleft">
        <MuteButton />
        <div className="hud-office">
          <div className="hud-office__swatch" />
          <div className="hud-office__text">
            <span className="hud-office__label">
              OFICINA {nombre.toUpperCase()}
            </span>
            <span className="hud-office__count">{personas} PERSONAJES</span>
          </div>
        </div>
      </div>

      {resiliencia !== undefined && (
        <div className="hud-resiliencia">
          <span className="hud-resiliencia__label">RESILIENCIA</span>
          {/* P3 manda la resiliencia con decimales (28.6): la tarjeta es de
              3 dígitos, así que se redondea al pintarla. */}
          <span className="hud-resiliencia__value">
            {Math.round(resiliencia)}
          </span>
          {delta !== undefined && (
            <span className="hud-resiliencia__delta">▲{delta}</span>
          )}
        </div>
      )}
    </>
  );
}
