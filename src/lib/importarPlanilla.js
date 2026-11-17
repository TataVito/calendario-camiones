// Importa la "Planilla de despachos" (.xlsx): la alternativa en Excel al calendario HTML.
// Devuelve los despachos con la misma forma que leerCalendarioHTML, para compararlos igual.
//
// Formato (hoja «Despachos», una fila por material; el modelo está en public/planilla-despachos.xlsx):
//   Fecha* · Hora · Material* · N° OC · Proveedor · Descripción · UM · Cantidad · Nota
// Las filas con la misma fecha, material, OC y proveedor son un mismo camión. Una fila sin fecha
// ni material, pero con descripción, sigue al camión de la fila de arriba.

import { normalizar } from './importarCalendario.js';

// Encabezado normalizado -> campo. Se aceptan algunas variantes.
const ENCABEZADOS = {
  fecha: 'fecha',
  'fecha de llegada': 'fecha',
  hora: 'hora',
  'hora de llegada': 'hora',
  material: 'material',
  familia: 'material',
  'n oc': 'oc',
  oc: 'oc',
  'orden de compra': 'oc',
  'n orden de compra': 'oc',
  proveedor: 'proveedor',
  descripcion: 'descripcion',
  detalle: 'descripcion',
  um: 'um',
  unidad: 'um',
  cantidad: 'cantidad',
  cant: 'cantidad',
  nota: 'nota',
  notas: 'nota',
  observaciones: 'nota',
};

const pad = (n) => String(n).padStart(2, '0');
const limpio = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// Fecha de Excel (número de serie), texto dd-mm-aaaa / dd/mm/aaaa / aaaa-mm-dd o Date -> 'AAAA-MM-DD'.
export function leerFecha(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const t = limpio(v);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return valida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

function valida(a, m, d) {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${pad(m)}-${pad(d)}`;
}

// Hora de Excel (fracción del día), texto 9:00 / 09:00 / 9.30 o Date -> 'HH:MM'.
export function leerHora(v) {
  if (v === '' || v == null) return '';
  let min;
  if (typeof v === 'number') min = Math.round((v - Math.floor(v)) * 1440) % 1440;
  else if (v instanceof Date) min = v.getHours() * 60 + v.getMinutes();
  else {
    const m = limpio(v).match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hrs?)?$/i);
    if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return null;
    min = +m[1] * 60 + +(m[2] || 0);
  }
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

function leerCantidad(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') return v.toLocaleString('es-CL', { maximumFractionDigits: 3 });
  return limpio(v);
}

// filas = arreglo de filas (cada una, arreglo de celdas) de la hoja.
export function leerPlanillaFilas(filas) {
  const iCab = filas.slice(0, 15).findIndex((f) => {
    const campos = f.map((c) => ENCABEZADOS[normalizar(String(c))]);
    return campos.includes('fecha') && campos.includes('material');
  });
  if (iCab < 0) throw new Error('No se encontró la fila de encabezados: la planilla debe tener al menos las columnas «Fecha» y «Material».');
  const col = {};
  filas[iCab].forEach((c, i) => {
    const campo = ENCABEZADOS[normalizar(String(c))];
    if (campo && col[campo] === undefined) col[campo] = i;
  });
  const celda = (f, campo) => (col[campo] === undefined ? '' : f[col[campo]]);

  const errores = [];
  const grupos = new Map();
  let anterior = null;
  for (let i = iCab + 1; i < filas.length; i++) {
    const f = filas[i];
    const n = i + 1; // número de fila como lo ve Excel
    if (!f || f.every((c) => limpio(c) === '')) continue;
    const fechaCruda = celda(f, 'fecha');
    const material = limpio(celda(f, 'material'));
    const descripcion = limpio(celda(f, 'descripcion'));
    const item = { descripcion, um: limpio(celda(f, 'um')), cantidad: leerCantidad(celda(f, 'cantidad')) };

    // Fila de continuación: más materiales del camión de arriba.
    if (limpio(fechaCruda) === '' && !material) {
      if (!descripcion) continue;
      if (!anterior) {
        errores.push(`Fila ${n}: falta la fecha y el material.`);
        continue;
      }
      anterior.materiales.push(item);
      continue;
    }
    const fecha = leerFecha(fechaCruda);
    if (!fecha) errores.push(`Fila ${n}: ${limpio(fechaCruda) ? `la fecha «${limpio(fechaCruda)}» no se entiende (usa dd-mm-aaaa)` : 'falta la fecha'}.`);
    if (!material) errores.push(`Fila ${n}: falta el material (es el nombre que se ve en el calendario).`);
    const hora = leerHora(celda(f, 'hora'));
    if (hora === null) errores.push(`Fila ${n}: la hora «${limpio(celda(f, 'hora'))}» no se entiende (usa HH:MM, por ejemplo 09:30).`);
    if (!fecha || !material || hora === null) {
      anterior = null;
      continue;
    }
    const oc = limpio(celda(f, 'oc'));
    const proveedor = limpio(celda(f, 'proveedor'));
    const nota = limpio(celda(f, 'nota'));
    const clave = [fecha, normalizar(material), normalizar(oc), normalizar(proveedor)].join('|');
    if (!grupos.has(clave)) grupos.set(clave, { fecha, hora: '', material, oc, proveedor, materiales: [], notas: [] });
    const g = grupos.get(clave);
    if (hora && !g.hora) g.hora = hora;
    if (nota && !g.notas.includes(nota)) g.notas.push(nota);
    if (descripcion) g.materiales.push(item);
    anterior = g;
  }
  if (errores.length) {
    const mas = errores.length > 12 ? `\n… y ${errores.length - 12} más.` : '';
    throw new Error(`Corrige la planilla y vuelve a subirla:\n${errores.slice(0, 12).join('\n')}${mas}`);
  }
  if (!grupos.size) throw new Error('La planilla no tiene despachos: llena al menos una fila con fecha y material.');

  // Referencia para reconocer el despacho al subir la planilla otra vez, aunque cambie de fecha:
  // OC + material (si la misma OC llega en varios camiones, se numeran por fecha).
  const despachos = [...grupos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '99').localeCompare(b.hora || '99'));
  const vistos = new Map();
  return despachos.map(({ notas, ...d }) => {
    const id = (t) => normalizar(t).replace(/ /g, '-');
    const base = d.oc ? `xlsx:oc-${id(d.oc)}:${id(d.material)}` : `xlsx:${id(d.proveedor) || 'sin-proveedor'}:${id(d.material)}:${d.fecha}`;
    const veces = (vistos.get(base) || 0) + 1;
    vistos.set(base, veces);
    return { ...d, ref: veces > 1 ? `${base}#${veces}` : base, nota: notas.join(' · ') };
  });
}

export async function leerPlanillaXLSX(buffer) {
  const XLSX = await import('xlsx');
  const libro = XLSX.read(buffer, { type: 'array' });
  const nombres = libro.SheetNames;
  // La hoja «Despachos»; si no está, la primera que tenga los encabezados (nunca Ejemplo ni Instrucciones).
  const candidatas = [
    ...nombres.filter((n) => normalizar(n) === 'despachos'),
    ...nombres.filter((n) => !['despachos', 'ejemplo', 'instrucciones'].includes(normalizar(n))),
  ];
  let primerError;
  for (const nombre of candidatas) {
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: '' });
    try {
      return leerPlanillaFilas(filas);
    } catch (err) {
      // Si la hoja tiene encabezados, su error es el que importa.
      if (!/encabezados/.test(err.message)) throw err;
      primerError ||= err;
    }
  }
  throw primerError || new Error('La planilla no tiene la hoja «Despachos».');
}
