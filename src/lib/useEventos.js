import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'rvc_calendario_camiones_v1';

function cargar() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardar(eventos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(eventos));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
  const [eventos, setEventos] = useState(cargar);

  useEffect(() => {
    guardar(eventos);
  }, [eventos]);

  const agregar = useCallback((datos) => {
    const ahora = new Date().toISOString();
    const nuevo = { id: uid(), estado: 'programado', creadoEn: ahora, actualizadoEn: ahora, ...datos };
    setEventos((prev) => [...prev, nuevo]);
    return nuevo;
  }, []);

  const actualizar = useCallback((id, datos) => {
    setEventos((prev) =>
      prev.map((ev) => (ev.id === id ? { ...ev, ...datos, actualizadoEn: new Date().toISOString() } : ev)),
    );
  }, []);

  const eliminar = useCallback((id) => {
    setEventos((prev) => prev.filter((ev) => ev.id !== id));
  }, []);

  const eliminarPorObra = useCallback((obraId) => {
    setEventos((prev) => prev.filter((ev) => ev.obraId !== obraId));
  }, []);

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

  return { eventos, agregar, actualizar, eliminar, eliminarPorObra, buscarConflictos };
}
