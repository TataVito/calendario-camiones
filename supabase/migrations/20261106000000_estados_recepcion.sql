-- Mejora 2026-11-06 (se puede ejecutar más de una vez):
--  * Dos estados nuevos para cerrar un camión ya agendado:
--      'incompleto'  -> llegó, pero faltó material
--      'no_recibido' -> no llegó / no se recibió
--  * Ninguno bloquea el camión (a diferencia de 'completado'): se puede seguir editando,
--    por ejemplo para reprogramar lo que faltó.

alter table public.eventos drop constraint if exists eventos_estado_check;
alter table public.eventos add constraint eventos_estado_check
  check (estado in ('programado', 'confirmado', 'en_porteria', 'en_proceso', 'completado', 'incompleto', 'no_recibido', 'cancelado'));
