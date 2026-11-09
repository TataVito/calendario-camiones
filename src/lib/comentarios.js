import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { leerObservaciones } from './materiales.js';

// Hora de Chile en formato corto "dd-mm hh:mm" (el mismo de los comentarios antiguos).
export function cuandoCorto(iso) {
  return new Date(iso)
    .toLocaleString('en-GB', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .replace(/\//g, '-')
    .replace(', ', ' ');
}

// Comentarios de un camión (tabla evento_comentarios), más los que quedaran en observaciones
// de antes de la migración. Autor y hora los pone la base.
export function useComentarios(evento) {
  const [lista, setLista] = useState([]);
  const [error, setError] = useState('');
  const id = evento?.id;

  const cargar = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await supabase
      .from('evento_comentarios')
      .select('id, texto, autor_usuario, creado_en')
      .eq('evento_id', id)
      .order('creado_en');
    if (err) return setError(err.message);
    setError('');
    setLista(data.map((c) => ({ id: c.id, texto: c.texto, autor: c.autor_usuario, cuando: cuandoCorto(c.creado_en) })));
  }, [id]);

  // Se recarga también cuando cambia el último comentario del camión (llega por Realtime).
  useEffect(() => {
    cargar();
  }, [cargar, evento?.ultimoComentario]);

  const agregar = useCallback(
    async (texto) => {
      const limpio = texto.replace(/\s+/g, ' ').trim();
      if (!limpio) return true;
      const { error: err } = await supabase.from('evento_comentarios').insert({ evento_id: id, obra_id: evento.obraId, texto: limpio });
      if (err) {
        setError(err.message);
        return false;
      }
      await cargar();
      return true;
    },
    [id, evento?.obraId, cargar],
  );

  const antiguos = leerObservaciones(evento?.observaciones).comentarios;
  return { comentarios: [...antiguos, ...lista], agregar, error };
}
