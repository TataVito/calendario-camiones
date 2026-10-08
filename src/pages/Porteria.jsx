import { useEffect, useMemo, useState } from 'react';
import FotosGuia from '../components/FotosGuia.jsx';
import { estadoInfo, formaDescargaInfo, hoyChile, horaFin, tipoInfo, toMinutos } from '../lib/useEventos.js';
import { TOLERANCIA_MIN, atrasoMin, atrasoTexto, duracionTexto, horaChile, tiempoEnObraMin } from '../lib/tiempos.js';

// Estilo "Faena": oscuro, alto contraste y botones grandes, para usar en terreno con el celular.

// Siguiente paso de portería según el estado del camión.
const PASOS = {
  programado: { paso: 'llego', label: 'Llegó a portería', estilo: 'bg-[#F2F0EA] text-[#15171A] hover:bg-white' },
  confirmado: { paso: 'llego', label: 'Llegó a portería', estilo: 'bg-[#F2F0EA] text-[#15171A] hover:bg-white' },
  en_porteria: { paso: 'inicio', label: 'Empezó descarga / carga', estilo: 'bg-[#6CB4FF] text-[#0B1A2B] hover:bg-[#8CC5FF]' },
  en_proceso: { paso: 'termino', label: 'Terminó y salió', estilo: 'bg-[#7CD992] text-[#0B2413] hover:bg-[#98E5AA]' },
};

const ETIQUETA_ESTADO = {
  programado: 'bg-[#2E3238] text-[#C9CCD1]',
  confirmado: 'bg-[#2E3238] text-[#C9CCD1]',
  en_porteria: 'bg-[#6CB4FF] text-[#0B1A2B]',
  en_proceso: 'bg-[#F5C518] text-[#15171A]',
  completado: 'bg-[#2E3238] text-[#7CD992]',
  cancelado: 'bg-[#2E3238] text-[#A3A7AD]',
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
  const enObra = ev.estado === 'en_porteria' || ev.estado === 'en_proceso';
  const terminado = ev.estado === 'completado' || ev.estado === 'cancelado';

  async function pulsar() {
    // "Terminó" deja el camión completado y bloqueado: se pide una segunda confirmación.
    if (siguiente.paso === 'termino' && !confirmando) return setConfirmando(true);
    setEnviando(true);
    await marcar(ev.id, siguiente.paso);
    setEnviando(false);
    setConfirmando(false);
  }

  return (
    <div className={`flex flex-col gap-3 rounded-md bg-[#1F2226] p-4 ${enObra ? 'shadow-[inset_0_0_0_2px_#F5C518]' : ''} ${terminado ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="font-faenacond text-4xl font-bold leading-none">
          {ev.horaInicio} <span className="text-lg font-semibold text-[#A3A7AD]">– {horaFin(ev)}</span>
        </div>
        {atrasadoAhora ? (
          <span className="rounded-sm bg-[#FF5A4E] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#2B0703]">
            Atrasado {duracionTexto(ahora - toMinutos(ev.horaInicio))}
          </span>
        ) : (
          <span className={`rounded-sm px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${ETIQUETA_ESTADO[ev.estado] || ETIQUETA_ESTADO.programado}`}>
            {est.label}
          </span>
        )}
      </div>

      <div>
        <div className="font-faenacond text-xl font-bold uppercase leading-tight">
          {tipoInfo(ev.tipo).label} · {ev.material || ev.proveedorCliente || 'Sin detalle'}
        </div>
        <div className="text-sm text-[#A3A7AD]">
          {[ev.material && ev.proveedorCliente, ev.guiaOC && `Guía ${ev.guiaOC}`, formaDescargaInfo(ev.formaDescarga).label].filter(Boolean).join(' · ')}
        </div>
        {ev.observaciones && <div className="mt-1 text-sm text-[#C9CCD1]">Obs.: {ev.observaciones}</div>}
      </div>

      {ev.llegadaReal && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#C9CCD1]">
          <span>
            Llegó <b className="text-[#F2F0EA]">{horaChile(ev.llegadaReal)}</b>{' '}
            <span className={atraso > TOLERANCIA_MIN ? 'font-semibold text-[#FF8A80]' : ''}>({atrasoTexto(atraso)})</span>
          </span>
          {ev.inicioProcesoReal && (
            <span>
              Inicio <b className="text-[#F2F0EA]">{horaChile(ev.inicioProcesoReal)}</b>
            </span>
          )}
          {ev.salidaReal && (
            <span>
              Salió <b className="text-[#F2F0EA]">{horaChile(ev.salidaReal)}</b> · {duracionTexto(tiempoEnObraMin(ev))} en obra
            </span>
          )}
        </div>
      )}

      {siguiente && marcar && (
        <button
          onClick={pulsar}
          disabled={enviando}
          className={`min-h-[64px] w-full rounded-md px-4 font-faenacond text-2xl font-bold uppercase tracking-wide transition disabled:opacity-50 ${
            confirmando ? 'bg-[#FF5A4E] text-[#2B0703] hover:bg-[#FF7A70]' : siguiente.estilo
          }`}
        >
          {enviando ? 'Registrando…' : confirmando ? '¿Confirmar salida? No se podrá modificar' : siguiente.label}
        </button>
      )}
      {confirmando && (
        <button onClick={() => setConfirmando(false)} className="min-h-[44px] w-full text-sm text-[#C9CCD1] underline">
          Cancelar
        </button>
      )}

      {verFotos ? (
        <FotosGuia evento={ev} puedeSubir={puedeSubirFotos} puedeBorrar={puedeBorrarFotos} oscuro />
      ) : (
        <button onClick={() => setVerFotos(true)} className="flex min-h-[40px] items-center gap-2 self-start font-semibold text-[#F5C518] hover:underline">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Fotos de la guía
        </button>
      )}
    </div>
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
  const enObra = deHoy.filter((ev) => ev.estado === 'en_porteria' || ev.estado === 'en_proceso');
  const terminados = deHoy.filter((ev) => ev.estado === 'completado' || ev.estado === 'cancelado');
  const fecha = new Date(`${hoy}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="-mx-4 min-h-[calc(100vh-180px)] bg-[#15171A] px-3 pb-8 pt-4 font-faena text-[#F2F0EA]">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <div className="flex flex-col gap-2 border-b border-[#2A2E33] px-1 pb-3">
          <span className="text-xs uppercase tracking-[0.2em] text-[#A3A7AD]">Portería · {fecha}</span>
          <h2 className="font-faenacond text-3xl font-bold uppercase leading-none">{obraNombre}</h2>
          <div className="flex gap-5 text-sm text-[#C9CCD1]">
            <span>
              <b className="text-base text-[#F5C518]">{pendientes.length}</b> pendientes
            </span>
            <span>
              <b className="text-base text-[#F2F0EA]">{enObra.length}</b> en obra
            </span>
            <span>
              <b className="text-base text-[#F2F0EA]">{terminados.length}</b> terminados
            </span>
          </div>
        </div>

        {pendientes.length === 0 && (
          <div className="rounded-md bg-[#1F2226] p-6 text-center text-[#A3A7AD]">No quedan camiones pendientes para hoy en esta obra.</div>
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
          <button onClick={() => setVerTerminados((v) => !v)} className="min-h-[48px] w-full text-sm font-semibold uppercase tracking-wider text-[#C9CCD1] underline">
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
    </div>
  );
}
