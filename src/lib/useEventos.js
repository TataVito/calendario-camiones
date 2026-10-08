import { useCallback, useEffect, useRef, useState } from 'react';
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

export function aEvento(fila) {
  const ev = {
    id: fila.id,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
    creadoPorUsuario: fila.creado_por_usuario,
    actualizadoPorUsuario: fila.actualizado_por_usuario,
    llegadaReal: fila.llegada_real,
    inicioProcesoReal: fila.inicio_proceso_real,
    salidaReal: fila.salida_real,
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
  { value: 'programado', label: 'Programado', color: 'bg-transparent text-gray-600 border-gray-400' },
  { value: 'confirmado', label: 'Confirmado', color: 'bg-[#D7E0F0] text-tinta border-tinta' },
  { value: 'en_porteria', label: 'En portería', color: 'bg-tinta/10 text-tinta border-tinta' },
  { value: 'en_proceso', label: 'En proceso (carga/descarga)', color: 'bg-tinta text-papel border-tinta' },
  { value: 'completado', label: 'Completado', color: 'bg-transparent text-[#2E6B4F] border-[#2E6B4F] border-dashed' },
  { value: 'cancelado', label: 'Cancelado', color: 'bg-transparent text-[#B3261E] border-[#B3261E] line-through' },
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

// Fecha de hoy en Chile (la misma que usan las reglas de la base).
export function hoyChile() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

// Camiones de UNA obra en un rango de fechas (siempre incluye hoy, para el resumen y portería).
// Se mantiene al día con Realtime aplicando cada cambio, sin volver a descargar todo.
export function useEventos(obraId, rango) {
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState('');

  const hoy = hoyChile();
  const desde = rango?.desde ? (rango.desde < hoy ? rango.desde : hoy) : '';
  const hasta = rango?.hasta ? (rango.hasta > hoy ? rango.hasta : hoy) : '';

  const dentro = useCallback(
    (ev) => ev.obraId === obraId && (!desde || ev.fecha >= desde) && (!hasta || ev.fecha <= hasta),
    [obraId, desde, hasta],
  );

  const recargar = useCallback(async () => {
    if (!obraId) return setEventos([]);
    let q = supabase.from('eventos').select('*').eq('obra_id', obraId);
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data, error } = await q.order('fecha').order('hora_inicio').limit(5000);
    if (error) setError(error.message);
    else setEventos(data.map(aEvento));
  }, [obraId, desde, hasta]);

  useEffect(() => {
    setEventos([]);
    recargar();
  }, [recargar]);

  // Realtime por obra. DELETE no admite filtro: llega de todas las obras y se descarta si no está.
  const dentroRef = useRef(dentro);
  dentroRef.current = dentro;
  useEffect(() => {
    if (!obraId) return;
    const aplicar = ({ eventType, new: nueva, old }) => {
      setEventos((prev) => {
        const id = eventType === 'DELETE' ? old.id : nueva.id;
        const sin = prev.filter((ev) => ev.id !== id);
        if (eventType === 'DELETE') return sin.length === prev.length ? prev : sin;
        const ev = aEvento(nueva);
        if (!dentroRef.current(ev)) return sin;
        return [...sin, ev].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
      });
    };
    const canal = supabase
      .channel(`eventos-${obraId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos', filter: `obra_id=eq.${obraId}` }, aplicar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'eventos', filter: `obra_id=eq.${obraId}` }, aplicar)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'eventos' }, aplicar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [obraId]);

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

  const marcarPorteria = useCallback(
    async (id, paso) => {
      const { error } = await supabase.rpc('marcar_porteria', { p_evento: id, p_paso: paso });
      if (error) setError(error.message);
      await recargar();
      return !error;
    },
    [recargar],
  );

  // Choques: se consultan en la base para esa fecha (no dependen de lo que haya cargado).
  const buscarConflictos = useCallback(async (candidato, excluirId) => {
    if (!candidato.fecha || !candidato.horaInicio || !candidato.obraId) return [];
    const { data } = await supabase
      .from('eventos')
      .select('*')
      .eq('obra_id', candidato.obraId)
      .eq('fecha', candidato.fecha)
      .neq('estado', 'cancelado');
    const finCandidato = sumarMinutos(candidato.horaInicio, candidato.duracionMin);
    return (data || [])
      .map(aEvento)
      .filter((ev) => ev.id !== excluirId && seSolapan(candidato.horaInicio, finCandidato, ev.horaInicio, horaFin(ev)));
  }, []);

  return { eventos, agregar, actualizar, eliminar, marcarPorteria, buscarConflictos, recargar, error, limpiarError: () => setError('') };
}
