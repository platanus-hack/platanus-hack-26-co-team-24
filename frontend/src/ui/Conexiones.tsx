// Pantalla `/conexiones`: donde el usuario le da a Bus Factor HQ algo que leer.
//
// Hasta aquí el juego corre sobre el dataset del equipo. Esta es la pantalla
// donde la promesa del pitch —"cada quien conecta sus propias fuentes"— deja
// de ser una lámina. Por eso no es un formulario de ajustes: es la sala de
// máquinas del juego, con el mismo lenguaje synth dusk que la oficina.
//
// Tres decisiones que condicionan todo lo de abajo:
//
//  1. SIN SESIÓN no se muestra un formulario muerto ni se redirige en
//     silencio: conectar una fuente escribe en la cuenta de alguien, y sin
//     cuenta no hay dónde escribir. Se explica qué se gana y se manda a
//     `/entrar`. Redirigir sin decir nada deja al usuario sin saber por qué
//     se movió la pantalla.
//
//  2. EN MODO MOCK (sin `VITE_API_URL`) no se toca la red ni una vez. El modo
//     mock es el plan B del demo —si la API se cae en el escenario, se vacía
//     la variable y todo sigue— así que una pantalla que se cuelgue esperando
//     un `fetch` que nunca responde sería exactamente el fallo que el plan B
//     existe para evitar. Se muestran las fuentes del dataset de demo, ya
//     cargadas, sin botones que no llevan a ninguna parte.
//
//  3. EL BACKEND SE ESTÁ ESCRIBIENDO EN PARALELO. Cada endpoint puede
//     devolver 404 hoy y 200 en una hora. El estado inicial degrada a "sin
//     conectar" con un aviso discreto en vez de a una pantalla vacía, y cada
//     acción falla con el motivo escrito en pantalla y el botón otra vez
//     disponible. Nada de esto bloquea el resto de la pantalla: que Slack no
//     responda no puede impedir subir una transcripción.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IS_MOCK } from '../api';
import { haySesion } from '../sesion';
import {
  SIN_CONECTAR,
  estadoFuentes,
  leerRetornoOAuth,
  sincronizarSlack,
  subirTranscripciones,
  volverAlDemo,
  urlAutorizacionSlack,
} from '../conexiones';
import type {
  EstadoFuente,
  EstadoFuentes,
  Fuente,
  RetornoOAuth,
} from '../conexiones';
import './ui.css';

/** Un archivo de transcripción grande (una reunión larga son ~100 KB) cabe de
 * sobra en 2 MB. El tope está para que arrastrar un vídeo o un ZIP por error
 * no congele la pestaña leyéndolo como texto ni reviente el POST. */
const MAX_BYTES = 2 * 1024 * 1024;

/** En cuanto entra un dato real, el backend deja de contar el dataset de
 * ejemplo: no los mezcla, y hace bien —atribuirle conocimiento inventado a una
 * persona real es peor que no tener datos—. Pero eso significa que un clic en
 * "Sincronizar" durante un ensayo cambia la oficina del demo por la de quien
 * hizo clic. Se avisa ANTES, junto al botón, no después en un mensaje de
 * éxito. */
const CONFIRMA_VOLVER_AL_DEMO =
  'Esto borra los datos ingeridos de toda la oficina y repuebla el equipo de ejemplo. ' +
  'Tu conexión de Slack se queda: puedes volver a sincronizar cuando quieras.\n\n¿Seguir?';

const AVISO_REEMPLAZA_DEMO =
  'Ojo: en cuanto entren tus datos, la oficina deja de mostrar el equipo de ejemplo y pasa a ser la tuya.';

const CHIP: Record<EstadoFuente, { texto: string; clase: string }> = {
  activa: { texto: 'Conectada', clase: 'fuente-chip--activa' },
  pendiente: { texto: 'Pendiente', clase: 'fuente-chip--pendiente' },
  sin_conectar: { texto: 'Sin conectar', clase: 'fuente-chip--off' },
};

