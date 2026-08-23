import { useState } from 'react';
import { isMuted, setMuted } from '../audio';
import './ui.css';

/** Caja mute/CHIPTUNE de la esquina superior izquierda del HUD (montada
 * dentro de `Hud.tsx`). Silencia/reactiva música y efectos, persistido en
 * `localStorage.muted`. */
export function MuteButton() {
  const [muted, setMutedState] = useState(isMuted());

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <button
      type="button"
      className="mute-btn"
      aria-label={muted ? 'Activar sonido' : 'Silenciar'}
      onClick={toggle}
    >
      <span className="mute-btn__icon">{muted ? '🔇' : '🔊'}</span>
      <span>{muted ? 'SILENCIO' : 'CHIPTUNE'}</span>
    </button>
  );
}
