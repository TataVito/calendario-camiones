import { useEffect, useMemo, useState } from 'react';
import FotosGuia from '../components/FotosGuia.jsx';
import { useComentarios } from '../lib/comentarios.js';
import { ESTADOS_CERRADOS, enRecepcion, estadoInfo, estadoVisible, formaDescargaInfo, hoyChile, horaFin, nombreCamion, tipoInfo, toMinutos } from '../lib/useEventos.js';
import { TOLERANCIA_MIN, atrasoMin, atrasoTexto, duracionTexto, horaChile, tiempoEnObraMin } from '../lib/tiempos.js';

// Estilo "Faena" con la marca RVC: oscuro, alto contraste, rojo corporativo y botones grandes,
// para usar en terreno con el celular. El atraso va en naranja para no confundirse con la marca.

// Recepción solo anota horas (llegada, inicio, salida); el estado de cierre lo pone la obra.
const PASOS = {
  llego: { paso: 'llego', label: 'Llegó a recepción', estilo: 'bg-[#F2F0EA] text-[#15171A] hover:bg-white' },
  inicio: { paso: 'inicio', label: 'Empezó descarga / carga', estilo: 'bg-[#6CB4FF] text-[#0B1A2B] hover:bg-[#8CC5FF]' },
  termino: { paso: 'termino', label: 'Terminó y salió', estilo: 'bg-[#7CD992] text-[#0B2413] hover:bg-[#98E5AA]' },
};

// Siguiente hora que falta anotar, según las horas ya registradas (no según el estado).
function siguientePaso(ev) {
  if (ev.estado === 'cancelado' || ev.salidaReal) return null;
  if (!ev.llegadaReal) return ESTADOS_CERRADOS.includes(ev.estado) ? null : PASOS.llego;
  if (!ev.inicioProcesoReal) return PASOS.inicio;
  return PASOS.termino;
}

// Ya no se espera nada de Recepción: salió, o la obra lo cerró sin que llegara.
const terminadoEnRecepcion = (ev) => !siguientePaso(ev);

const ETIQUETA_ESTADO = {
  programado: 'bg-[#2E3238] text-[#C9CCD1]',
  confirmado: 'bg-[#2E3238] text-[#C9CCD1]',
  en_porteria: 'bg-[#6CB4FF] text-[#0B1A2B]',
  en_proceso: 'bg-[#E5484F] text-white',
  salio: 'bg-[#2E3238] text-[#F2F0EA]',
  completado: 'bg-[#2E3238] text-[#7CD992]',
  incompleto: 'bg-[#2E3238] text-[#FFB547]',
  no_recibido: 'bg-[#2E3238] text-[#FF7A70]',
  cancelado: 'bg-[#2E3238] text-[#A3A7AD]',
};

function minutosAhoraChile() {
  const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour12: false }).split(':').map(Number);
  return h * 60 + m;
}

// Comentarios del camión en la tarjeta de Recepción: los ya escritos y uno nuevo.
// Autor y hora los pone la base; nadie puede editarlos.
function ComentariosRecepcion({ ev, onCerrar }) {
  const { comentarios, agregar, error } = useComentarios(ev);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    if (!texto.trim()) return;
    setGuardando(true);
    const ok = await agregar(texto);
    setGuardando(false);
    if (ok) setTexto('');
  }
  return (
    <div className="flex flex-col gap-2 rounded-md bg-[#15171A] p-3">
      {comentarios.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-[#C9CCD1]">
          {comentarios.map((c, i) => (
            <li key={c.id || i}>
              💬 <b className="text-[#F2F0EA]">{c.autor}</b> · {c.cuando} — {c.texto}
            </li>
          ))}
        </ul>
      )}
      <textarea
        rows={2}
        maxLength={300}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ej: faltaron 10 sacos de adhesivo"
        className="w-full rounded-md border border-[#3A3F46] bg-[#1F2226] p-3 text-base text-[#F2F0EA] placeholder:text-[#6B6F75]"
      />
      {error && <p className="text-sm text-[#FF8A80]">No se pudo guardar: {error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onCerrar} className="min-h-[48px] rounded-md border border-[#3A3F46] text-sm font-semibold uppercase tracking-wider text-[#C9CCD1]">
          Cerrar
        </button>
        <button
          onClick={guardar}
          disabled={guardando || !texto.trim()}
          className="min-h-[48px] rounded-md bg-[#F2F0EA] font-faenacond text-lg font-bold uppercase tracking-wide text-[#15171A] disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar comentario'}
        </button>
      </div>
    </div>
  );
}

