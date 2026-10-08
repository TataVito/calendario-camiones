import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Field, Input, Select } from '../components/ui.jsx';
import { supabase } from '../lib/supabase.js';
import { aEvento, hoyChile } from '../lib/useEventos.js';
import { atrasoMin, duracionTexto, esPuntual, promedio, tiempoDescargaMin, tiempoEnObraMin, TOLERANCIA_MIN } from '../lib/tiempos.js';
import { desdeISO, sumarDias } from '../lib/fechas.js';

const PAGINA = 1000;

async function cargarEventos({ obraId, desde, hasta }) {
  const filas = [];
  for (let i = 0; ; i += PAGINA) {
    let q = supabase.from('eventos').select('*').gte('fecha', desde).lte('fecha', hasta);
    if (obraId) q = q.eq('obra_id', obraId);
    const { data, error } = await q.order('fecha').order('hora_inicio').range(i, i + PAGINA - 1);
    if (error) throw error;
    filas.push(...data);
    if (data.length < PAGINA) break;
  }
  return filas.map(aEvento);
}

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');

// Agrupa y calcula los indicadores de cada grupo.
function indicadores(lista) {
  const activos = lista.filter((ev) => ev.estado !== 'cancelado');
  const llegados = activos.filter((ev) => ev.llegadaReal);
  const puntuales = llegados.filter((ev) => esPuntual(ev));
  const atrasos = llegados.map(atrasoMin).filter((a) => a > TOLERANCIA_MIN);
  return {
    camiones: activos.length,
    recepciones: activos.filter((ev) => ev.tipo === 'recepcion').length,
    despachos: activos.filter((ev) => ev.tipo === 'despacho').length,
    completados: activos.filter((ev) => ev.estado === 'completado').length,
    cancelados: lista.length - activos.length,
    conRegistro: llegados.length,
    puntualidad: pct(puntuales.length, llegados.length),
    atrasados: atrasos.length,
    atrasoProm: promedio(atrasos),
    enObraProm: promedio(activos.map(tiempoEnObraMin)),
    descargaProm: promedio(activos.map(tiempoDescargaMin)),
  };
}

function agrupar(lista, clave) {
  const grupos = {};
  for (const ev of lista) (grupos[clave(ev) || '(sin dato)'] ||= []).push(ev);
  return Object.entries(grupos)
    .map(([nombre, evs]) => ({ nombre, ...indicadores(evs) }))
    .sort((a, b) => b.camiones - a.camiones);
}

function Tile({ titulo, valor, detalle }) {
  return (
    <Card className="p-3">
      <div className="font-mono text-[10px] uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className="font-mono text-2xl font-medium text-tinta">{valor}</div>
      {detalle && <div className="text-xs text-gray-500">{detalle}</div>}
    </Card>
  );
}

