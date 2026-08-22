import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { GameCanvas } from './ui/GameCanvas';
import { AvatarEditor } from './ui/AvatarEditor';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/oficina" element={<GameCanvas />} />
        <Route path="/avatar" element={<AvatarEditor />} />
        <Route path="/" element={<Navigate to="/oficina" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
