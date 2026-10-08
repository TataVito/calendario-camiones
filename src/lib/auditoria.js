import { estadoInfo, formaDescargaInfo, tipoInfo } from './useEventos.js';

export const ACCIONES = [
  { value: 'crear', label: 'Creó', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'modificar', label: 'Modificó', color: 'bg-sky-100 text-sky-700 border-sky-300' },
  { value: 'eliminar', label: 'Eliminó', color: 'bg-red-100 text-red-700 border-red-300' },
];

export function accionInfo(value) {
  return ACCIONES.find((a) => a.value === value) || ACCIONES[1];
}

export const TABLAS = { eventos: 'Camión', obras: 'Obra', usuarios: 'Usuario', evento_fotos: 'Foto' };

// Columnas que se muestran en los cambios, con su etiqueta y cómo presentar el valor.
const COLUMNAS = {
  nombre: { label: 'Nombre' },
  direccion: { label: 'Dirección' },
  tipo: { label: 'Tipo', fmt: (v) => tipoInfo(v).label },
  fecha: { label: 'Fecha' },
  hora_inicio: { label: 'Hora' },
  duracion_min: { label: 'Duración', fmt: (v) => `${v} min` },
  guia_oc: { label: 'N° guía / OC' },
  proveedor_cliente: { label: 'Proveedor / cliente' },
  material: { label: 'Recurso' },
  forma_descarga: { label: 'Forma de descarga', fmt: (v) => formaDescargaInfo(v).label },
  estado: { label: 'Estado', fmt: (v) => estadoInfo(v).label },
  observaciones: { label: 'Observaciones' },
  obra_id: { label: 'Obra' },
  usuario: { label: 'Usuario' },
  rol: { label: 'Rol' },
  clave: { label: 'Clave' },
  obras: { label: 'Obras' },
  llegada_real: { label: 'Llegada real', fmt: (v) => fechaHora(v) },
  inicio_proceso_real: { label: 'Inicio descarga real', fmt: (v) => fechaHora(v) },
  salida_real: { label: 'Salida real', fmt: (v) => fechaHora(v) },
  ruta: { label: 'Archivo', fmt: (v) => v.split('/').pop() },
};

function fmt(col, v) {
  if (v === null || v === undefined || v === '') return '—';
  return COLUMNAS[col]?.fmt ? COLUMNAS[col].fmt(v) : String(v);
}

// Lista de { campo, antes, despues } legibles. En crear/eliminar, los datos del registro.
export function cambios(entrada, nombreObra = (id) => id) {
  const { antes, despues, accion } = entrada;
  const valor = (col, v) => {
    if (col === 'obra_id') return nombreObra(v);
    if (col === 'obras') return Array.isArray(v) && v.length ? v.map(nombreObra).join(', ') : '—';
    return fmt(col, v);
  };
  if (accion === 'modificar') {
    return Object.keys(COLUMNAS)
      .filter((col) => antes && despues && col in despues && JSON.stringify(antes[col]) !== JSON.stringify(despues[col]))
      .map((col) => ({ campo: COLUMNAS[col].label, antes: valor(col, antes[col]), despues: valor(col, despues[col]) }));
  }
  const fila = despues || antes || {};
  return Object.keys(COLUMNAS)
    .filter((col) => col in fila && fila[col] !== '' && fila[col] !== null && col !== 'obra_id')
    .map((col) => ({ campo: COLUMNAS[col].label, valor: valor(col, fila[col]) }));
}

// Descripción corta del registro afectado.
export function resumen(entrada) {
  const f = entrada.despues || entrada.antes || {};
  if (entrada.tabla === 'eventos') {
    const detalle = f.material || f.proveedor_cliente;
    return `${tipoInfo(f.tipo).label} ${f.fecha} ${f.hora_inicio}${detalle ? ` · ${detalle}` : ''}`;
  }
  if (entrada.tabla === 'obras') return f.nombre || '';
  if (entrada.tabla === 'evento_fotos') return `Foto de guía (${f.subido_por_usuario || '—'})`;
  return f.usuario || '';
}

export function fechaHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