type Ocupado = null | 'slack-oauth' | 'slack-sync' | 'drive' | 'reset';
type Mensaje = { tono: 'ok' | 'error'; texto: string } | null;

function textoError(e: unknown): string {
  return e instanceof Error ? e.message : 'Algo salió mal.';
}

/** Traduce la vuelta del OAuth a la frase que ve el usuario. Un "conectado"
 * sin siguiente paso deja la pantalla en punto muerto: el éxito dice qué
 * hacer ahora, y el fallo dice qué pasó. */
function mensajeDeRetorno(retorno: RetornoOAuth | null): Mensaje {
  if (!retorno) return null;
  const fuente = retorno.fuente === 'slack' ? 'Slack' : 'La fuente';
  return retorno.ok
    ? {
        tono: 'ok',
        texto: `${fuente} quedó conectado. Sincroniza para traer tus mensajes al mapa.`,
      }
    : {
        tono: 'error',
        texto: `${fuente} no se conectó: ${retorno.motivo ?? 'autorización cancelada'}.`,
      };
}

/** El botón dice cuántos archivos va a mandar: el input nativo de archivos ya
 * lista los nombres, pero a su lado, en gris del sistema y fácil de pasar por
 * alto. Aquí está en el sitio donde el usuario mira antes de pulsar. */
function etiquetaSubir(n: number): string {
  if (n === 0) return 'Subir transcripciones';
  return n === 1 ? 'Subir 1 transcripción' : `Subir ${n} transcripciones`;
}

/** Tarjeta de una fuente. La acción la pone quien la usa: las tres fuentes se
 * conectan de formas distintas y forzarlas al mismo botón sería mentir sobre
 * lo que hace cada una. */
function Tarjeta({
  titulo,
  marca,
  estado,
  descripcion,
  children,
}: {
  titulo: string;
  marca: string;
  estado: EstadoFuente;
  descripcion: string;
  children: React.ReactNode;
}) {
  const chip = CHIP[estado];
  return (
    <li className="fuente">
      <div className="fuente__cabecera">
        <span className="fuente__marca" aria-hidden="true">
          {marca}
        </span>
        <h2 className="fuente__titulo">{titulo}</h2>
        <span className={`fuente-chip ${chip.clase}`}>{chip.texto}</span>
      </div>
      <p className="fuente__desc">{descripcion}</p>
      <div className="fuente__accion">{children}</div>
    </li>
  );
}