// Columnas de camiones por día: una serie, sin leyenda; el detalle va en el tooltip.
function GraficoPorDia({ dias }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...dias.map((d) => d.total));
  const ALTO = 160;
  const cada = Math.ceil(dias.length / 12);
  return (
    <div className="relative">
      <div className="flex h-[176px] items-stretch gap-[2px] border-b border-gray-200 pt-4">
        {dias.map((d, i) => (
          <div
            key={d.fecha}
            className="relative flex flex-1 cursor-default items-end justify-center"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {d.total === max && max > 0 && (
              <span className="absolute text-[11px] text-gray-600" style={{ bottom: (d.total / max) * ALTO + 2 }}>
                {d.total}
              </span>
            )}
            <div
              className={`w-full max-w-[24px] rounded-t ${hover === i ? 'bg-[#3B5A9A]' : 'bg-tinta'}`}
              style={{ height: d.total ? Math.max(2, (d.total / max) * ALTO) : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] pt-1">
        {dias.map((d, i) => (
          <div key={d.fecha} className="flex-1 text-center text-[10px] text-gray-500">
            {i % cada === 0 ? `${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}` : ''}
          </div>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow"
          style={{ left: `${((hover + 0.5) / dias.length) * 100}%` }}
        >
          <div className="font-medium text-gray-900">{desdeISO(dias[hover].fecha).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: '2-digit' })}</div>
          <div className="text-gray-600">
            {dias[hover].total} camiones · {dias[hover].recepciones} recep. · {dias[hover].despachos} desp.
          </div>
        </div>
      )}
    </div>
  );
}

function TablaGrupos({ titulo, filas, etiqueta }) {
  return (
    <Card className="overflow-x-auto">
      <h3 className="px-4 pt-3 text-sm font-semibold text-gray-800">{titulo}</h3>
      <table className="mt-2 w-full min-w-[640px] text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">{etiqueta}</th>
            <th className="px-3 py-2 text-right">Camiones</th>
            <th className="px-3 py-2 text-right">Completados</th>
            <th className="px-3 py-2 text-right">Puntualidad</th>
            <th className="px-3 py-2 text-right">Atraso prom.</th>
            <th className="px-3 py-2 text-right">En obra prom.</th>
            <th className="px-3 py-2 text-right">Descarga prom.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map((f) => (
            <tr key={f.nombre}>
              <td className="px-3 py-2 text-gray-900">{f.nombre}</td>
              <td className="px-3 py-2 text-right">{f.camiones}</td>
              <td className="px-3 py-2 text-right">{f.completados}</td>
              <td className="px-3 py-2 text-right">
                {f.puntualidad} <span className="text-xs text-gray-400">({f.conRegistro})</span>
              </td>
              <td className="px-3 py-2 text-right">{f.atrasados ? duracionTexto(f.atrasoProm) : '—'}</td>
              <td className="px-3 py-2 text-right">{duracionTexto(f.enObraProm)}</td>
              <td className="px-3 py-2 text-right">{duracionTexto(f.descargaProm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function exportar(datos, nombre) {
  const XLSX = await import('xlsx');
  const fila = (f) => ({
    Nombre: f.nombre,
    Camiones: f.camiones,
    Recepciones: f.recepciones,
    Despachos: f.despachos,
    Completados: f.completados,
    Cancelados: f.cancelados,
    'Con registro portería': f.conRegistro,
    Puntualidad: f.puntualidad,
    Atrasados: f.atrasados,
    'Atraso promedio (min)': f.atrasoProm === null ? '' : Math.round(f.atrasoProm),
    'En obra promedio (min)': f.enObraProm === null ? '' : Math.round(f.enObraProm),
    'Descarga promedio (min)': f.descargaProm === null ? '' : Math.round(f.descargaProm),
  });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet([fila({ nombre: 'Total', ...datos.total })]), 'Resumen');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(datos.porProveedor.map(fila)), 'Por proveedor');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(datos.porRecurso.map(fila)), 'Por recurso');
  if (datos.porObra.length > 1) XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(datos.porObra.map(fila)), 'Por obra');
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(datos.dias.map((d) => ({ Fecha: d.fecha, Camiones: d.total, Recepciones: d.recepciones, Despachos: d.despachos }))),
    'Por día',
  );
  XLSX.writeFile(libro, `${nombre.replace(/[\\/:*?"<>|]/g, '')}.xlsx`, { compression: true });
}

export default function Reportes({ obras, obraActivaId }) {
  const hoy = hoyChile();
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [alcance, setAlcance] = useState(obraActivaId);
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!desde || !hasta || desde > hasta) return;
    let vigente = true;
    setCargando(true);
    cargarEventos({ obraId: alcance, desde, hasta })
      .then((evs) => vigente && (setEventos(evs), setError('')))
      .catch((e) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [alcance, desde, hasta]);

  const nombreObra = (id) => obras.find((o) => o.id === id)?.nombre || '(obra)';

  const datos = useMemo(() => {
    const dias = [];
    if (desde && hasta && desde <= hasta) {
      for (let f = desde; f <= hasta && dias.length < 400; f = sumarDias(f, 1)) {
        const evs = eventos.filter((ev) => ev.fecha === f && ev.estado !== 'cancelado');
        dias.push({
          fecha: f,
          total: evs.length,
          recepciones: evs.filter((ev) => ev.tipo === 'recepcion').length,
          despachos: evs.filter((ev) => ev.tipo === 'despacho').length,
        });
      }
    }
    return {
      total: indicadores(eventos),
      porProveedor: agrupar(eventos, (ev) => ev.proveedorCliente?.trim()),
      porRecurso: agrupar(eventos, (ev) => ev.material?.trim()),
      porObra: agrupar(eventos, (ev) => nombreObra(ev.obraId)),
      dias,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos, desde, hasta, obras]);

  const t = datos.total;
  const tituloAlcance = alcance ? nombreObra(alcance) : 'Todas mis obras';

  return (
    <div className="space-y-4">
      <Card className="p-4 no-print">
        <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-5">
          <Field label="Desde">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Field>
          <Field label="Obra">
            <Select value={alcance} onChange={(e) => setAlcance(e.target.value)}>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
              {obras.length > 1 && <option value="">Todas mis obras</option>}
            </Select>
          </Field>
          <div className="flex gap-2 md:col-span-2 md:justify-end">
            <Button variant="secondary" onClick={() => exportar(datos, `Reporte camiones ${tituloAlcance} ${desde} a ${hasta}`)} disabled={!eventos.length}>
              📊 Exportar reporte a Excel
            </Button>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {cargando && <p className="text-sm text-gray-500">Cargando…</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile titulo="Camiones" valor={t.camiones} detalle={`${t.recepciones} recepciones · ${t.despachos} despachos`} />
        <Tile titulo="Completados" valor={t.completados} detalle={`${t.cancelados} cancelados`} />
        <Tile
          titulo={`Puntualidad (±${TOLERANCIA_MIN} min)`}
          valor={t.puntualidad}
          detalle={`de ${t.conRegistro} con llegada registrada`}
        />
        <Tile titulo="Atraso promedio" valor={t.atrasados ? duracionTexto(t.atrasoProm) : '—'} detalle={`${t.atrasados} llegaron tarde`} />
        <Tile titulo="Tiempo en obra promedio" valor={duracionTexto(t.enObraProm)} detalle="de llegada a salida" />
        <Tile titulo="Descarga / carga promedio" valor={duracionTexto(t.descargaProm)} detalle="de inicio a salida" />
      </div>

      <Card className="p-4">
        <h3 className="mb-1 text-sm font-semibold text-gray-800">Camiones por día</h3>
        <p className="mb-2 text-xs text-gray-500">{tituloAlcance} · sin cancelados</p>
        {datos.dias.length ? <GraficoPorDia dias={datos.dias} /> : <p className="text-sm text-gray-400">Elegí un rango de fechas válido.</p>}
      </Card>

      {t.conRegistro === 0 && eventos.length > 0 && (
        <p className="border border-[#B07A1E] bg-[#F6EBD4] text-[#5C3D06] px-3 py-2 text-sm">
          Todavía no hay horas reales registradas en este período: la puntualidad y los tiempos se calculan con los
          registros de la pestaña Portería.
        </p>
      )}

      <TablaGrupos titulo="Por proveedor / cliente" etiqueta="Proveedor / cliente" filas={datos.porProveedor} />
      <TablaGrupos titulo="Por recurso" etiqueta="Recurso" filas={datos.porRecurso} />
      {!alcance && datos.porObra.length > 1 && <TablaGrupos titulo="Por obra" etiqueta="Obra" filas={datos.porObra} />}
    </div>
  );
}
