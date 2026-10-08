import { useEffect, useMemo, useState } from 'react';
import { Badge, Card } from '../components/ui.jsx';
import FotosGuia from '../components/FotosGuia.jsx';
import { estadoInfo, formaDescargaInfo, hoyChile, horaFin, tipoInfo, toMinutos } from '../lib/useEventos.js';
import { TOLERANCIA_MIN, atrasoMin, atrasoTexto, duracionTexto, horaChile, tiempoEnObraMin } from '../lib/tiempos.js';

// Siguiente paso de portería según el estado del camión.
const PASOS = {
  programado: { paso: 'llego', label: '🚚 Llegó a portería', estilo: 'bg-purple-600 hover:bg-purple-700' },
  confirmado: { paso: 'llego', label: '🚚 Llegó a portería', estilo: 'bg-purple-600 hover:bg-purple-700' },
  en_porteria: { paso: 'inicio', label: '⏳ Empezó descarga / carga', estilo: 'bg-indigo-600 hover:bg-indigo-700' },
  en_proceso: { paso: 'termino', label: '✅ Terminó y salió', estilo: 'bg-emerald-600 hover:bg-emerald-700' },
};

function minutosAhoraChile() {
  const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour12: false }).split(':').map(Number);
  return h * 60 + m;
}

function TarjetaCamion({ ev, ahora, marcar, puedeSubirFotos, puedeBorrarFotos }) {
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [verFotos, setVerFotos] = useState(false);
  const siguiente = PASOS[ev.estado];
  const est = estadoInfo(ev.estado);
  const atraso = atrasoMin(ev);
  const esperando = !ev.llegadaReal && (ev.estado === 'programado' || ev.estado === 'confirmado');
  const atrasadoAhora = esperando && ahora > toMinutos(ev.horaInicio) + TOLERANCIA_MIN;

  async function pulsar() {
    // "Terminó" deja el camión completado y bloqueado: se pide una segunda confirmación.
    if (siguiente.paso === 'termino' && !confirmando) return setConfirmando(true);
    setEnviando(true);
    await marcar(ev.id, siguiente.paso);
    setEnviando(false);
    setConfirmando(false);
  }

  return (
    <Card className={`p-4 ${ev.estado === 'completado' || ev.estado === 'cancelado' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-gray-900">
            {ev.horaInicio} <span className="text-base font-normal text-gray-500">– {horaFin(ev)}</span>
          </div>
          <div className="text-sm font-medium text-gray-800">
            {tipoInfo(ev.tipo).label} · {ev.proveedorCliente || 'Sin proveedor'}
          </div>
          <div className="text-sm text-gray-500">
            {[ev.material, ev.guiaOC && `Guía ${ev.guiaOC}`, formaDescargaInfo(ev.formaDescarga).label].filter(Boolean).join(' · ')}
          </div>
          {ev.observaciones && <div className="mt-1 text-sm text-gray-600">📝 {ev.observaciones}</div>}
        </div>
        <Badge className={est.color}>{est.label}</Badge>
      </div>

      {(ev.llegadaReal || atrasadoAhora) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {ev.llegadaReal && (
            <span>
              Llegó <b>{horaChile(ev.llegadaReal)}</b>{' '}
              <span className={atraso > TOLERANCIA_MIN ? 'text-red-700' : 'text-gray-500'}>({atrasoTexto(atraso)})</span>
            </span>
          )}
          {ev.inicioProcesoReal && (
            <span>
              Inicio <b>{horaChile(ev.inicioProcesoReal)}</b>
            </span>
          )}
          {ev.salidaReal && (
            <span>
              Salió <b>{horaChile(ev.salidaReal)}</b> · {duracionTexto(tiempoEnObraMin(ev))} en obra
            </span>
          )}
          {atrasadoAhora && <span className="font-medium text-red-700">⚠️ Atrasado {duracionTexto(ahora - toMinutos(ev.horaInicio))}</span>}
        </div>
      )}

      {siguiente && marcar && (
        <button
          onClick={pulsar}
          disabled={enviando}
          className={`mt-3 w-full rounded-xl px-4 py-4 text-lg font-semibold text-white transition disabled:opacity-50 ${confirmando ? 'bg-red-600 hover:bg-red-700' : siguiente.estilo}`}
        >
          {enviando ? 'Registrando…' : confirmando ? '¿Confirmar salida? Ya no se podrá modificar' : siguiente.label}
        </button>
      )}
      {confirmando && (
        <button onClick={() => setConfirmando(false)} className="mt-2 w-full text-sm text-gray-500 underline">
          Cancelar
        </button>
      )}

      <div className="mt-3">
        {verFotos ? (
          <FotosGuia evento={ev} puedeSubir={puedeSubirFotos} puedeBorrar={puedeBorrarFotos} />
        ) : (
          <button onClick={() => setVerFotos(true)} className="text-sm font-medium text-[#C42B2B] hover:underline">
            📷 Fotos de la guía
          </button>
        )}
      </div>
    </Card>
  );
}

export default function Porteria({ eventos, obraNombre, marcarPorteria, puedeMarcar, rol }) {
  const [ahora, setAhora] = useState(minutosAhoraChile);
  const [verTerminados, setVerTerminados] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setAhora(minutosAhoraChile()), 30000);
    return () => clearInterval(t);
  }, []);

  const hoy = hoyChile();
  const deHoy = useMemo(
    () => eventos.filter((ev) => ev.fecha === hoy).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)),
    [eventos, hoy],
  );
  const pendientes = deHoy.filter((ev) => ev.estado !== 'completado' && ev.estado !== 'cancelado');
  const terminados = deHoy.filter((ev) => ev.estado === 'completado' || ev.estado === 'cancelado');

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Portería · {obraNombre}</h2>
        <span className="text-sm text-gray-500">
          {pendientes.length} pendientes · {terminados.length} terminados
        </span>
      </div>

      {pendientes.length === 0 && (
        <Card className="p-6 text-center text-sm text-gray-500">No quedan camiones pendientes para hoy en esta obra.</Card>
      )}
      {pendientes.map((ev) => (
        <TarjetaCamion
          key={ev.id}
          ev={ev}
          ahora={ahora}
          marcar={puedeMarcar ? marcarPorteria : null}
          puedeSubirFotos={puedeMarcar}
          puedeBorrarFotos={['editor', 'admin', 'superusuario'].includes(rol)}
        />
      ))}

      {terminados.length > 0 && (
        <button onClick={() => setVerTerminados((v) => !v)} className="w-full py-2 text-sm font-medium text-gray-600 underline">
          {verTerminados ? 'Ocultar' : 'Ver'} terminados de hoy ({terminados.length})
        </button>
      )}
      {verTerminados &&
        terminados.map((ev) => (
          <TarjetaCamion
            key={ev.id}
            ev={ev}
            ahora={ahora}
            marcar={null}
            puedeSubirFotos={puedeMarcar}
            puedeBorrarFotos={rol === 'admin' || rol === 'superusuario'}
          />
        ))}
    </div>
  );
}
