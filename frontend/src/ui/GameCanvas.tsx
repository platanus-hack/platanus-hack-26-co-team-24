import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { config } from '../game/config';
import { RiskTooltip } from './RiskTooltip';
import { ArcadeConsole } from './ArcadeConsole';
import { ResultPanel } from './ResultPanel';
import { MuteButton } from './MuteButton';
import { unlock } from '../audio';

declare global {
  interface Window {
    __game?: Phaser.Game;
  }
}

export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const g = new Phaser.Game({ ...config, parent: ref.current! });
    if (import.meta.env.DEV) window.__game = g;
    return () => {
      if (import.meta.env.DEV && window.__game === g) delete window.__game;
      g.destroy(true);
    };
  }, []);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100vh' }}
      onPointerDown={unlock}
    >
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
      <MuteButton />
      <RiskTooltip />
      <ArcadeConsole />
      <ResultPanel />
    </div>
  );
}
