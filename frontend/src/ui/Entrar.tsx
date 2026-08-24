// Pantalla de entrada. Un solo camino: Google con correo de la empresa.
//
// Es también la página de retorno del OAuth: Supabase devuelve aquí con el
// token en el fragmento de la URL, así que al montar hay que mirar si venimos
// de allá antes de pintar el botón.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, IS_MOCK } from '../api';
import { haySesion, retornoDeGoogle, salir, urlLoginGoogle, yo } from '../sesion';
import './ui.css';

export function Entrar() {
  const navegar = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(!IS_MOCK);

  useEffect(() => {
    if (IS_MOCK || !API_BASE) return;
    const vuelta = retornoDeGoogle();
    if (vuelta.error) {
      setError(vuelta.error);
      setVerificando(false);
      return;
    }
    // Sin token guardado no hay nada que verificar: a pedir el login.
    if (!vuelta.token && !haySesion()) {
      setVerificando(false);
      return;
    }
    // El dominio lo decide el servidor, no el navegador: si el correo no es de
    // la casa, `/usuarios/me` responde 403 y aquí se ve el motivo.
    yo(API_BASE)
      .then(() => navegar('/oficina', { replace: true }))
      .catch((e) => {
        salir();
        setError(e instanceof Error ? e.message : 'No se pudo entrar.');
        setVerificando(false);
      });
  }, [navegar]);

  // Sin backend no hay a quién pedirle sesión: el juego corre con mocks.
  if (IS_MOCK) {
    return (
      <div className="entrar">
        <div className="entrar-caja">
          <h1>Bus Factor HQ</h1>
          <p className="entrar-nota">
            Modo demo sin servidor: datos de ejemplo, nada del equipo real.
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
      <div className="entrar-caja">
        <h1>Bus Factor HQ</h1>
        <p className="entrar-nota">Acceso solo para cuentas @inerxia.co.</p>

        {error && (
          <p className="entrar-error" role="alert">
            {error}
          </p>
        )}

        {verificando ? (
          <p className="entrar-nota">Un momento…</p>
        ) : (
          <a className="entrar-google" href={urlLoginGoogle(API_BASE!)}>
            Entrar con Google
          </a>
        )}
      </div>
    </div>
  );
}
