// Tipos calcados del contrato v1 (README.md, sección "Contratos v1")

export interface AvatarConfig {
  cuerpo: 'light' | 'dark';
  peinado: 'short' | 'long';
  ropa: 'shirt' | 'suit';
  paleta: 'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'gray';
}

export interface Person {
  id: string;
  nombre: string;
  rol: string;
  desk: number; // índice de escritorio 0-8
  avatar_config: AvatarConfig;
}

export interface Oficina {
  office: { id: string; nombre: string };
  people: Person[];
  // Puntaje de resiliencia del equipo (0-100). Opcional: el HUD lo oculta si
  // falta (p. ej. un backend viejo sin `resiliencia_equipo`).
  resiliencia?: number;
  // Delta mostrado junto al puntaje (mock únicamente; P3 no lo manda).
  resiliencia_delta?: number;
}

export interface ItemCritico {
  id: string;
  tipo: string;
  descripcion: string;
}

export interface RiskScore {
  person_id: string;
  score: number;
  items_criticos: ItemCritico[];
}

export interface Riesgo {
  scores: RiskScore[];
}

export interface Scenario {
  id: string;
  tipo: 'persona' | 'infra' | 'fisica';
  nombre: string;
  descripcion: string;
  requiere_persona: boolean;
}

export interface SimulationResult {
  scenario_id: string;
  person_id?: string;
  items_huerfanos: ItemCritico[];
  // P3 manda `impacto` como frase ("3 elemento(s) sin dueño..."); el mock
  // trae además las métricas numéricas. Todo salvo `tareas` es opcional y
  // `ResultPanel` oculta lo que falte.
  impacto: {
    tareas: number;
    dias_recuperacion?: number;
    score?: number;
    texto?: string;
  };
  playbook_md: string;
}
