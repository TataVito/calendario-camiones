import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { inicioSemana, sumarDias } from './fechas.js';

// Pendientes de la obra: lo que faltó en un camión (o se anotó a mano) hasta que llega.
// Autor, horas y obra los pone la base (trigger marcar_pendiente).

export function aPendiente(f) {
  return {
    id: f.id,
    obraId: f.obra_id,
    eventoId: f.evento_id,
    descripcion: f.descripcion,
    cantidad: f.cantidad || '',
    proveedor: f.proveedor || '',
    material: f.material || '',
    fechaOrigen: f.fecha_origen,
    estado: f.estado,
    nota: f.nota || '',
    creadoPorUsuario: f.creado_por_usuario || '',
    creadoEn: f.creado_en,
    resueltoPorUsuario: f.resuelto_por_usuario || '',
    resueltoEn: f.resuelto_en,
  };
}

// Periodos para filtrar por la fecha en que quedó pendiente.
export const PERIODOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'pasada', label: 'Semana pasada' },
];

export function enPeriodo(p, periodo, hoy) {
  if (periodo === 'todos') return true;
  const lunes = inicioSemana(hoy);
  if (periodo === 'semana') return p.fechaOrigen >= lunes && p.fechaOrigen <= sumarDias(lunes, 6);
  if (periodo === 'pasada') return p.fechaOrigen >= sumarDias(lunes, -7) && p.fechaOrigen < lunes;
  return true;
}

// Días que lleva pendiente (desde la fecha del camión o de cuando se anotó).
export function diasPendiente(p, hoy) {
  const a = Date.parse(`${p.fechaOrigen}T12:00:00Z`);
  const b = Date.parse(`${hoy}T12:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function textoDias(n) {
  if (n === 0) return 'hoy';
  if (n === 1) return 'hace 1 día';
  return `hace ${n} días`;
}

// Abiertos primero (los más antiguos arriba); los resueltos, los últimos en llegar arriba.
export function ordenar(lista) {
  return [...lista].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1;
    if (a.estado === 'pendiente') return a.fechaOrigen.localeCompare(b.fechaOrigen) || a.creadoEn.localeCompare(b.creadoEn);
    return (b.resueltoEn || '').localeCompare(a.resueltoEn || '');
  });
}

export function usePendientesObra(obraId) {
  const [lista, setLista] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!obraId) {
      setLista([]);
      setCargando(false);
      return;
    }
    // Todos los abiertos + los resueltos de los últimos 60 días.
    const desde = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data, error: err } = await supabase
      .from('pendientes')
      .select('*')
      .eq('obra_id', obraId)
      .or(`estado.eq.pendiente,resuelto_en.gte.${desde}`)
      .order('fecha_origen')
      .limit(1000);
    setCargando(false);
    if (err) return setError(err.message);
    setError('');
    setLista(data.map(aPendiente));
  }, [obraId]);

  useEffect(() => {
    setCargando(true);
    cargar();
    if (!obraId) return undefined;
    const canal = supabase
      .channel(`pendientes-${obraId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pendientes', filter: `obra_id=eq.${obraId}` }, () => cargar())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pendientes' }, () => cargar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [obraId, cargar]);

  const resultado = useCallback(
    async (promesa) => {
      const { error: err } = await promesa;
      if (err) {
        setError(err.message);
        return false;
      }
      setError('');
      await cargar();
      return true;
    },
    [cargar],
  );

  // items: [{ descripcion, cantidad, proveedor?, material?, eventoId? , fechaOrigen? }]
  const agregar = useCallback(
    (items) => {
      const filas = items
        .filter((it) => it.descripcion?.trim())
        .map((it) => ({
          obra_id: obraId,
          evento_id: it.eventoId || null,
          descripcion: it.descripcion.trim(),
          cantidad: (it.cantidad || '').trim(),
          proveedor: (it.proveedor || '').trim(),
          material: (it.material || '').trim(),
          ...(it.fechaOrigen ? { fecha_origen: it.fechaOrigen } : {}),
        }));
      if (!filas.length) return Promise.resolve(true);
      return resultado(supabase.from('pendientes').insert(filas));
    },
    [obraId, resultado],
  );

  const resolver = useCallback(
    (id, nota = '') => resultado(supabase.from('pendientes').update({ estado: 'resuelto', nota: nota.trim() }).eq('id', id)),
    [resultado],
  );
  const reabrir = useCallback((id) => resultado(supabase.from('pendientes').update({ estado: 'pendiente' }).eq('id', id)), [resultado]);
  const modificar = useCallback(
    (id, datos) =>
      resultado(
        supabase
          .from('pendientes')
          .update({ descripcion: datos.descripcion.trim(), cantidad: (datos.cantidad || '').trim(), proveedor: (datos.proveedor || '').trim(), material: (datos.material || '').trim() })
          .eq('id', id),
      ),
    [resultado],
  );
  const eliminar = useCallback((id) => resultado(supabase.from('pendientes').delete().eq('id', id)), [resultado]);

  const abiertos = useMemo(() => lista.filter((p) => p.estado === 'pendiente'), [lista]);
  const abiertosPorEvento = useMemo(() => {
    const m = {};
    for (const p of abiertos) if (p.eventoId) m[p.eventoId] = (m[p.eventoId] || 0) + 1;
    return m;
  }, [abiertos]);

  return { lista, abiertos, abiertosPorEvento, cargando, error, limpiarError: () => setError(''), agregar, resolver, reabrir, modificar, eliminar };
}

const Contexto = createContext(null);

// `valor` es el resultado de usePendientesObra (se llama una vez, en la raíz de la app).
export function PendientesProvider({ valor, children }) {
  return createElement(Contexto.Provider, { value: valor }, children);
}

// Fuera del proveedor devuelve una versión vacía (por ejemplo, en pruebas).
const VACIO = { lista: [], abiertos: [], abiertosPorEvento: {}, cargando: false, error: '', limpiarError() {}, agregar: async () => true, resolver: async () => true, reabrir: async () => true, modificar: async () => true, eliminar: async () => true };

export function usePendientes() {
  return useContext(Contexto) || VACIO;
}
