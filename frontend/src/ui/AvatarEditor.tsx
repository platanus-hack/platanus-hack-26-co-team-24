import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { putAvatar } from '../api';
import { PALETTE } from '../game/palette';
import { loadAvatar, saveAvatar, CUERPOS, PEINADOS, ROPAS, PALETAS } from '../avatarStorage';
import type { AvatarConfig } from '../types';
import './ui.css';

const LABELS = {
  cuerpo: { light: 'Claro', dark: 'Oscuro' },
  peinado: { short: 'Corto', long: 'Largo' },
  ropa: { shirt: 'Camisa', suit: 'Traje' },
  paleta: { blue: 'Azul', red: 'Rojo', green: 'Verde', yellow: 'Amarillo', purple: 'Morado', gray: 'Gris' },
} as const;

const DEFAULT_CONFIG: AvatarConfig = { cuerpo: 'light', peinado: 'short', ropa: 'shirt', paleta: 'blue' };

const toHex = (n: number) => '#' + n.toString(16).padStart(6, '0');

// Tinta un frame (fila 0 = mirando abajo) por multiplicación, recortado a la
// silueta original vía destination-in.
function tintedFrame(img: HTMLImageElement, sx: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 24;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, sx, 0, 16, 24, 0, 0, 16, 24);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, 24);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, sx, 0, 16, 24, 0, 0, 16, 24);
  return c;
}

function loadImg(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

// Editor de avatar: 4 selects nativos + preview animado (16x24 a 6x) en
// canvas, compuesto de las 3 capas LPC de Character.ts, ropa tintada por PALETTE.
export function AvatarEditor() {
  // El localStorage manda en ambos modos: P3 todavía no tiene `PUT /avatar`,
  // así que el avatar guardado aquí es el único que existe (y es el que
  // `OfficeScene` reaplica al usuario demo al spawnear).
  const [cfg, setCfg] = useState<AvatarConfig>(
    () => loadAvatar() ?? DEFAULT_CONFIG,
  );
  const [status, setStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    const bodyImg = loadImg(`/assets/sprites/char_body_${cfg.cuerpo}.png`);
    const hairImg = loadImg(`/assets/sprites/char_hair_${cfg.peinado}.png`);
    const clothesImg = loadImg(`/assets/sprites/char_clothes_${cfg.ropa}.png`);
    const color = toHex(PALETTE[cfg.paleta]);

    const draw = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 16, 24);
      const sx = frameRef.current * 16; // fila 0 = down; 3 poses de caminata
      ctx.drawImage(bodyImg, sx, 0, 16, 24, 0, 0, 16, 24);
      ctx.drawImage(tintedFrame(clothesImg, sx, color), 0, 0);
      ctx.drawImage(hairImg, sx, 0, 16, 24, 0, 0, 16, 24);
    };

    let ready = 0;
    const onLoad = () => {
      // Un cfg nuevo puede llegar antes de que las imágenes del cfg
      // anterior terminen de cargar; ese onload ya no debe pintar nada.
      if (cancelled) return;
      if (++ready === 3) {
        loaded = true;
        draw();
      }
    };
    bodyImg.onload = onLoad;
    hairImg.onload = onLoad;
    clothesImg.onload = onLoad;

    const interval = setInterval(() => {
      // Sin las 3 capas cargadas, tintedFrame() con un clothesImg
      // incompleto no recorta nada (destination-in no-opea) y se ve un
      // bloque sólido del color; esperamos a que las 3 estén listas.
      if (!loaded) return;
      frameRef.current = (frameRef.current + 1) % 3;
      draw();
    }, 200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cfg]);

  async function handleSave() {
    try {
      await putAvatar(cfg);
      saveAvatar(cfg);
      setStatus('Guardado ✓');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Error al guardar');
    }
    setTimeout(() => setStatus(null), 2000);
  }

  function field<K extends keyof AvatarConfig>(key: K, label: string, options: readonly AvatarConfig[K][]) {
    return (
      <label className="avatar-field">
        {label}
        <select
          value={cfg[key]}
          onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value as AvatarConfig[K] }))}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {(LABELS[key] as Record<string, string>)[opt]}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="avatar-page">
      <div className="avatar-panel">
        <h1>Tu avatar</h1>
        <div className="avatar-preview-box">
          <canvas ref={canvasRef} width={16} height={24} className="avatar-preview-canvas" />
        </div>
        {field('cuerpo', 'Cuerpo', CUERPOS)}
        {field('peinado', 'Peinado', PEINADOS)}
        {field('ropa', 'Ropa', ROPAS)}
        {field('paleta', 'Color', PALETAS)}
        <div className="avatar-actions">
          <button type="button" onClick={handleSave}>
            Guardar
          </button>
          <Link to="/oficina">Ir a la oficina</Link>
        </div>
        {status && <p className="avatar-status">{status}</p>}
      </div>
    </div>
  );
}
