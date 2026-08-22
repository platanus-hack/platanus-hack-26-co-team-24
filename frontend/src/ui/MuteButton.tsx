import { useState } from 'react';
import { isMuted, setMuted } from '../audio';
import './ui.css';

/** Botón flotante arriba-izquierda que silencia/reactiva la música y los
 * efectos de sonido (persistido en `localStorage.muted`). */
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
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
