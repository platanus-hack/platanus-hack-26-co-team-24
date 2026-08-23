// Pantalla de entrada. Un solo formulario que hace login o registro según la
// pestaña, porque `POST /auth/registro` ya devuelve sesión: registrarse y
// entrar son el mismo paso.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, IS_MOCK } from '../api';
import { entrar, registrar } from '../sesion';
import './ui.css';

type Modo = 'entrar' | 'crear';

export function Entrar() {
  const navegar = useNavigate();
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const creando = modo === 'crear';

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!API_BASE) return;
    setError(null);
    setEnviando(true);
    try {
      await (creando
        ? registrar(API_BASE, email.trim(), password, nombre.trim())
        : entrar(API_BASE, email.trim(), password));
      navegar('/oficina', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar.');
    } finally {
      setEnviando(false);
    }
  }

  // Sin backend no hay a quién pedirle sesión: el juego corre offline igual.
  if (IS_MOCK) {
    return (
      <div className="entrar">
        <div className="entrar-caja">
          <h1>Bus Factor HQ</h1>
          <p className="entrar-nota">
            Modo demo sin servidor. Tu avatar se guarda solo en este navegador.
          </p>
          <button type="button" onClick={() => navegar('/oficina', { replace: true })}>
            Entrar a la oficina
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="entrar">
      <form className="entrar-caja" onSubmit={enviar}>
        <h1>Bus Factor HQ</h1>
        <p className="entrar-nota">
          Tu avatar y tu personaje quedan en tu cuenta: los encuentras desde cualquier equipo.
        </p>

        <div className="entrar-pestanas" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!creando}
            className={!creando ? 'activa' : ''}
            onClick={() => setModo('entrar')}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={creando}
            className={creando ? 'activa' : ''}
            onClick={() => setModo('crear')}
          >
            Crear cuenta
          </button>
        </div>

        {creando && (
          <label className="entrar-campo">
            Nombre
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
        )}

        <label className="entrar-campo">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label className="entrar-campo">
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={creando ? 'new-password' : 'current-password'}
          />
        </label>

        {error && (
          <p className="entrar-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={enviando}>
          {enviando ? 'Un momento…' : creando ? 'Crear cuenta y entrar' : 'Entrar'}
        </button>

        <button
          type="button"
          className="entrar-invitado"
          onClick={() => navegar('/oficina', { replace: true })}
        >
          Mirar la oficina sin cuenta
        </button>
      </form>
    </div>
  );
}
