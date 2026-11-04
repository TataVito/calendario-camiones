// Color propio por material (los mismos del calendario de despachos de la obra) y lectura de
// la lista de materiales que el importador deja en observaciones.

import { MARCA_REF, normalizar } from './importarCalendario.js';

// Palabra clave (sin tildes, minúsculas) -> color base. El orden importa: lo más específico primero.
const COLORES = [
  ['ceramica blanca', '#B08A1E'],
  ['ceramica', '#B5651D'],
  ['porcelanato', '#B5651D'],
  ['revestimiento', '#B5651D'],
  ['mortero', '#E8871E'],
  ['bemezcla', '#E8871E'],
  ['yeso', '#2C4A5E'],
  ['alfombra', '#3E7D5C'],
  ['perfil', '#5C6B73'],
  ['cem', '#6B6B6B'],
  ['papel', '#7D5BA6'],
  ['piso', '#6B7A3A'],
  ['grifer', '#2E86AB'],
  ['monomando', '#2E86AB'],
  ['mueble', '#8B5E3C'],
  ['vanitorio', '#8B5E3C'],
  ['wc', '#4A6FA5'],
  ['sanitario', '#4A6FA5'],
  ['tina', '#3AA6A0'],
  ['moldura', '#A3446B'],
  ['espejo', '#5456B8'],
  ['horno', '#C0392B'],
  ['cocina', '#C0392B'],
  ['adhesivo', '#8A9A1B'],
  ['fragu', '#8A9A1B'],
  ['puerta', '#1F7A6C'],
  ['sifon', '#E07A5F'],
  ['lavaplato', '#B04A9A'],
  ['poliestireno', '#1FA58E'],
  ['autoniv', '#9B47AD'],
  ['pvc', '#2E9C78'],
  ['quincaller', '#7A3F8F'],
  ['calibrado', '#A85050'],
  ['termo', '#B8562E'],
];

// Para materiales que no están en la lista: color fijo según el nombre.
const RESPALDO = ['#3D5A80', '#7B6D3A', '#8E4162', '#2F7D6D', '#A0522D', '#5B5EA6', '#6E7F2D', '#9C4A3C'];

function mezclar(hex, conBlanco) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * conBlanco));
  return `rgb(${c.join(',')})`;
}

function oscurecer(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `rgb(${c.join(',')})`;
}

export function colorBase(material) {
  const m = normalizar(material);
  if (!m) return null;
  const palabras = m.split(' ');
  for (const [clave, color] of COLORES) {
    const ok = clave.includes(' ') ? m.includes(clave) : palabras.some((p) => (clave.length <= 3 ? p === clave : p.startsWith(clave)));
    if (ok) return color;
  }
  let h = 0;
  for (const ch of m) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return RESPALDO[h % RESPALDO.length];
}

// Estilo en línea para el bloque del camión (fondo claro, borde y texto del color del material).
export function estiloMaterial(material) {
  const base = colorBase(material);
  if (!base) return undefined;
  return { backgroundColor: mezclar(base, 0.86), borderColor: mezclar(base, 0.45), color: oscurecer(base, 0.72), borderLeft: `4px solid ${base}` };
}

// Separa las observaciones en: lista de materiales con cantidad, y notas libres.
// Las líneas técnicas del importador (referencia, "Importado del...") no se muestran.
export function leerObservaciones(observaciones) {
  const items = [];
  const notas = [];
  for (const linea of (observaciones || '').split('\n')) {
    const t = linea.trim();
    if (!t || t === 'Materiales:' || t.startsWith(MARCA_REF) || /^Importado de(l| la) /.test(t)) continue;
    if (t.startsWith('• ')) {
      const [desc, cant] = t.slice(2).split(' — ');
      items.push({ descripcion: desc, cantidad: cant || '' });
    } else notas.push(t.replace(/^Nota del día: /, ''));
  }
  return { items, notas };
}
