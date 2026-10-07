import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'rvc_calendario_obras_v1';
const ACTIVA_KEY = 'rvc_calendario_obra_activa_v1';

function cargarObras() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function cargarActiva() {
  return localStorage.getItem(ACTIVA_KEY) || '';
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useObras() {
  const [obras, setObras] = useState(cargarObras);
  const [obraActivaId, setObraActivaId] = useState(cargarActiva);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obras));
  }, [obras]);

  useEffect(() => {
    localStorage.setItem(ACTIVA_KEY, obraActivaId || '');
  }, [obraActivaId]);

  // Si la obra activa fue eliminada, o no hay ninguna seleccionada, cae a la primera disponible.
  useEffect(() => {
    if (obras.length === 0) {
      if (obraActivaId) setObraActivaId('');
      return;
    }
    if (!obraActivaId || !obras.some((o) => o.id === obraActivaId)) {
      setObraActivaId(obras[0].id);
    }
  }, [obras, obraActivaId]);

  const agregarObra = useCallback((datos) => {
    const nueva = { id: uid(), ...datos };
    setObras((prev) => [...prev, nueva]);
    setObraActivaId(nueva.id);
    return nueva;
  }, []);

  const actualizarObra = useCallback((id, datos) => {
    setObras((prev) => prev.map((o) => (o.id === id ? { ...o, ...datos } : o)));
  }, []);

  const eliminarObra = useCallback((id) => {
    setObras((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const obraActiva = obras.find((o) => o.id === obraActivaId) || null;

  return { obras, obraActivaId, setObraActivaId, obraActiva, agregarObra, actualizarObra, eliminarObra };
}
