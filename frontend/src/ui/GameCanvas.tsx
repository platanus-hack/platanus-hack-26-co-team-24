import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { config } from '../game/config';
import { bus } from '../bus';
import { RiskTooltip } from './RiskTooltip';
import { ArcadeConsole } from './ArcadeConsole';
import { ResultPanel } from './ResultPanel';
import { Hud } from './Hud';
import { unlock } from '../audio';
import './ui.css';

declare global {
  interface Window {
    __game?: Phaser.Game;
  }
}

/** Rectángulo que ocupa la sala dentro del canvas (que sí cubre toda la
 * ventana). Lo publica `OfficeScene.applyViewport` en cada resize. */
interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
}

export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<RoomRect | null>(null);

  useEffect(() => {
    const onRoom = (r: RoomRect) => setRoom(r);
    bus.on('room:rect', onRoom);
    const g = new Phaser.Game({ ...config, parent: ref.current! });
    if (import.meta.env.DEV) window.__game = g;
    // La oficina llena el viewport: mientras esté montada, la página no hace
    // scroll (ver src/index.css). El editor de avatar sí puede scrollear.
    document.body.classList.add('game-page');
    return () => {
      bus.off('room:rect', onRoom);
      document.body.classList.remove('game-page');
      if (import.meta.env.DEV && window.__game === g) delete window.__game;
      g.destroy(true);
    };
  }, []);

  // El HUD se ancla a las esquinas de la SALA, no a las del viewport: así la
  // composición del mockup (RESILIENCIA entre la sala Meet y el rack, consola
  // abajo-derecha) se mantiene con cualquier zoom.
  const overlayStyle = room
    ? { left: room.x, top: room.y, width: room.w, height: room.h }
    : { inset: 0 };

  return (
    <div className="game-root" onPointerDown={unlock}>
      <div ref={ref} className="game-canvas-host" />
      <div className="room-overlay" style={overlayStyle}>
        <Hud />
        <ArcadeConsole />
      </div>
      <RiskTooltip />
      <ResultPanel />
    </div>
  );
}
