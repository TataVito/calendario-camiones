import { useEffect, useMemo, useRef, useState } from 'react';
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

// Plano técnico: recepción azul plano, despacho ocre. Completado = solo contorno punteado;
// en proceso = relleno de tinta. Se distinguen también por la letra del tipo, no solo por color.
const ESTILOS_TIPO = {
  recepcion: 'bg-[#D7E0F0] border-tinta text-tinta',
  despacho: 'bg-[#F3DCC2] border-[#7A3E0C] text-[#4A2507]',
};

function estiloEvento(ev) {
  if (ev.estado === 'completado') return 'bg-transparent border-dashed border-gray-400 text-gray-500';
  if (ev.estado === 'en_proceso' || ev.estado === 'en_porteria') return 'bg-tinta border-tinta text-papel';
  return ESTILOS_TIPO[ev.tipo] || ESTILOS_TIPO.recepcion;
}

const MARCA_ESTADO = { completado: '✓', en_proceso: '●', en_porteria: '●', confirmado: '◆', cancelado: '✕', programado: '' };

const PUNTO_TIPO = {
  recepcion: 'bg-tinta',
  despacho: 'bg-[#7A3E0C]',
};

export default function Calendario({ eventos, obraActivaId, autenticado, esAdmin, onRango, agregar, agregarSerie, actualizar, eliminar, eliminarSerieDesde, buscarConflictos }) {
  // En el celular la semana de 7 columnas no cabe: se abre en vista Día.
  const [vista, setVista] = useState(() => (window.innerWidth < 640 ? 'dia' : 'semana')); // 'dia' | 'semana' | 'mes'
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

  // Arrastrar para reprogramar (mouse o lápiz; en pantallas táctiles no, para no mover camiones
  // al desplazar). Solo camiones aún no llegados. La base vuelve a revisar fechas pasadas,
  // completados y choques; si rechaza, el aviso aparece arriba.
  const arrastre = useRef(null);
  const [destino, setDestino] = useState(null); // { dia, hora, x, y }

  function sePuedeMover(ev) {
    return !soloLectura(ev) && (ev.estado === 'programado' || ev.estado === 'confirmado');
  }

  // Día y hora bajo el puntero. Las columnas llevan data-dia y data-px (px por minuto; 0 = mes).
  function calcularDestino(x, y) {
    const a = arrastre.current;
    const col = document.elementFromPoint(x, y)?.closest('[data-dia]');
    if (!a || !col) return null;
    const dia = col.dataset.dia;
    if (!esAdmin && dia < hoyISO()) return null;
    const px = Number(col.dataset.px);
    let hora = a.ev.horaInicio;
    if (px) {
      const caja = col.getBoundingClientRect();
      const bruto = HORA_INICIO * 60 + (y - caja.top) / px - a.desfaseMin;
      const min = Math.min(Math.max(Math.round(bruto / 15) * 15, HORA_INICIO * 60), HORA_FIN * 60 - Number(a.ev.duracionMin));
      hora = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    }
    return { dia, hora };
  }

  function empezarArrastre(e, ev, pxPorMin) {
    if (!sePuedeMover(ev) || e.button !== 0 || e.pointerType === 'touch') return;
    const caja = e.currentTarget.getBoundingClientRect();
    arrastre.current = { ev, desfaseMin: pxPorMin ? (e.clientY - caja.top) / pxPorMin : 0, x0: e.clientX, y0: e.clientY, moviendo: false };

    const mover = (m) => {
      const a = arrastre.current;
      if (!a) return;
      if (!a.moviendo && Math.hypot(m.clientX - a.x0, m.clientY - a.y0) < 6) return;
      a.moviendo = true;
      m.preventDefault();
      const d = calcularDestino(m.clientX, m.clientY);
      setDestino(d ? { ...d, x: m.clientX, y: m.clientY } : null);
    };
    const soltar = (u) => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
      const a = arrastre.current;
      setDestino(null);
      if (!a?.moviendo) {
        arrastre.current = null;
        return;
      }
      // El clic que sigue a soltar no debe abrir el camión.
      a.recienSoltado = true;
      setTimeout(() => (arrastre.current = null), 0);
      const d = calcularDestino(u.clientX, u.clientY);
      if (!d || (d.dia === a.ev.fecha && d.hora === a.ev.horaInicio)) return;
      actualizar(a.ev.id, { fecha: d.dia, horaInicio: d.hora });
    };
    const cancelar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
      arrastre.current = null;
      setDestino(null);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', cancelar);
  }

  function abrirSiNoSeArrastro(ev) {
    if (arrastre.current?.recienSoltado) return;
    abrirExistente(ev);
  }

  function abrirExistente(evento) {
    setModal({ evento });
  }

  function cerrar() {
    setModal(null);
  }

  function guardar(datos, fechas) {
    if (modal?.evento) actualizar(modal.evento.id, datos);
    else if (fechas?.length > 1) agregarSerie(datos, fechas);
    else agregar(datos);
    cerrar();
  }

  function borrarSerie(evento) {
    eliminarSerieDesde(evento);
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
              <Button variant="secondary" aria-label="Día anterior" onClick={() => setDiaReferencia((d) => sumarDias(d, -1))}>
                ←<span className="hidden sm:inline"> Día anterior</span>
              </Button>
              <Button variant="secondary" onClick={irAHoy}>
                Hoy
              </Button>
              <Button variant="secondary" aria-label="Día siguiente" onClick={() => setDiaReferencia((d) => sumarDias(d, 1))}>
                <span className="hidden sm:inline">Día siguiente </span>→
              </Button>
            </>
          )}
          {vista === 'semana' && (
            <>
              <Button variant="secondary" aria-label="Semana anterior" onClick={() => setSemanaInicio((s) => sumarDias(s, -7))}>
                ←<span className="hidden sm:inline"> Semana anterior</span>
              </Button>
              <Button variant="secondary" onClick={irAHoy}>
                Hoy
              </Button>
              <Button variant="secondary" aria-label="Semana siguiente" onClick={() => setSemanaInicio((s) => sumarDias(s, 7))}>
                <span className="hidden sm:inline">Semana siguiente </span>→
              </Button>
            </>
          )}
          {vista === 'mes' && (
            <>
              <Button variant="secondary" aria-label="Mes anterior" onClick={() => setMesReferencia((m) => sumarMeses(m, -1))}>
                ←<span className="hidden sm:inline"> Mes anterior</span>
              </Button>
              <Button variant="secondary" onClick={irAHoy}>
                Hoy
              </Button>
              <Button variant="secondary" aria-label="Mes siguiente" onClick={() => setMesReferencia((m) => sumarMeses(m, 1))}>
                <span className="hidden sm:inline">Mes siguiente </span>→
              </Button>
            </>
          )}
        </div>
        <h2 className="font-mono text-lg font-medium uppercase tracking-wide text-tinta">
          {vista === 'dia' && capitalizar(etiquetaFechaLarga(diaReferencia))}
          {vista === 'semana' && etiquetaRango(dias[0], dias[6])}
          {vista === 'mes' && etiquetaMes(mesReferencia)}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex border border-tinta">
            <button
              onClick={() => setVista('dia')}
              className={`min-h-[40px] px-4 text-sm font-medium transition ${'dia' !== 'dia' ? 'border-l border-tinta' : ''} ${vista === 'dia' ? 'bg-rvc text-white' : 'text-tinta hover:bg-tinta/5'}`}
            >
              Día
            </button>
            <button
              onClick={() => setVista('semana')}
              className={`min-h-[40px] px-4 text-sm font-medium transition ${'semana' !== 'dia' ? 'border-l border-tinta' : ''} ${vista === 'semana' ? 'bg-rvc text-white' : 'text-tinta hover:bg-tinta/5'}`}
            >
              Semana
            </button>
            <button
              onClick={() => setVista('mes')}
              className={`min-h-[40px] px-4 text-sm font-medium transition ${'mes' !== 'dia' ? 'border-l border-tinta' : ''} ${vista === 'mes' ? 'bg-rvc text-white' : 'text-tinta hover:bg-tinta/5'}`}
            >
              Mes
            </button>
          </div>
          {autenticado && (
            <Button onClick={() => abrirNuevo(vista === 'dia' && (esAdmin || diaReferencia >= hoyISO()) ? diaReferencia : hoyISO(), '09:00')}>+ Nuevo camión</Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-tinta pt-2 font-mono text-[11px] uppercase tracking-wide text-gray-600 no-print">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 border border-tinta bg-[#D7E0F0]" /> Recepción
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 border border-[#7A3E0C] bg-[#F3DCC2]" /> Despacho
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 border border-tinta bg-tinta" /> ● En portería / descargando
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 border border-dashed border-gray-400" /> ✓ Completado
        </span>
        <span>◆ Confirmado</span>
      </div>

      {vista === 'dia' && (
        <Card className="overflow-hidden">
          <div className="relative grid grid-cols-[60px_1fr]" style={{ height: `${ALTO_TOTAL_DIA}px` }}>
            <div className="relative border-r border-gray-300">
              {horas.map((h) => (
                <div
                  key={h}
                  className={`absolute right-1.5 font-mono text-[11px] text-gray-500 ${h === HORA_INICIO ? 'translate-y-1' : '-translate-y-2'}`}
                  style={{ top: `${(h - HORA_INICIO) * 60 * PX_POR_MIN_DIA}px` }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            <div
              className={`relative ${destino?.dia === diaReferencia ? 'bg-rvc/[0.06]' : ''}`}
              data-dia={diaReferencia}
              data-px={PX_POR_MIN_DIA}
              onDoubleClick={() => abrirNuevo(diaReferencia, '09:00')}
            >
              {horas.map((h) => (
                <div
                  key={h}
                  className="absolute w-full cursor-pointer border-t border-gray-200 hover:bg-tinta/5"
                  style={{ top: `${(h - HORA_INICIO) * 60 * PX_POR_MIN_DIA}px`, height: `${60 * PX_POR_MIN_DIA}px` }}
                  onClick={() => abrirNuevo(diaReferencia, `${String(h).padStart(2, '0')}:00`)}
                  title="Click para agendar un camión"
                />
              ))}

              {eventosPorFecha[diaReferencia]?.map((ev) => {
                const estado = estadoInfo(ev.estado);
                const estiloTipo = estiloEvento(ev);
                const esProveedor = ev.tipo === 'recepcion';
                return (
                  <button
                    key={ev.id}
                    onPointerDown={(e) => empezarArrastre(e, ev, PX_POR_MIN_DIA)}
                    title={sePuedeMover(ev) ? 'Arrastrá para cambiar la hora' : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirSiNoSeArrastro(ev);
                    }}
                    className={`absolute left-1 right-1 z-10 ${sePuedeMover(ev) ? 'cursor-grab select-none active:cursor-grabbing' : ''} overflow-hidden border px-2 py-1 text-left text-xs leading-tight hover:shadow-md ${estiloTipo} ${ev.estado === 'cancelado' ? 'opacity-50 line-through' : ''}`}
                    style={posicionEvento(ev, PX_POR_MIN_DIA)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">
                        <span className="font-mono font-normal">{ev.horaInicio}–{horaFin(ev)}</span> · {tipoInfo(ev.tipo).label}
                      </span>
                      <span className="font-mono text-[10px] uppercase">
                        {MARCA_ESTADO[ev.estado]} {estado.label}
                      </span>
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
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-tinta font-mono text-xs uppercase tracking-wide text-tinta">
            <div />
            {dias.map((dia) => (
              <div
                key={dia}
                className={`border-l border-gray-300 px-2 py-2 text-center ${esHoy(dia) ? 'bg-rvc font-medium text-white' : ''}`}
              >
                {etiquetaDia(dia)}
              </div>
            ))}
          </div>

          <div className="relative grid grid-cols-[60px_repeat(7,1fr)]" style={{ height: `${ALTO_TOTAL}px` }}>
            <div className="relative border-r border-gray-300">
              {horas.map((h) => (
                <div
                  key={h}
                  className={`absolute right-1.5 font-mono text-[11px] text-gray-500 ${h === HORA_INICIO ? 'translate-y-1' : '-translate-y-2'}`}
                  style={{ top: `${(h - HORA_INICIO) * 60 * PX_POR_MIN}px` }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {dias.map((dia) => (
              <div
                key={dia}
                className={`relative border-l border-gray-300 ${destino?.dia === dia ? 'bg-rvc/[0.08]' : esHoy(dia) ? 'bg-rvc/[0.04]' : ''}`}
                data-dia={dia}
                data-px={PX_POR_MIN}
                onDoubleClick={() => abrirNuevo(dia, '09:00')}
              >
                {horas.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full cursor-pointer border-t border-gray-200 hover:bg-tinta/5"
                    style={{ top: `${(h - HORA_INICIO) * 60 * PX_POR_MIN}px`, height: `${60 * PX_POR_MIN}px` }}
                    onClick={() => abrirNuevo(dia, `${String(h).padStart(2, '0')}:00`)}
                    title="Click para agendar un camión"
                  />
                ))}

                {eventosPorFecha[dia]?.map((ev) => {
                  const estado = estadoInfo(ev.estado);
                  const estiloTipo = estiloEvento(ev);
                  return (
                    <button
                      key={ev.id}
                      onPointerDown={(e) => empezarArrastre(e, ev, PX_POR_MIN)}
                      title={sePuedeMover(ev) ? 'Arrastrá para cambiar el día o la hora' : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirSiNoSeArrastro(ev);
                      }}
                      className={`absolute left-1 right-1 z-10 ${sePuedeMover(ev) ? 'cursor-grab select-none active:cursor-grabbing' : ''} overflow-hidden border px-1.5 py-1 text-left text-[11px] leading-tight hover:shadow-md ${estiloTipo} ${ev.estado === 'cancelado' ? 'opacity-50 line-through' : ''}`}
                      style={posicionEvento(ev)}
                    >
                      <div className="font-mono text-[10px]">
                        {ev.horaInicio}–{horaFin(ev)} {MARCA_ESTADO[ev.estado]}
                      </div>
                      <div className="truncate font-bold">{ev.material || tipoInfo(ev.tipo).label}</div>
                      {ev.proveedorCliente && <div className="truncate opacity-80">{ev.proveedorCliente}</div>}
                      <span className="sr-only">{estado.label}</span>
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
          <div className="grid grid-cols-7 border-b border-tinta font-mono text-xs uppercase tracking-wide text-tinta">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
              <div key={d} className="border-l border-gray-300 px-2 py-2 text-center first:border-l-0">
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
                    data-dia={dia}
                    data-px="0"
                    className={`cursor-pointer border-l border-gray-200 p-1.5 first:border-l-0 hover:bg-tinta/5 ${destino?.dia === dia ? 'bg-rvc/[0.08]' : fueraDeMes ? 'bg-gray-100/60' : ''}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        verDia(dia);
                      }}
                      className={`mb-1 inline-flex h-7 min-w-[28px] items-center justify-center px-1 font-mono text-xs hover:ring-1 hover:ring-tinta ${
                        esHoy(dia) ? 'bg-rvc font-medium text-white' : fueraDeMes ? 'text-gray-400' : 'text-tinta'
                      }`}
                      title="Ver este día"
                    >
                      {Number(dia.slice(8, 10))}
                    </button>
                    <div className="space-y-0.5">
                      {visibles.map((ev) => (
                        <button
                          key={ev.id}
                          onPointerDown={(e) => empezarArrastre(e, ev, 0)}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirSiNoSeArrastro(ev);
                          }}
                          className={`flex w-full items-center gap-1 truncate border ${sePuedeMover(ev) ? 'cursor-grab select-none' : ''} px-1 py-0.5 text-left text-[10px] leading-tight hover:opacity-80 ${
                            ev.estado === 'cancelado' ? 'opacity-50 line-through' : ''
                          } ${estiloEvento(ev)}`}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 ${PUNTO_TIPO[ev.tipo] || PUNTO_TIPO.recepcion}`} />
                          <span className="shrink-0 font-mono">{ev.horaInicio}</span>
                          <span className="truncate">{ev.proveedorCliente || tipoInfo(ev.tipo).label}</span>
                        </button>
                      ))}
                      {restantes > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            verDia(dia);
                          }}
                          className="w-full truncate px-1 py-0.5 text-left font-mono text-[10px] text-gray-500 hover:text-tinta hover:underline"
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

      {destino && (
        <div
          className="pointer-events-none fixed z-50 border border-tinta bg-tinta px-2 py-1 font-mono text-xs text-white shadow-xl"
          style={{ left: destino.x + 14, top: destino.y + 14 }}
        >
          {etiquetaDia(destino.dia)} · {destino.hora}
        </div>
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
              onEliminarSerie={borrarSerie}
              buscarConflictos={buscarConflictos}
            />
          ))}
      </Modal>
    </div>
  );
}