function TarjetaCamion({ ev, ahora, marcar, cerrar, puedeComentar, puedeSubirFotos, puedeBorrarFotos }) {
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [verFotos, setVerFotos] = useState(false);
  const [cerrando, setCerrando] = useState(null); // estado que se está enviando
  const [confirmaCompleto, setConfirmaCompleto] = useState(false);
  const [comentando, setComentando] = useState(false);
  const siguiente = siguientePaso(ev);
  const visible = estadoVisible(ev);
  const est = estadoInfo(visible);
  const atraso = atrasoMin(ev);
  const esperando = !ev.llegadaReal && (ev.estado === 'programado' || ev.estado === 'confirmado');
  const atrasadoAhora = esperando && ahora > toMinutos(ev.horaInicio) + TOLERANCIA_MIN;
  const enObra = enRecepcion(ev);
  const terminado = terminadoEnRecepcion(ev);

  async function pulsar() {
    // La salida no se puede volver a anotar: se pide una segunda confirmación.
    if (siguiente.paso === 'termino' && !confirmando) return setConfirmando(true);
    setEnviando(true);
    await marcar(ev.id, siguiente.paso);
    setEnviando(false);
    setConfirmando(false);
  }

  return (
    <div className={`flex flex-col gap-3 rounded-md bg-[#1F2226] p-4 ${enObra ? 'shadow-[inset_0_0_0_2px_#E5484F]' : ''} ${terminado ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="font-faenacond text-4xl font-bold leading-none">
          {ev.horaInicio} <span className="text-lg font-semibold text-[#A3A7AD]">– {horaFin(ev)}</span>
        </div>
        {atrasadoAhora ? (
          <span className="rounded-sm bg-[#FF9A3D] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#2B1503]">
            Atrasado {duracionTexto(ahora - toMinutos(ev.horaInicio))}
          </span>
        ) : (
          <span className={`rounded-sm px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${ETIQUETA_ESTADO[visible] || ETIQUETA_ESTADO.programado}`}>
            {est.label}
          </span>
        )}
      </div>

      <div>
        <div className="font-faenacond text-xl font-bold uppercase leading-tight">
          {tipoInfo(ev.tipo).label} · {nombreCamion(ev, ev.proveedorCliente || 'Sin detalle')}
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

      {cerrar && ev.llegadaReal && ['programado', 'confirmado', 'en_porteria', 'en_proceso', 'incompleto'].includes(ev.estado) && (
        <div className="flex flex-col gap-2">
          <div className="text-xs uppercase tracking-[0.15em] text-[#A3A7AD]">¿Cómo llegó?</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                // Completo bloquea el camión (solo un administrador lo cambia): se confirma.
                if (!confirmaCompleto) return setConfirmaCompleto(true);
                setCerrando('completado');
                await cerrar(ev.id, 'completado');
                setCerrando(null);
                setConfirmaCompleto(false);
              }}
              disabled={!!cerrando}
              className={`min-h-[56px] rounded-md px-3 font-faenacond text-xl font-bold uppercase tracking-wide disabled:opacity-50 ${confirmaCompleto ? 'bg-[#7CD992] text-[#0B2413]' : 'border-2 border-[#7CD992] text-[#7CD992]'}`}
            >
              {cerrando === 'completado' ? 'Guardando…' : confirmaCompleto ? '¿Confirmar? No se podrá cambiar' : '✓ Completo'}
            </button>
            <button
              onClick={async () => {
                setConfirmaCompleto(false);
                setCerrando('incompleto');
                await cerrar(ev.id, 'incompleto');
                setCerrando(null);
              }}
              disabled={!!cerrando || ev.estado === 'incompleto'}
              className={`min-h-[56px] rounded-md px-3 font-faenacond text-xl font-bold uppercase tracking-wide disabled:opacity-60 ${ev.estado === 'incompleto' ? 'bg-[#FFB547] text-[#2B1A03]' : 'border-2 border-[#FFB547] text-[#FFB547]'}`}
            >
              {cerrando === 'incompleto' ? 'Guardando…' : '◐ Incompleto'}
            </button>
          </div>
          {confirmaCompleto && (
            <button onClick={() => setConfirmaCompleto(false)} className="min-h-[40px] text-sm text-[#C9CCD1] underline">
              Cancelar
            </button>
          )}
        </div>
      )}

      {comentando ? (
        <ComentariosRecepcion ev={ev} onCerrar={() => setComentando(false)} />
      ) : (
        (puedeComentar || ev.ultimoComentario) && (
          <button
            onClick={() => setComentando(true)}
            className="flex min-h-[40px] items-start gap-2 self-start text-left font-semibold text-[#FF7A80] hover:underline"
          >
            <span>💬</span>
            <span>
              {puedeComentar ? 'Comentarios' : 'Ver comentarios'}
              {ev.ultimoComentario && <span className="block font-normal text-[#C9CCD1]">Último: {ev.ultimoComentario}</span>}
            </span>
          </button>
        )
      )}

      {verFotos ? (
        <FotosGuia evento={ev} puedeSubir={puedeSubirFotos} puedeBorrar={puedeBorrarFotos} oscuro />
      ) : (
        <button onClick={() => setVerFotos(true)} className="flex min-h-[40px] items-center gap-2 self-start font-semibold text-[#FF7A80] hover:underline">
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

export default function Porteria({ eventos, obraNombre, marcarPorteria, cerrarRecepcion, puedeMarcar, rol }) {
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
  const pendientes = deHoy.filter((ev) => !terminadoEnRecepcion(ev));
  const enObra = deHoy.filter(enRecepcion);
  const terminados = deHoy.filter(terminadoEnRecepcion);
  const fecha = new Date(`${hoy}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="-mx-4 min-h-[calc(100vh-180px)] bg-[#15171A] px-3 pb-8 pt-4 font-faena text-[#F2F0EA]">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <div className="flex flex-col gap-2 border-b border-[#2A2E33] px-1 pb-3">
          <span className="text-xs uppercase tracking-[0.2em] text-[#A3A7AD]">Recepción · {fecha}</span>
          <h2 className="font-faenacond text-3xl font-bold uppercase leading-none">{obraNombre}</h2>
          <div className="flex gap-5 text-sm text-[#C9CCD1]">
            <span>
              <b className="text-base text-[#FF7A80]">{pendientes.length}</b> pendientes
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
            cerrar={puedeMarcar ? cerrarRecepcion : null}
            puedeComentar={puedeMarcar}
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
              cerrar={puedeMarcar ? cerrarRecepcion : null}
              puedeComentar={puedeMarcar}
              puedeSubirFotos={puedeMarcar}
              puedeBorrarFotos={rol === 'admin' || rol === 'superusuario'}
            />
          ))}
      </div>
    </div>
  );
}
