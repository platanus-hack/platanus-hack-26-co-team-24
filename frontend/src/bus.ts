import Phaser from 'phaser';

// Bus de eventos compartido entre la escena de Phaser y la UI de React.
// Eventos:
//  - 'scenario:start'  ({ scenario_id, person_id? })            — la UI pide correr un escenario de simulación.
//  - 'scenario:result' ({ result: SimulationResult, ms: number }) — la simulación terminó con éxito; `ms` es cuánto tardó `onScenarioStart` (para el chip "GENERADO EN X,X S").
//  - 'scenario:error'  (message: string)                        — la simulación falló.
//  - 'scenario:restore'()                                       — deshacer el escenario y restaurar la oficina.
//  - 'person:click'    ({ id, nombre, rol, score, items })       — el usuario clickeó un personaje en el mapa.
//  - 'console:open'    ()                                        — se clickeó la consola arcade en el mapa.
//  - 'room:rect'       ({ x, y, w, h, zoom })                    — la sala cambió de sitio/tamaño dentro del canvas (resize).
// Los handlers se conectan en tareas posteriores (Fase 3+); este archivo solo
// crea el emisor compartido.
export const bus = new Phaser.Events.EventEmitter();
