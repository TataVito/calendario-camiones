import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

// Columnas de la tabla public.eventos <-> campos que usa la UI.
const CAMPOS = {
  obraId: 'obra_id',
  tipo: 'tipo',
  fecha: 'fecha',
  horaInicio: 'hora_inicio',
  duracionMin: 'duracion_min',
  guiaOC: 'guia_oc',
  proveedorCliente: 'proveedor_cliente',
  material: 'material',
  formaDescarga: 'forma_descarga',
  estado: 'estado',
  observaciones: 'observaciones',
};

function aEvento(fila) {
  const ev = {
    id: fila.id,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    creadoPorUsuario: fila.creado_por_usuario,
    actualizadoPorUsuario: fila.actualizado_por_usuario,
  };
  for (const [campo, columna] of Object.entries(CAMPOS)) ev[campo] = fila[columna];
  return ev;
}

function aFila(datos) {
  const fila = {};
  for (const [campo, columna] of Object.entries(CAMPOS)) {
    if (datos[campo] !== undefined) fila[columna] = datos[campo];
  }
  if (fila.duracion_min !== undefined) fila.duracion_min = Number(fila.duracion_min);
  return fila;
}

export const ESTADOS = [
  { value: 'programado', label: 'Programado', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'confirmado', label: 'Confirmado', color: 'bg-sky-100 text-sky-700 border-sky-300' },
  { value: 'en_porteria', label: 'En portería', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'en_proceso', label: 'En proceso (carga/descarga)', color: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  { value: 'completado', label: 'Completado', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'cancelado', label: 'Cancelado', color: 'bg-red-100 text-red-700 border-red-300' },
];

export const TIPOS = [
  { value: 'recepcion', label: 'Recepción', color: 'blue' },
  { value: 'despacho', label: 'Despacho', color: 'amber' },
];

export const FORMAS_DESCARGA = [
  { value: 'manual', label: 'Manual' },
  { value: 'grua_horquilla', label: 'Grúa horquilla' },
  { value: 'grua_torre', label: 'Grúa torre' },
  { value: 'grua_auxiliar', label: 'Grúa auxiliar' },
];

export function formaDescargaInfo(value) {
  return FORMAS_DESCARGA.find((f) => f.value === value) || FORMAS_DESCARGA[0];
}

export const RECURSOS_SUGERIDOS = [
  'Hormigón',
  'Fierro / Acero',
  'Áridos (arena, gravilla)',
  'Cemento',
  'Madera',
  'Ladrillos / Bloques',
  'Yeso / Estuco',
  'Maquinaria / Equipos',
  'Residuos / Escombros',
];

export function estadoInfo(value) {
  return ESTADOS.find((e) => e.value === value) || ESTADOS[0];
}

export function tipoInfo(value) {
  return TIPOS.find((t) => t.value === value) || TIPOS[0];
}

export function toMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function sumarMinutos(hhmm, minutos) {
  const total = toMinutos(hhmm) + minutos;
  const h = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const m = ((total % 1440) + 1440) % 1440 % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function horaFin(evento) {
  return sumarMinutos(evento.horaInicio, evento.duracionMin);
}

function seSolapan(aInicio, aFin, bInicio, bFin) {
  return toMinutos(aInicio) < toMinutos(bFin) && toMinutos(bInicio) < toMinutos(aFin);
}

export function useEventos() {
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState('');

  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('eventos').select('*').order('fecha').order('hora_inicio');
    if (error) setError(error.message);
    else setEventos(data.map(aEvento));
  }, []);

  useEffect(() => {
    recargar();
    const canal = supabase
      .channel('eventos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, recargar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [recargar]);

  const agregar = useCallback(
    async (datos) => {
      const { error } = await supabase.from('eventos').insert({ estado: 'programado', ...aFila(datos) });
      if (error) setError(error.message);
      await recargar();
    },
    [recargar],
  );

  const actualizar = useCallback(
    async (id, datos) => {
      const { error } = await supabase.from('eventos').update(aFila(datos)).eq('id', id);
      if (error) setError(error.message);
      await recargar();
    },
    [recargar],
  );

  const eliminar = useCallback(
    async (id) => {
      const { error } = await supabase.from('eventos').delete().eq('id', id);
      if (error) setError(error.message);
      await recargar();
    },
    [recargar],
  );

  const buscarConflictos = useCallback(
    (candidato, excluirId) => {
      if (!candidato.fecha || !candidato.horaInicio) return [];
      const finCandidato = sumarMinutos(candidato.horaInicio, candidato.duracionMin);
      return eventos.filter((ev) => {
        if (ev.id === excluirId) return false;
        if (ev.fecha !== candidato.fecha) return false;
        if (ev.obraId !== candidato.obraId) return false;
        if (ev.estado === 'cancelado') return false;
        return seSolapan(candidato.horaInicio, finCandidato, ev.horaInicio, horaFin(ev));
      });
    },
    [eventos],
  );

  return { eventos, agregar, actualizar, eliminar, buscarConflictos, recargar, error, limpiarError: () => setError('') };
}
