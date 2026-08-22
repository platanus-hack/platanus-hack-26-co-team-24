# 🎮 P4 — Frontend Juego (la oficina viva)
### Bus Factor HQ · Documento individual de trabajo

**Tu misión:** construir lo que el jurado va a recordar: una oficina pixel art viva, con movimiento limpio, donde las emergencias se sienten. Tu prioridad absoluta es **calidad de movimiento sobre cantidad de features**. Un solo escenario impecable vale más que siete a los tirones.

---

## 1. Tu contrato con el equipo

- **Consumes SOLO la API de P3** (`GET /oficina`, `GET /riesgo`, `GET /escenarios`, `POST /simular`, `PUT /avatar`). Jamás llamas a Slack, Claude ni Supabase directo.
- **Entregas:** la escena del juego embebida en la app React (ruta `/oficina`), y el editor de avatar (ruta `/avatar`).
- Acuerda con P3 el JSON de `avatar_config` en la Hora 0 (tú lo defines, él lo guarda): `{ cuerpo, peinado, ropa, paleta }`.

## 2. Orden de trabajo

### Fase 0 (Hora 0-1): contratos + assets
Mientras se definen esquemas, **descarga y organiza los assets** (Kenney interiores/oficina + LPC personajes por capas + 4-5 sonidos). Tener los assets listos en la Hora 1 te ahorra la peor pérdida de tiempo de un frontend de juego.

### Fase 1 (Hora 1-4): la oficina estática
1. Proyecto Phaser 3 dentro de React (`/frontend`, componente que monta el canvas; comunica React⇄Phaser con un event emitter simple).
2. Tilemap de la oficina en **Tiled** (editor gratuito): piso, paredes, 9 escritorios, sala de juntas, zona de café. Exporta JSON y cárgalo en Phaser.
3. Coloca los **objetos esenciales** como sprites con animación de 2-3 frames: servidor GitHub (luces parpadeando), pantalla de Meet en la sala, computadores encendidos, cafetera, lámparas.
4. Cámara con paneo suave (tween de `camera.scrollX/Y`) recorriendo la oficina en idle.

### Fase 2 (Hora 3-6): personajes vivos
1. Spawn de los 9 avatares desde `GET /oficina` (API falsa de P3 — ya está viva desde la Hora 3).
2. **Movimiento en grilla con pathfinding** (plugin `easystarjs`): camina a puntos de interés (su escritorio, café, sala) con rutas que esquivan muebles.
3. Animaciones: caminar 4 direcciones, sentarse, teclear (loop de 2 frames), idle.
4. **Comportamiento ambiental con una máquina de estados simple por personaje:** `trabajando (70%) → café (10%) → reunión (15%) → caminar (5%)`, con timers aleatorios. Esto es lo que hace que la oficina "funcione sola".
5. **Limpieza de movimiento (tu obsesión):** easing en todos los tweens, velocidad constante al caminar, giro de sprite antes de moverse, nada de teleports. Si algo se ve brusco, se arregla antes de seguir.

### Fase 3 (Hora 5-8): riesgo visible + editor de avatar
1. De `GET /riesgo`: aura/outline bajo cada personaje — verde (0-40), amarillo (41-70), **rojo pulsante** (71-100). Tooltip al hacer clic: sus items críticos.
2. **Editor de avatar** (`/avatar`): pantalla React (no Phaser) con las capas LPC superpuestas como imágenes; selectores de cuerpo/peinado/ropa/paleta; preview animado; guarda con `PUT /avatar`. Simple y delicioso — 3-4 horas máximo.

### Fase 4 (Hora 8-14): escenarios de emergencia
Implementa los efectos EN ESTE ORDEN (= orden del demo):
1. **Renuncia/ausencia** ⭐: el avatar guarda cosas (animación sentado→de pie), camina a la puerta, sale; su escritorio se pinta gris; los items huérfanos flotan como iconos "?" sobre el escritorio. Luego React muestra el panel con el resultado de `POST /simular`.
2. **Caída de GitHub**: partículas de humo sobre el servidor, luces rojas, los devs se levantan y caminan confundidos hacia él.
3. **Robo del PC del CTO**: el sprite del PC desaparece, luz roja giratoria (círculo con alpha rotando), sonido de alarma.
4. **Apagón**: overlay oscuro con "agujeros" de luz en las pantallas (máscara).
5. **Oficina se cae**: `camera.shake()`, partículas, todos los personajes pathfinding hacia la salida.
6. Los demás escenarios: aparecen en la consola arcade como opciones aunque su animación sea genérica (parpadeo de alerta + panel).
7. **Consola arcade**: un objeto en la esquina; al hacer clic abre el menú de escenarios (UI React sobre el canvas).

### Fase 5 (Hora 14-16): API real — Cita H4 con P3
Cambia la URL base a la API real. Como el contrato es idéntico, debería ser un cambio de configuración. Reporta cualquier fricción a P3 (él cede, tú no).

## 3. Qué tener en cuenta

- **Resolución y pixel art:** `pixelArt: true` en la config de Phaser, zoom entero (x2/x3), nada de escalados fraccionarios (se ve borroso).
- **60 fps o nada:** si algo tironea, reduce partículas y personajes animados fuera de cámara.
- **Sonido:** música chiptune baja de fondo + efectos por escenario. Botón de mute visible (los jurados lo agradecen).
- El estado del juego lo manda el servidor: tú animas lo que la API dice, no inventes estado propio (evita desincronía con el dashboard de P5).
- Commitea el proyecto con assets desde el inicio: si tu máquina falla, cualquiera lo corre.

## 4. Qué probar (tu checklist)

- [ ] Hora 4: oficina estática con objetos animados corre a 60 fps
- [ ] Hora 6: 9 personajes deambulan sin atravesar muebles ni superponerse feo
- [ ] Los colores de riesgo cambian si P3 cambia los scores (probar con la API falsa)
- [ ] Editor de avatar: crear avatar → recargar página → el personaje aparece con ese avatar
- [ ] Escenario "renuncia" completo: animación → panel con playbook, 3 veces seguidas sin bugs
- [ ] **Cita H4:** todo lo anterior contra la API real
- [ ] Corre en el proyector/pantalla del evento (resolución distinta a tu laptop — pruébalo)

## 5. Prioridades si falta tiempo

1. 🥇 Oficina viva con movimiento limpio + riesgo en colores
2. 🥈 Escenario "renuncia" impecable (es EL momento del demo)
3. 🥉 Editor de avatar (momento encantador, pero recortable a "elegir entre 6 presets")
4. 🏅 GitHub caído + robo del PC
5. ❌ Apagón/incendio con física elaborada, minimapa, día/noche — solo si sobra vida
