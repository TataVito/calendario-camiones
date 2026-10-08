import { useCallback, useMemo, useState } from 'react';
import Calendario from './pages/Calendario.jsx';
import Lista from './pages/Lista.jsx';
import Administracion from './pages/Administracion.jsx';
import Porteria from './pages/Porteria.jsx';
import Reportes from './pages/Reportes.jsx';
import ObrasModal from './components/ObrasModal.jsx';
import { Button, Card } from './components/ui.jsx';
import { useEventos, toMinutos, tipoInfo } from './lib/useEventos.js';
import { useObras } from './lib/useObras.js';
import { useSesion } from './lib/useSesion.js';
import { configurado } from './lib/supabase.js';
import Login from './pages/Login.jsx';
import { hoyISO } from './lib/fechas.js';

function minutosAhora() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const TABS = [
  { value: 'calendario', label: 'Calendario' },
  { value: 'lista', label: 'Lista / Imprimir' },
  { value: 'porteria', label: 'Portería', roles: ['porteria', 'editor', 'admin', 'superusuario'] },
  { value: 'reportes', label: 'Reportes' },
  { value: 'administracion', label: 'Administración' },
];

// Restos de la versión sin nube: usuarios con claves en texto plano. Se borran siempre.
try {
  localStorage.removeItem('rvc_calendario_usuarios_v1');
  localStorage.removeItem('rvc_calendario_sesion_v1');
} catch {
  // sin almacenamiento local
}

function Centrado({ children }) {
  return <div className="flex min-h-screen items-center justify-center bg-papel px-4 text-sm text-gray-500">{children}</div>;
}

export default function App() {
  if (!configurado) {
    return <Centrado>Falta configurar Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).</Centrado>;
  }
  return <Puerta />;
}

// Nada del calendario se monta (ni se consulta) hasta tener sesión y perfil.
function Puerta() {
  const sesion = useSesion();
  if (sesion.cargando) return <Centrado>Cargando…</Centrado>;
  if (!sesion.conectado) return <Login login={sesion.login} />;
  return <Principal sesion={sesion} />;
}

