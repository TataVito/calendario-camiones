import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Modal } from '../components/ui.jsx';
import EventoForm from '../components/EventoForm.jsx';
import EventoDetalle from '../components/EventoDetalle.jsx';
import { estadoInfo, formaDescargaInfo, horaFin, toMinutos, tipoInfo } from '../lib/useEventos.js';
import {
  cuadriculaMes,
  diasDeSemana,
  esHoy,
  etiquetaDia,
  etiquetaFechaLarga,
  etiquetaMes,
  etiquetaRango,
  hoyISO,
  inicioSemana,
  mismoMes,
  primerDiaMes,
  sumarDias,
  sumarMeses,
} from '../lib/fechas.js';

const HORA_INICIO = 6;
const HORA_FIN = 20;
const PX_POR_MIN = 1.1;
const PX_POR_MIN_DIA = 1.7;
const ALTO_TOTAL = (HORA_FIN - HORA_INICIO) * 60 * PX_POR_MIN;
const ALTO_TOTAL_DIA = (HORA_FIN - HORA_INICIO) * 60 * PX_POR_MIN_DIA;

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ESTILOS_TIPO = {
  recepcion: 'bg-blue-100 border-blue-400 text-blue-900',
  despacho: 'bg-amber-100 border-amber-500 text-amber-900',
};

const PUNTO_TIPO = {
  recepcion: 'bg-blue-500',
  despacho: 'bg-amber-500',
};

