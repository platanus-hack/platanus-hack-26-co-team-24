import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { putAvatar } from '../api';
import { PALETTE, SPRITE_W, SPRITE_H } from '../game/palette';
import { loadAvatar, saveAvatar, CUERPOS, PEINADOS, ROPAS, PALETAS } from '../avatarStorage';
import type { AvatarConfig } from '../types';
import './ui.css';

const LABELS = {
  cuerpo: { light: 'Claro', dark: 'Oscuro' },
  peinado: { short: 'Corto', long: 'Largo' },
  ropa: { shirt: 'Camisa', suit: 'Traje' },
} as const;

const DEFAULT_CONFIG: AvatarConfig = { cuerpo: 'light', peinado: 'short', ropa: 'shirt', paleta: 'blue' };

const toHex = (n: number) => '#' + n.toString(16).padStart(6, '0');

// Tinta un frame (fila 0 = de frente) por multiplicación, recortado a la
// silueta original vía destination-in.
function tintedFrame(img: HTMLImageElement, sx: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, 0, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SPRITE_W, SPRITE_H);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, sx, 0, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H);
  return c;
}

function loadImg(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

// Editor de avatar: 3 selects nativos + 6 swatches de color (radiogroup) +
// preview animado (32x52 a 4x, es decir 128x208) en canvas, compuesto de las
// 3 capas de Character.ts, con la ropa tintada por PALETTE.
export function AvatarEditor() {
  // El localStorage manda en ambos modos: P3 todavía no tiene `PUT /avatar`,
  // así que el avatar guardado aquí es el único que existe (y es el que
  // `OfficeScene` reaplica al usuario demo al spawnear).
  const [cfg, setCfg] = useState<AvatarConfig>(
    () => loadAvatar() ?? DEFAULT_CONFIG,
  );
  const [status, setStatus] = useState<'saved' | 'error' | null>(null);
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
      ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
      const sx = frameRef.current * SPRITE_W; // fila 0 = frente; 3 poses
      ctx.drawImage(bodyImg, sx, 0, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H);
      ctx.drawImage(tintedFrame(clothesImg, sx, color), 0, 0);
      ctx.drawImage(hairImg, sx, 0, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H);
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
      setStatus('saved');
    } catch (err) {
      console.error('putAvatar', err);
      setStatus('error');
    }
    setTimeout(() => setStatus(null), 2500);
  }

  function field<K extends 'cuerpo' | 'peinado' | 'ropa'>(key: K, label: string, options: readonly AvatarConfig[K][]) {
    return (
      <label className="avatar-field">
        <span className="avatar-field__label">{label}</span>
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

  function selectPaleta(index: number) {
    const opt = PALETAS[(index + PALETAS.length) % PALETAS.length];
    setCfg((c) => ({ ...c, paleta: opt }));
    swatchRefs.current[PALETAS.indexOf(opt)]?.focus();
  }

  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = PALETAS.indexOf(cfg.paleta);

  function onSwatchKeyDown(e: KeyboardEvent, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      selectPaleta(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      selectPaleta(index - 1);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setCfg((c) => ({ ...c, paleta: PALETAS[index] }));
    }
  }

  return (
    <div className="avatar-page">
      <div className="avatar-panel">
        <div className="avatar-panel__header">
          <h1>TU AVATAR</h1>
          {status && (
            <span
              className={`avatar-chip ${status === 'saved' ? 'avatar-chip--saved' : 'avatar-chip--error'}`}
            >
              {status === 'saved' ? 'GUARDADO ✓' : 'ERROR AL GUARDAR'}
            </span>
          )}
        </div>

        <div className="avatar-panel__body">
          <div className="avatar-preview-box">
            <canvas
              ref={canvasRef}
              width={SPRITE_W}
              height={SPRITE_H}
              className="avatar-preview-canvas"
            />
          </div>

          <div className="avatar-fields">
            {field('cuerpo', 'Cuerpo', CUERPOS)}
            {field('peinado', 'Peinado', PEINADOS)}
            {field('ropa', 'Ropa', ROPAS)}

            <div className="avatar-field">
              <span className="avatar-field__label">Color</span>
              <div className="avatar-swatches" role="radiogroup" aria-label="Color">
                {PALETAS.map((opt, i) => (
                  <button
                    key={opt}
                    ref={(el) => {
                      swatchRefs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={cfg.paleta === opt}
                    aria-label={opt}
                    tabIndex={i === activeIndex ? 0 : -1}
                    className={`avatar-swatch ${cfg.paleta === opt ? 'avatar-swatch--active' : ''}`}
                    style={{ background: toHex(PALETTE[opt]) }}
                    onClick={() => setCfg((c) => ({ ...c, paleta: opt }))}
                    onKeyDown={(e) => onSwatchKeyDown(e, i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="avatar-actions">
          <button type="button" className="avatar-btn avatar-btn--primary" onClick={handleSave}>
            GUARDAR
          </button>
          <Link to="/oficina" className="avatar-btn avatar-btn--go">
            IR A LA OFICINA ▶
          </Link>
        </div>
      </div>
    </div>
  );
}
