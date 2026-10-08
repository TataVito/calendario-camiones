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
  return <div className="flex min-h-screen items-center justify-center px-4 text-sm text-gray-500">{children}</div>;
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

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white no-print">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}rvc.jpg`} alt="RVC" className="h-10 w-10 rounded object-cover" />
              <div>
                <h1 className="text-xl font-bold text-[#C42B2B]">Calendario de Camiones</h1>
                <p className="text-sm text-gray-500">Coordinación de recepciones y despachos — RVC Constructora</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {obras.length > 0 && (
                <select
                  value={obraActivaId}
                  onChange={(e) => setObraActivaId(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium focus:border-[#C42B2B] focus:outline-none focus:ring-1 focus:ring-[#C42B2B]"
                >
                  {obras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              )}
              {(sesion.esSuper || (sesion.esAdmin && obras.length > 0)) && (
                <Button variant="secondary" onClick={() => setModalObras(true)}>
                  {obras.length > 0 ? 'Gestionar obras' : '+ Crear obra'}
                </Button>
              )}
            </div>

            <nav className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === t.value ? 'bg-white text-[#C42B2B] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        {error && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 no-print">
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
            <div className="mb-4 flex items-center justify-between no-print">
              <h2 className="text-base font-semibold text-gray-700">
                Obra: <span className="text-[#C42B2B]">{obraActiva?.nombre}</span>
                {obraActiva?.direccion && <span className="ml-2 text-sm font-normal text-gray-400">({obraActiva.direccion})</span>}
              </h2>
            </div>

            <div className={`mb-5 grid grid-cols-2 gap-3 no-print md:grid-cols-4 ${tab === 'porteria' || tab === 'reportes' ? 'hidden' : ''}`}>
              <Card className="p-3">
                <div className="text-xs font-medium text-gray-500">Recepciones hoy</div>
                <div className="text-2xl font-bold text-blue-700">{resumenHoy.recepciones}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs font-medium text-gray-500">Despachos hoy</div>
                <div className="text-2xl font-bold text-amber-700">{resumenHoy.despachos}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs font-medium text-gray-500">En portería / proceso</div>
                <div className="text-2xl font-bold text-indigo-700">{resumenHoy.enProceso}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs font-medium text-gray-500">Próximo camión</div>
                {resumenHoy.proximo ? (
                  <div className="text-sm font-semibold text-gray-800">
                    {resumenHoy.proximo.horaInicio} · {tipoInfo(resumenHoy.proximo.tipo).label}
                    {resumenHoy.proximo.proveedorCliente && ` (${resumenHoy.proximo.proveedorCliente})`}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">Sin más camiones hoy</div>
                )}
              </Card>
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
