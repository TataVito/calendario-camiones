import { supabase } from './supabase.js';

const PAGINA = 1000;

async function todo(tabla, orden) {
  const filas = [];
  for (let i = 0; ; i += PAGINA) {
    const { data, error } = await supabase.from(tabla).select('*').order(orden).range(i, i + PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...data);
    if (data.length < PAGINA) return filas;
  }
}

// antes/después de la auditoría son JSON: se guardan como texto para que quepan en una celda.
const plano = (fila) =>
  Object.fromEntries(Object.entries(fila).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v]));

// Excel con todas las tablas (solo admin: RLS le deja leer todo). Las fotos no se incluyen,
// solo su registro; los archivos quedan en el Storage de Supabase.
export async function descargarRespaldo() {
  const XLSX = await import('xlsx');
  const tablas = [
    ['Obras', 'obras', 'creado_en'],
    ['Camiones', 'eventos', 'fecha'],
    ['Usuarios', 'perfiles', 'usuario'],
    ['Obras por usuario', 'obra_usuarios', 'obra_id'],
    ['Fotos', 'evento_fotos', 'subido_en'],
    ['Historial', 'auditoria', 'id'],
  ];
  const libro = XLSX.utils.book_new();
  const conteo = [];
  for (const [hoja, tabla, orden] of tablas) {
    const filas = (await todo(tabla, orden)).map(plano);
    XLSX.utils.book_append_sheet(libro, filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([['(vacío)']]), hoja);
    conteo.push(`${filas.length} ${hoja.toLowerCase()}`);
  }
  const ahora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).replace(/[: ]/g, '-').slice(0, 16);
  XLSX.writeFile(libro, `Respaldo calendario camiones ${ahora}.xlsx`, { compression: true });
  return conteo.join(', ');
}
