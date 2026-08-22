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
  impacto: { tareas: number; dias_recuperacion: number; score: number };
  playbook_md: string;
}