export default function Calendario({ eventos, obraActivaId, autenticado, esAdmin, onRango, agregar, actualizar, eliminar, buscarConflictos }) {
  const [vista, setVista] = useState('semana'); // 'dia' | 'semana' | 'mes'
  const [diaReferencia, setDiaReferencia] = useState(hoyISO());
  const [semanaInicio, setSemanaInicio] = useState(() => inicioSemana(hoyISO()));
  const [mesReferencia, setMesReferencia] = useState(() => primerDiaMes(hoyISO()));
  const [modal, setModal] = useState(null); // { evento } | { fecha, hora } | null

  const dias = useMemo(() => diasDeSemana(semanaInicio), [semanaInicio]);
  const semanasMes = useMemo(() => cuadriculaMes(mesReferencia), [mesReferencia]);

  // Solo se cargan los camiones del rango visible.
  const rangoDesde = vista === 'dia' ? diaReferencia : vista === 'semana' ? dias[0] : semanasMes[0][0];
  const rangoHasta = vista === 'dia' ? diaReferencia : vista === 'semana' ? dias[6] : semanasMes.at(-1)[6];
  useEffect(() => {
    onRango?.({ desde: rangoDesde, hasta: rangoHasta });
  }, [rangoDesde, rangoHasta, onRango]);

  const eventosPorFecha = useMemo(() => {
    const mapa = {};
    for (const ev of eventos) {
      (mapa[ev.fecha] ||= []).push(ev);
    }
    for (const fecha in mapa) {
      mapa[fecha].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
    }
    return mapa;
  }, [eventos]);

  const horas = useMemo(() => Array.from({ length: HORA_FIN - HORA_INICIO + 1 }, (_, i) => HORA_INICIO + i), []);

  function abrirNuevo(fecha, horaAprox) {
    if (!autenticado) return;
    // Solo el admin agenda en fechas pasadas (la base también lo impide).
    if (!esAdmin && fecha < hoyISO()) return;
    setModal({ fecha, hora: horaAprox });
  }

  // Completado: solo el admin lo puede modificar; los demás lo ven como detalle.
  function soloLectura(evento) {
    return !autenticado || (evento.estado === 'completado' && !esAdmin);
  }

  function abrirExistente(evento) {
    setModal({ evento });
  }

  function cerrar() {
    setModal(null);
  }

  function guardar(datos) {
    if (modal?.evento) {
      actualizar(modal.evento.id, datos);
    } else {
      agregar(datos);
    }
    cerrar();
  }

  function borrar(id) {
    eliminar(id);
    cerrar();
  }

  function posicionEvento(ev, pxPorMin = PX_POR_MIN) {
    const inicioMin = toMinutos(ev.horaInicio) - HORA_INICIO * 60;
    const alto = Math.max(ev.duracionMin * pxPorMin, 26);
    return { top: `${inicioMin * pxPorMin}px`, height: `${alto}px` };
  }

  function irAHoy() {
    setDiaReferencia(hoyISO());
    setSemanaInicio(inicioSemana(hoyISO()));
    setMesReferencia(primerDiaMes(hoyISO()));
  }

  function verDia(dia) {
    setDiaReferencia(dia);
    setVista('dia');
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2">
          {vista === 'dia' && (
            <>
              <Button variant="secondary" onClick={() => setDiaReferencia((d) => sumarDias(d, -1))}>
                ← Día anterior
              </Button>
              <Button variant="secondary" onClick={irAHoy}>
                Hoy
              </Button>
              <Button variant="secondary" onClick={() => setDiaReferencia((d) => sumarDias(d, 1))}>
                Día siguiente →
              </Button>
            </>
          )}
          {vista === 'semana' && (
            <>
              <Button variant="secondary" onClick={() => setSemanaInicio((s) => sumarDias(s, -7))}>
                ← Semana anterior
              </Button>
              <Button variant="secondary" onClick={irAHoy}>
                Hoy
              </Button>
              <Button variant="secondary" onClick={() => setSemanaInicio((s) => sumarDias(s, 7))}>
                Semana siguiente →
              </Button>
            </>
          )}
          {vista === 'mes' && (
            <>
              <Button variant="secondary" onClick={() => setMesReferencia((m) => sumarMeses(m, -1))}>
                ← Mes anterior
              </Button>
              <Button variant="secondary" onClick={irAHoy}>
                Hoy
              </Button>
              <Button variant="secondary" onClick={() => setMesReferencia((m) => sumarMeses(m, 1))}>
                Mes siguiente →
              </Button>
            </>
          )}
        </div>
        <h2 className="text-lg font-semibold text-gray-800">
          {vista === 'dia' && capitalizar(etiquetaFechaLarga(diaReferencia))}
          {vista === 'semana' && etiquetaRango(dias[0], dias[6])}
          {vista === 'mes' && etiquetaMes(mesReferencia)}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setVista('dia')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${vista === 'dia' ? 'bg-white text-[#C42B2B] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Día
            </button>
            <button
              onClick={() => setVista('semana')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${vista === 'semana' ? 'bg-white text-[#C42B2B] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Semana
            </button>
            <button
              onClick={() => setVista('mes')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${vista === 'mes' ? 'bg-white text-[#C42B2B] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Mes
            </button>
          </div>
          {autenticado && (
            <Button onClick={() => abrirNuevo(vista === 'dia' && (esAdmin || diaReferencia >= hoyISO()) ? diaReferencia : hoyISO(), '09:00')}>+ Nuevo camión</Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-4 text-xs text-gray-600 no-print">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-blue-400 bg-blue-100" /> Recepción
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-amber-500 bg-amber-100" /> Despacho
        </span>
      </div>

      {vista === 'dia' && (
        <Card className="overflow-hidden">
          <div className="relative grid grid-cols-[60px_1fr]" style={{ height: `${ALTO_TOTAL_DIA}px` }}>
            <div className="relative border-r border-gray-200">
              {horas.map((h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-2 text-xs text-gray-400"
                  style={{ top: `${(h - HORA_INICIO) * 60 * PX_POR_MIN_DIA}px` }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            <div className="relative" onDoubleClick={() => abrirNuevo(diaReferencia, '09:00')}>
              {horas.map((h) => (
                <div
                  key={h}
                  className="absolute w-full border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  style={{ top: `${(h - HORA_INICIO) * 60 * PX_POR_MIN_DIA}px`, height: `${60 * PX_POR_MIN_DIA}px` }}
                  onClick={() => abrirNuevo(diaReferencia, `${String(h).padStart(2, '0')}:00`)}
                  title="Click para agendar un camión"
                />
              ))}

              {eventosPorFecha[diaReferencia]?.map((ev) => {
                const estado = estadoInfo(ev.estado);
                const estiloTipo = ESTILOS_TIPO[ev.tipo] || ESTILOS_TIPO.recepcion;
                const esProveedor = ev.tipo === 'recepcion';
                return (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirExistente(ev);
                    }}
                    className={`absolute left-1 right-1 z-10 overflow-hidden rounded-md border px-2 py-1 text-left text-xs leading-tight shadow-sm hover:shadow-md ${estiloTipo} ${ev.estado === 'cancelado' ? 'opacity-50 line-through' : ''}`}
                    style={posicionEvento(ev, PX_POR_MIN_DIA)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {ev.horaInicio}–{horaFin(ev)} · {tipoInfo(ev.tipo).label}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${estado.color}`}>{estado.label}</span>
                    </div>
                    {ev.proveedorCliente && (
                      <div className="truncate">
                        {esProveedor ? 'Proveedor' : 'Cliente'}: {ev.proveedorCliente}
                      </div>
                    )}
                    {(ev.material || ev.formaDescarga) && (
                      <div className="truncate opacity-80">
                        {ev.material}
                        {ev.material && ev.formaDescarga && ' · '}
                        {ev.formaDescarga && formaDescargaInfo(ev.formaDescarga).label}
                      </div>
                    )}
                    {ev.guiaOC && <div className="truncate opacity-80">Guía/OC: {ev.guiaOC}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {vista === 'semana' && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-200 text-sm font-medium text-gray-600">
            <div />
            {dias.map((dia) => (
              <div
                key={dia}
                className={`border-l border-gray-200 px-2 py-2 text-center ${esHoy(dia) ? 'bg-red-50 text-[#C42B2B] font-semibold' : ''}`}
              >
                {etiquetaDia(dia)}
              </div>
            ))}
          </div>

          <div className="relative grid grid-cols-[60px_repeat(7,1fr)]" style={{ height: `${ALTO_TOTAL}px` }}>
            <div className="relative border-r border-gray-200">
              {horas.map((h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-2 text-xs text-gray-400"
                  style={{ top: `${(h - HORA_INICIO) * 60 * PX_POR_MIN}px` }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {dias.map((dia) => (
              <div key={dia} className="relative border-l border-gray-200" onDoubleClick={() => abrirNuevo(dia, '09:00')}>
                {horas.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    style={{ top: `${(h - HORA_INICIO) * 60 * PX_POR_MIN}px`, height: `${60 * PX_POR_MIN}px` }}
                    onClick={() => abrirNuevo(dia, `${String(h).padStart(2, '0')}:00`)}
                    title="Click para agendar un camión"
                  />
                ))}

                {eventosPorFecha[dia]?.map((ev) => {
                  const estado = estadoInfo(ev.estado);
                  const estiloTipo = ESTILOS_TIPO[ev.tipo] || ESTILOS_TIPO.recepcion;
                  return (
                    <button
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirExistente(ev);
                      }}
                      className={`absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:shadow-md ${estiloTipo} ${ev.estado === 'cancelado' ? 'opacity-50 line-through' : ''}`}
                      style={posicionEvento(ev)}
                    >
                      <div className="font-semibold">
                        {ev.horaInicio}–{horaFin(ev)} · {tipoInfo(ev.tipo).label}
                      </div>
                      {ev.proveedorCliente && <div className="truncate">{ev.proveedorCliente}</div>}
                      {ev.material && <div className="truncate opacity-80">{ev.material}</div>}
                      <div className={`mt-0.5 inline-block rounded px-1 text-[10px] ${estado.color}`}>{estado.label}</div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      )}

      {vista === 'mes' && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 text-sm font-medium text-gray-600">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
              <div key={d} className="border-l border-gray-200 px-2 py-2 text-center first:border-l-0">
                {d}
              </div>
            ))}
          </div>

          {semanasMes.map((semana) => (
            <div key={semana[0]} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0" style={{ minHeight: '110px' }}>
              {semana.map((dia) => {
                const eventosDia = eventosPorFecha[dia] || [];
                const visibles = eventosDia.slice(0, 3);
                const restantes = eventosDia.length - visibles.length;
                const fueraDeMes = !mismoMes(dia, mesReferencia);
                return (
                  <div
                    key={dia}
                    onClick={() => abrirNuevo(dia, '09:00')}
                    className={`cursor-pointer border-l border-gray-100 p-1.5 first:border-l-0 hover:bg-gray-50 ${fueraDeMes ? 'bg-gray-50/60' : ''}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        verDia(dia);
                      }}
                      className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs hover:ring-2 hover:ring-[#C42B2B]/40 ${
                        esHoy(dia) ? 'bg-[#C42B2B] font-semibold text-white' : fueraDeMes ? 'text-gray-400' : 'text-gray-700'
                      }`}
                      title="Ver este día"
                    >
                      {Number(dia.slice(8, 10))}
                    </button>
                    <div className="space-y-0.5">
                      {visibles.map((ev) => (
                        <button
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirExistente(ev);
                          }}
                          className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight hover:opacity-80 ${
                            ev.estado === 'cancelado' ? 'opacity-50 line-through' : ''
                          } ${ev.tipo === 'despacho' ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-900'}`}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_TIPO[ev.tipo] || PUNTO_TIPO.recepcion}`} />
                          <span className="shrink-0">{ev.horaInicio}</span>
                          <span className="truncate">{ev.proveedorCliente || tipoInfo(ev.tipo).label}</span>
                        </button>
                      ))}
                      {restantes > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            verDia(dia);
                          }}
                          className="w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-gray-500 hover:text-[#C42B2B]"
                        >
                          +{restantes} más
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </Card>
      )}

      <Modal
        open={!!modal}
        onClose={cerrar}
        title={modal?.evento ? (soloLectura(modal.evento) ? 'Detalle del camión' : 'Editar camión agendado') : 'Agendar nuevo camión'}
        wide
      >
        {modal &&
          (modal.evento && soloLectura(modal.evento) ? (
            <EventoDetalle evento={modal.evento} onCerrar={cerrar} completado={autenticado} puedeSubirFotos={autenticado} />
          ) : (
            <EventoForm
              evento={modal.evento}
              fechaSugerida={modal.fecha}
              horaSugerida={modal.hora}
              obraActivaId={obraActivaId}
              esAdmin={esAdmin}
              onGuardar={guardar}
              onCancelar={cerrar}
              onEliminar={borrar}
              buscarConflictos={buscarConflictos}
            />
          ))}
      </Modal>
    </div>
  );
}
