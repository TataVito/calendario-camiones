import { estadoInfo, formaDescargaInfo, horaFin, tipoInfo } from './useEventos.js';

function aFecha(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fechaHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

// Exporta los camiones (ya filtrados y ordenados) a un .xlsx que se descarga.
// SheetJS se carga solo al exportar, para no engordar la app.
export async function exportarExcel(eventos, { obra, desde, hasta }) {
  const XLSX = await import('xlsx');

  const filas = eventos.map((ev) => ({
    Obra: obra,
    Fecha: aFecha(ev.fecha),
    'Hora llegada': ev.horaInicio,
    'Hora término': horaFin(ev),
    'Duración (min)': Number(ev.duracionMin),
    Tipo: tipoInfo(ev.tipo).label,
    'N° guía / OC': ev.guiaOC || '',
    'Proveedor / cliente': ev.proveedorCliente || '',
    Recurso: ev.material || '',
    'Forma de descarga': formaDescargaInfo(ev.formaDescarga).label,
    Estado: estadoInfo(ev.estado).label,
    Observaciones: ev.observaciones || '',
    'Creado por': ev.creadoPorUsuario || '',
    'Modificado por': ev.actualizadoPorUsuario || '',
    'Última modificación': fechaHora(ev.actualizadoEn),
  }));

  const hoja = XLSX.utils.json_to_sheet(filas, { cellDates: true, dateNF: 'dd-mm-yyyy' });
  if (filas.length === 0) XLSX.utils.sheet_add_aoa(hoja, [['Sin camiones en el rango seleccionado']], { origin: 'A1' });

  // Ancho de columnas según el contenido más largo (con tope) y filtro en la cabecera.
  const columnas = Object.keys(filas[0] || { Obra: '' });
  hoja['!cols'] = columnas.map((col) => {
    const largo = Math.max(col.length, ...filas.map((f) => (f[col] instanceof Date ? 10 : String(f[col]).length)));
    return { wch: Math.min(Math.max(largo + 2, 8), 50) };
  });
  if (filas.length) hoja['!autofilter'] = { ref: hoja['!ref'] };

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Camiones');

  const limpio = (s) => s.replace(/[\\/:*?"<>|]/g, '').trim();
  const rango = desde === hasta ? desde : `${desde || 'inicio'}_a_${hasta || 'fin'}`;
  XLSX.writeFile(libro, `Camiones ${limpio(obra)} ${rango}.xlsx`, { compression: true });
}