export function Conexiones() {
  const navegar = useNavigate();

  // Vuelta del OAuth: el callback del backend redirige aquí con el resultado
  // en la query. Se lee UNA vez, al montar, y su resultado es el estado
  // inicial de la pantalla: así la fuente aparece conectada de inmediato, sin
  // esperar a que `GET /conexiones` lo confirme (puede tardar, o no existir
  // todavía). Leerlo en un efecto obligaría a un segundo render y a pintar
  // "sin conectar" durante un cuadro justo después de autorizar.
  const [retorno] = useState(() => leerRetornoOAuth(window.location.search));
  const [estado, setEstado] = useState<EstadoFuentes>(() =>
    retorno?.ok
      ? { ...SIN_CONECTAR, [retorno.fuente]: 'activa' }
      : SIN_CONECTAR,
  );
  const [mensaje, setMensaje] = useState<Mensaje>(() =>
    mensajeDeRetorno(retorno),
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [segundos, setSegundos] = useState(0);
  const [archivos, setArchivos] = useState<File[]>([]);
  const entradaRef = useRef<HTMLInputElement>(null);

  const sesion = haySesion();
  const puedeHablarConElServidor = !IS_MOCK && sesion;

  // La query ya se leyó: se limpia para que un F5 no repita el mensaje de "ya
  // quedó conectado" cuando el usuario vuelva mañana con la URL en el
  // historial.
  useEffect(() => {
    if (retorno) navegar('/conexiones', { replace: true });
  }, [retorno, navegar]);

  // Estado real de las fuentes. Si no se puede leer (endpoint todavía sin
  // desplegar, servidor dormido, sesión vencida) la pantalla NO se bloquea:
  // queda en "sin conectar" con el motivo a la vista, porque conectar por
  // primera vez es justo lo que se hace desde ese estado.
  useEffect(() => {
    if (!puedeHablarConElServidor) return;
    let vivo = true;
    estadoFuentes()
      .then(
        (e) =>
          vivo &&
          setEstado({
            ...e,
            // La fuente que acaba de volver del OAuth se queda conectada
            // aunque el servidor todavía no la liste (la escritura puede ir
            // por detrás del redirect): verla volver a "sin conectar" dos
            // segundos después de autorizarla haría pensar que no funcionó.
            ...(retorno?.ok ? { [retorno.fuente]: 'activa' as const } : {}),
          }),
      )
      .catch(
        (e) =>
          vivo &&
          setAviso(
            `No se pudo leer el estado de tus fuentes: ${textoError(e)}`,
          ),
      );
    return () => {
      vivo = false;
    };
  }, [puedeHablarConElServidor, retorno]);

  // La sincronización tarda de segundos a minutos. Un botón deshabilitado y
  // callado durante dos minutos se lee como "se colgó": el contador es la
  // prueba barata de que sigue trabajando. (El contador se pone a cero al
  // arrancar la sincronización, no aquí, para no encadenar renders.)
  useEffect(() => {
    if (ocupado !== 'slack-sync') return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [ocupado]);

  async function conectarSlack() {
    setMensaje(null);
    setOcupado('slack-oauth');
    try {
      // Redirección completa, no popup: el callback vuelve a esta misma ruta.
      window.location.assign(await urlAutorizacionSlack());
    } catch (e) {
      setMensaje({
        tono: 'error',
        texto: `No se pudo abrir la autorización de Slack: ${textoError(e)}`,
      });
      setOcupado(null);
    }
  }

  async function sincronizar() {
    // ponytail: se espera a que la petición responda; si el backend acaba
    // encolando la ingesta y contestando al instante, el "sincronizado" saldrá
    // antes de tiempo. La salida es un id de trabajo y un sondeo, cuando el
    // backend tenga cola de verdad.
    setMensaje(null);
    setSegundos(0);
    setOcupado('slack-sync');
    try {
      setMensaje({ tono: 'ok', texto: await sincronizarSlack() });
      setEstado((e) => ({ ...e, slack: 'activa' }));
    } catch (e) {
      setMensaje({
        tono: 'error',
        texto: `La sincronización falló: ${textoError(e)}`,
      });
    } finally {
      setOcupado(null);
    }
  }

  async function subir() {
    setMensaje(null);
    const grande = archivos.find((f) => f.size > MAX_BYTES);
    if (grande) {
      setMensaje({
        tono: 'error',
        texto: `"${grande.name}" pesa más de 2 MB: eso no es una transcripción.`,
      });
      return;
    }
    setOcupado('drive');
    try {
      const leidos = await Promise.all(
        archivos.map(async (f) => ({
          nombre: f.name,
          contenido: await f.text(),
        })),
      );
      setMensaje({ tono: 'ok', texto: await subirTranscripciones(leidos) });
      setEstado((e) => ({ ...e, drive: 'activa' }));
      setArchivos([]);
      if (entradaRef.current) entradaRef.current.value = '';
    } catch (e) {
      // Los archivos elegidos se quedan puestos: si falló el servidor, el
      // usuario reintenta con un clic en vez de volver a buscarlos en disco.
      setMensaje({
        tono: 'error',
        texto: `No se pudieron subir: ${textoError(e)}`,
      });
    } finally {
      setOcupado(null);
    }
  }

  async function restaurarDemo() {
    // `confirm()` nativo, y aquí SÍ: esto borra los datos ingeridos de toda la
    // oficina, no hace lo que el botón de al lado promete. Un diálogo por
    // hacer lo que pediste es ruido; uno antes de borrar lo de todos, no.
    if (!window.confirm(CONFIRMA_VOLVER_AL_DEMO)) return;
    setMensaje(null);
    setOcupado('reset');
    try {
      setMensaje({ tono: 'ok', texto: await volverAlDemo() });
      setEstado(SIN_CONECTAR);
    } catch (e) {
      setMensaje({
        tono: 'error',
        texto: `No se pudo volver al demo: ${textoError(e)}`,
      });
    } finally {
      setOcupado(null);
    }
  }

  // --- Modo demo: sin servidor no hay nada que conectar --------------------
  if (IS_MOCK) {
    // Las tres se pintan "conectada" porque en el demo lo están: el dataset de
    // ejemplo sale precisamente de Slack, Meet y GitHub. Marcarlas "sin
    // conectar" haría creer que falta un paso que no existe.
    return (
      <Marco
        nota="Modo demo sin servidor: la oficina corre con el dataset de ejemplo, ya cargado. Conectar tus propias fuentes necesita la API."
        estado={{ slack: 'activa', drive: 'activa', github: 'activa' }}
        piePorFuente="Datos de ejemplo, ya en el mapa."
      />
    );
  }

  // --- Sin sesión: hay dónde conectar, pero no a quién ---------------------
  if (!sesion) {
    return (
      <Marco
        nota="Tus fuentes viven en tu cuenta: lo que conectes te sigue a cualquier equipo. Entra y vuelve aquí."
        estado={SIN_CONECTAR}
        pie={
          <Link className="fuente-btn fuente-btn--primaria" to="/entrar">
            Entrar a tu cuenta ▶
          </Link>
        }
      />
    );
  }

  const slackConectado = estado.slack === 'activa';
  const sincronizando = ocupado === 'slack-sync';

  return (
    <div className="fuentes-page">
      <main className="fuentes-panel">
        <header className="fuentes-panel__header">
          <h1>Tus fuentes</h1>
          <Link className="fuentes-volver" to="/oficina">
            Ir a la oficina ▶
          </Link>
        </header>

        <p className="fuentes-intro">
          Bus Factor HQ solo sabe lo que le dejas leer. Cada fuente que conectes
          vuelve más real el mapa de quién sabe qué —y la emergencia que simulas
          después.
        </p>

        {aviso && (
          <p className="fuentes-aviso" role="status">
            {aviso}
          </p>
        )}

        {mensaje && (
          <p
            className={`fuentes-mensaje fuentes-mensaje--${mensaje.tono}`}
            role={mensaje.tono === 'error' ? 'alert' : 'status'}
          >
            {mensaje.texto}
          </p>
        )}

        <ul className="fuentes-lista">
          <Tarjeta
            titulo="Slack"
            marca="#"
            estado={estado.slack}
            descripcion="Los hilos donde se decide de verdad y las reglas que nadie escribió en la wiki."
          >
            {slackConectado ? (
              <>
                <button
                  type="button"
                  className="fuente-btn fuente-btn--primaria"
                  onClick={sincronizar}
                  disabled={ocupado !== null}
                >
                  {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
                </button>
                {sincronizando ? (
                  <p
                    className="fuente-nota fuente-nota--trabajando"
                    role="status"
                  >
                    Leyendo tus canales y rehaciendo el mapa · {segundos} s ·
                    puede tardar unos minutos, no cierres la pestaña.
                  </p>
                ) : (
                  <p className="fuente-nota">
                    Vuelve a sincronizar cuando quieras refrescar el mapa.{' '}
                    {AVISO_REEMPLAZA_DEMO}
                  </p>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="fuente-btn fuente-btn--primaria"
                  onClick={conectarSlack}
                  disabled={ocupado !== null}
                >
                  {ocupado === 'slack-oauth'
                    ? 'Abriendo Slack…'
                    : 'Conectar Slack ▶'}
                </button>
                <p className="fuente-nota">
                  Te lleva a Slack a autorizar y te devuelve aquí.
                </p>
              </>
            )}
          </Tarjeta>

          <Tarjeta
            titulo="Meet · Drive"
            marca="▶"
            estado={estado.drive}
            descripcion="Las reuniones que nadie vuelve a ver. Exporta la transcripción desde Drive (.txt, .vtt o .srt) y suéltala aquí."
          >
            <input
              ref={entradaRef}
              className="fuente-archivo"
              type="file"
              multiple
              accept=".txt,.vtt,.srt,.md,text/plain"
              aria-label="Transcripciones exportadas de Drive"
              onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
              disabled={ocupado !== null}
            />
            <button
              type="button"
              className="fuente-btn fuente-btn--primaria"
              onClick={subir}
              disabled={ocupado !== null || archivos.length === 0}
            >
              {ocupado === 'drive'
                ? 'Subiendo…'
                : etiquetaSubir(archivos.length)}
            </button>
            <p className="fuente-nota">
              En Meet: la grabación deja el archivo de transcripción en tu
              Drive. {AVISO_REEMPLAZA_DEMO}
            </p>
          </Tarjeta>

          <Tarjeta
            titulo="GitHub"
            marca="◆"
            estado={estado.github}
            descripcion="Quién revisa qué, y quién es el único que ha tocado ese repo en seis meses."
          >
            <p className="fuente-nota">
              Hoy entra por la ingesta del equipo. Conectar tu propia cuenta es
              lo siguiente: no hay botón porque todavía no hay nada detrás, y un
              botón que no hace nada es peor que ninguno.
            </p>
          </Tarjeta>
        </ul>

        <div className="fuentes-pie">
          <button
            type="button"
            className="fuente-btn"
            onClick={restaurarDemo}
            disabled={ocupado !== null}
          >
            {ocupado === 'reset'
              ? 'Restaurando…'
              : 'Volver al equipo de ejemplo'}
          </button>
          <p className="fuente-nota">
            Para los ensayos: deja la oficina como estaba antes de conectar
            nada.
          </p>
        </div>
      </main>
    </div>
  );
}

/** Versión reducida de la pantalla para los dos casos en los que no hay nada
 * que conectar (modo demo y sin sesión): mismas fuentes, mismo lenguaje
 * visual, sin acciones que no llevarían a ninguna parte. */
function Marco({
  nota,
  estado,
  piePorFuente,
  pie,
}: {
  nota: string;
  estado: EstadoFuentes;
  piePorFuente?: string;
  pie?: React.ReactNode;
}) {
  const fuentes: { id: Fuente; titulo: string; marca: string; desc: string }[] =
    [
      {
        id: 'slack',
        titulo: 'Slack',
        marca: '#',
        desc: 'Hilos, decisiones y reglas no escritas.',
      },
      {
        id: 'drive',
        titulo: 'Meet · Drive',
        marca: '▶',
        desc: 'Transcripciones de las reuniones.',
      },
      {
        id: 'github',
        titulo: 'GitHub',
        marca: '◆',
        desc: 'Reviews, commits y repos con un solo dueño.',
      },
    ];
  return (
    <div className="fuentes-page">
      <main className="fuentes-panel">
        <header className="fuentes-panel__header">
          <h1>Tus fuentes</h1>
          <Link className="fuentes-volver" to="/oficina">
            Ir a la oficina ▶
          </Link>
        </header>
        <p className="fuentes-intro">{nota}</p>
        <ul className="fuentes-lista">
          {fuentes.map((f) => (
            <Tarjeta
              key={f.id}
              titulo={f.titulo}
              marca={f.marca}
              estado={estado[f.id]}
              descripcion={f.desc}
            >
              {piePorFuente && <p className="fuente-nota">{piePorFuente}</p>}
            </Tarjeta>
          ))}
        </ul>
        {pie && <div className="fuentes-pie">{pie}</div>}
      </main>
    </div>
  );
}
