import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { guardarLocal, leerLocal } from './local.js';

// La obra seleccionada es una preferencia de este navegador; las obras viven en Supabase.
const ACTIVA_KEY = 'rvc_calendario_obra_activa_v1';

function cargarActiva() {
  try {
    return localStorage.getItem(ACTIVA_KEY) || '';
  } catch {
    return '';
  }
}

function aObra(fila) {
  return { id: fila.id, nombre: fila.nombre, direccion: fila.direccion };
}

export function useObras() {
  const [obras, setObras] = useState([]);
  const [obraActivaId, setObraActivaId] = useState(cargarActiva);
  const [error, setError] = useState('');

  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('obras').select('id, nombre, direccion').order('creado_en');
    if (error) {
      // Sin señal: la última lista conocida.
      const local = leerLocal('obras');
      if (local) setObras(local);
      else setError(error.message);
      return;
    }
    const lista = data.map(aObra);
    setObras(lista);
    guardarLocal('obras', lista);
  }, []);

  useEffect(() => {
    recargar();
    const canal = supabase
      .channel('obras')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'obras' }, recargar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [recargar]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVA_KEY, obraActivaId || '');
    } catch {
      // sin almacenamiento local: solo se pierde la preferencia
    }
  }, [obraActivaId]);

  // Si la obra activa fue eliminada, o no hay ninguna seleccionada, cae a la primera disponible.
  useEffect(() => {
    if (obras.length === 0) return;
    if (!obraActivaId || !obras.some((o) => o.id === obraActivaId)) {
      setObraActivaId(obras[0].id);
    }
  }, [obras, obraActivaId]);

  const agregarObra = useCallback(
    async (datos) => {
      // El id se genera aquí: la asignación de la obra a su creador ocurre después del insert,
      // así que no se puede pedir la fila de vuelta en la misma operación.
      const id = crypto.randomUUID();
      const { error } = await supabase.from('obras').insert({ id, nombre: datos.nombre, direccion: datos.direccion || '' });
      if (error) return setError(error.message);
      await recargar();
      setObraActivaId(id);
    },
    [recargar],
  );

  const actualizarObra = useCallback(
    async (id, datos) => {
      const { error } = await supabase.from('obras').update({ nombre: datos.nombre, direccion: datos.direccion || '' }).eq('id', id);
      if (error) setError(error.message);
      await recargar();
    },
    [recargar],
  );

  // Los eventos de la obra se borran en cascada en la base.
  const eliminarObra = useCallback(
    async (id) => {
      const { error } = await supabase.from('obras').delete().eq('id', id);
      if (error) setError(error.message);
      await recargar();
    },
    [recargar],
  );

  const obraActiva = obras.find((o) => o.id === obraActivaId) || null;

  return { obras, obraActivaId, setObraActivaId, obraActiva, agregarObra, actualizarObra, eliminarObra, error, limpiarError: () => setError('') };
}
