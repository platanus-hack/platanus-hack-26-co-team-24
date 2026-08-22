import Phaser from 'phaser';

// Bus de eventos compartido entre la escena de Phaser y la UI de React.
// Eventos:
//  - 'scenario:start'  (scenario: Scenario, personId?: string) — la UI pide correr un escenario de simulación.
//  - 'scenario:result' (result: SimulationResult)               — la simulación terminó con éxito.
//  - 'scenario:error'  (error: Error)                           — la simulación falló.
//  - 'person:click'    (personId: string)                       — el usuario clickeó un personaje en el mapa.
// Los handlers se conectan en tareas posteriores (Fase 3+); este archivo solo
// crea el emisor compartido.
export const bus = new Phaser.Events.EventEmitter();
