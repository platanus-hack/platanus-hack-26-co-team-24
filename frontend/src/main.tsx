import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { GameCanvas } from './ui/GameCanvas';
import { AvatarEditor } from './ui/AvatarEditor';
import { Entrar } from './ui/Entrar';
import { Conexiones } from './ui/Conexiones';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/oficina" element={<GameCanvas />} />
        <Route path="/avatar" element={<AvatarEditor />} />
        <Route path="/conexiones" element={<Conexiones />} />
        <Route path="/" element={<Navigate to="/oficina" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
