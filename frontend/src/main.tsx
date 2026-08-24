import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { GameCanvas } from './ui/GameCanvas';
import { AvatarEditor } from './ui/AvatarEditor';
import { Entrar } from './ui/Entrar';
import { Conexiones } from './ui/Conexiones';
import { IS_MOCK } from './api';
import { haySesion } from './sesion';

/** Sin sesión no se pinta nada del equipo: al login. Que el token sirva y sea
 * del dominio lo decide el servidor en cada petición; esto solo evita mostrar
 * una oficina vacía a quien todavía no entró. */
function Protegida({ children }: { children: React.ReactElement }) {
  return IS_MOCK || haySesion() ? children : <Navigate to="/entrar" replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route
          path="/oficina"
          element={
            <Protegida>
              <GameCanvas />
            </Protegida>
          }
        />
        <Route
          path="/avatar"
          element={
            <Protegida>
              <AvatarEditor />
            </Protegida>
          }
        />
        <Route
          path="/conexiones"
          element={
            <Protegida>
              <Conexiones />
            </Protegida>
          }
        />
        <Route path="/" element={<Navigate to="/oficina" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