function Principal({ sesion }) {
  const { obras, obraActivaId, setObraActivaId, obraActiva, agregarObra, actualizarObra, eliminarObra, error: errorObras, limpiarError: limpiarErrorObras } = useObras();
  // Rango de fechas que muestra la pestaña activa: solo se cargan esos camiones (más los de hoy).
  const [rango, setRango] = useState({ desde: hoyISO(), hasta: hoyISO() });
  const cambiarRango = useCallback(
    (nuevo) => setRango((r) => (r.desde === nuevo.desde && r.hasta === nuevo.hasta ? r : nuevo)),
    [],
  );
  const { eventos, agregar, actualizar, eliminar, marcarPorteria, buscarConflictos, recargar, error: errorEventos, limpiarError: limpiarErrorEventos } =
    useEventos(obraActivaId, rango);
  const autenticado = sesion.puedeEditar;
  const error = errorEventos || errorObras;
  const [tab, setTab] = useState(sesion.rol === 'porteria' ? 'porteria' : 'calendario');
  const [modalObras, setModalObras] = useState(false);
  const tabs = TABS.filter((t) => !t.roles || t.roles.includes(sesion.rol));

  const eventosDeObra = eventos;

  const resumenHoy = useMemo(() => {
    const deHoy = eventosDeObra.filter((ev) => ev.fecha === hoyISO() && ev.estado !== 'cancelado');
    const recepciones = deHoy.filter((ev) => ev.tipo === 'recepcion').length;
    const despachos = deHoy.filter((ev) => ev.tipo === 'despacho').length;
    const enProceso = deHoy.filter((ev) => ev.estado === 'en_proceso' || ev.estado === 'en_porteria').length;
    const ahora = minutosAhora();
    const proximo = deHoy
      .filter((ev) => ev.estado !== 'completado' && toMinutos(ev.horaInicio) >= ahora)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))[0];
    return { recepciones, despachos, enProceso, proximo };
  }, [eventosDeObra]);

  // La base borra en cascada los camiones de la obra; se recargan para reflejarlo.
  async function manejarEliminarObra(id) {
    await eliminarObra(id);
    await recargar();
  }

  const ROL_TXT = { lector: 'lector', porteria: 'portería', editor: 'editor', admin: 'admin de obra', superusuario: 'súper usuario' };
  const enPorteria = tab === 'porteria';

  return (
    <div className={`min-h-screen ${enPorteria ? 'bg-[#15171A]' : 'bg-papel'}`}>
      <header className="border-b border-tinta bg-white no-print">
        <div className="h-1.5 bg-rvc" />
        <div className="mx-auto grid max-w-7xl gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}rvc.jpg`} alt="RVC" className="h-12 w-12 object-contain" />
              <div className="flex flex-col">
                <h1 className="text-xl font-bold leading-tight text-tinta">Calendario de camiones</h1>
                <span className="font-mono text-[11px] tracking-wider text-gray-500">RVC CONSTRUCTORA · CAM-01</span>
              </div>
            </div>
            <nav className="flex w-fit max-w-full flex-wrap border border-tinta">
              {tabs.map((t, i) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`min-h-[40px] px-4 text-sm font-medium transition ${i > 0 ? 'border-l border-tinta' : ''} ${
                    tab === t.value ? 'bg-rvc text-white' : 'text-tinta hover:bg-rvc/5'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="grid min-w-0 grid-cols-2 border border-tinta text-xs md:min-w-[400px]">
            <div className="border-b border-r border-tinta px-3 py-1.5">
              <div className="font-mono text-[10px] text-gray-500">OBRA</div>
              {obras.length > 0 ? (
                <select
                  value={obraActivaId}
                  onChange={(e) => setObraActivaId(e.target.value)}
                  aria-label="Obra"
                  className="min-h-[28px] w-full border-0 bg-transparent p-0 text-sm font-bold text-tinta focus:outline-none focus:ring-1 focus:ring-tinta"
                >
                  {obras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="pt-1 text-sm font-bold">—</div>
              )}
            </div>
            <div className="border-b border-tinta px-3 py-1.5">
              <div className="font-mono text-[10px] text-gray-500">DIRECCIÓN</div>
              <div className="truncate pt-1 text-sm font-medium">{obraActiva?.direccion || '—'}</div>
            </div>
            <div className="border-r border-tinta px-3 py-1.5">
              <div className="font-mono text-[10px] text-gray-500">USUARIO</div>
              <div className="truncate pt-0.5 font-medium">
                {sesion.perfil.usuario} · {ROL_TXT[sesion.rol] || sesion.rol}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-1.5">
              <div>
                <div className="font-mono text-[10px] text-gray-500">OBRAS</div>
                <div className="pt-0.5 font-medium">{obras.length}</div>
              </div>
              {(sesion.esSuper || (sesion.esAdmin && obras.length > 0)) && (
                <button onClick={() => setModalObras(true)} className="min-h-[32px] border border-tinta px-2 text-xs font-medium hover:bg-tinta/5">
                  {obras.length > 0 ? 'Gestionar' : '+ Crear obra'}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-7xl px-4 ${enPorteria ? 'py-0' : 'py-5'}`}>
        {error && (
          <div className="mb-4 mt-4 flex items-center justify-between gap-3 border border-[#D13038] bg-[#FBEBEC] px-3 py-2 text-sm text-[#A8232A] no-print">
            <span>No se pudo completar la operación: {error}</span>
            <button
              onClick={() => {
                limpiarErrorEventos();
                limpiarErrorObras();
              }}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        )}
        {tab === 'administracion' ? (
          <Administracion {...sesion} obras={obras} />
        ) : obras.length === 0 ? (
          <Card className="mx-auto mt-10 max-w-md p-6 text-center">
            <h2 className="mb-2 text-lg font-semibold text-gray-800">{sesion.esSuper ? 'Todavía no hay obras' : 'No tenés obras asignadas'}</h2>
            <p className="mb-4 text-sm text-gray-500">
              {sesion.esSuper
                ? 'Esta app coordina los camiones de cada obra por separado. Empezá creando una obra.'
                : 'Pedile a un administrador que te asigne las obras que tenés que ver.'}
            </p>
            {sesion.esSuper && <Button onClick={() => setModalObras(true)}>+ Crear obra</Button>}
          </Card>
        ) : (
          <>

            <div className={`mb-5 grid grid-cols-2 border border-tinta bg-white no-print md:grid-cols-4 ${enPorteria || tab === 'reportes' ? 'hidden' : ''}`}>
              <div className="border-b border-r border-gray-300 px-4 py-2 md:border-b-0">
                <div className="font-mono text-[10px] text-gray-500">RECEPCIONES HOY</div>
                <div className="font-mono text-2xl font-medium">{resumenHoy.recepciones}</div>
              </div>
              <div className="border-b border-gray-300 px-4 py-2 md:border-b-0 md:border-r">
                <div className="font-mono text-[10px] text-gray-500">DESPACHOS HOY</div>
                <div className="font-mono text-2xl font-medium">{resumenHoy.despachos}</div>
              </div>
              <div className="border-r border-gray-300 px-4 py-2">
                <div className="font-mono text-[10px] text-gray-500">EN PORTERÍA / DESCARGANDO</div>
                <div className="font-mono text-2xl font-medium">{resumenHoy.enProceso}</div>
              </div>
              <div className="px-4 py-2">
                <div className="font-mono text-[10px] text-gray-500">PRÓXIMO CAMIÓN</div>
                {resumenHoy.proximo ? (
                  <div className="pt-1 text-sm font-bold">
                    <span className="font-mono">{resumenHoy.proximo.horaInicio}</span> · {tipoInfo(resumenHoy.proximo.tipo).label}
                    {resumenHoy.proximo.proveedorCliente && ` · ${resumenHoy.proximo.proveedorCliente}`}
                  </div>
                ) : (
                  <div className="pt-1 text-sm text-gray-500">Sin más camiones hoy</div>
                )}
              </div>
            </div>

            {tab === 'porteria' && (
              <Porteria
                eventos={eventosDeObra}
                obraNombre={obraActiva?.nombre}
                marcarPorteria={marcarPorteria}
                puedeMarcar={sesion.puedePorteria}
                rol={sesion.rol}
              />
            )}
            {tab === 'reportes' && <Reportes obras={obras} obraActivaId={obraActivaId} />}
            {tab === 'calendario' && (
              <Calendario
                eventos={eventosDeObra}
                obraActivaId={obraActivaId}
                autenticado={autenticado}
                esAdmin={sesion.esAdmin}
                onRango={cambiarRango}
                agregar={agregar}
                actualizar={actualizar}
                eliminar={eliminar}
                buscarConflictos={buscarConflictos}
              />
            )}
            {tab === 'lista' && (
              <Lista
                eventos={eventosDeObra}
                obraActivaId={obraActivaId}
                obraNombre={obraActiva?.nombre}
                autenticado={autenticado}
                esAdmin={sesion.esAdmin}
                onRango={cambiarRango}
                agregar={agregar}
                actualizar={actualizar}
                eliminar={eliminar}
                buscarConflictos={buscarConflictos}
              />
            )}
          </>
        )}
      </main>

      {sesion.esAdmin && (
        <ObrasModal
          open={modalObras}
          puedeCrearEliminar={sesion.esSuper}
          onClose={() => setModalObras(false)}
          obras={obras}
          obraActivaId={obraActivaId}
          setObraActivaId={setObraActivaId}
          agregarObra={agregarObra}
          actualizarObra={actualizarObra}
          eliminarObra={manejarEliminarObra}
        />
      )}
    </div>
  );
}
