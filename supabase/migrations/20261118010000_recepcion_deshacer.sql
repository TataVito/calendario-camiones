-- Recepción puede deshacer su último paso si se equivocó (pedido de Víctor, 17-11-2026):
--   salió → vuelve a «Terminó y salió» pendiente; inicio → vuelve a «Empezó descarga»;
--   llegó → vuelve a «Llegó a recepción» y el camión al estado que tenía (programado o confirmado).
-- Se deshace un paso por vez, el último registrado. No toca Completo/Incompleto: un camión
-- Completo sigue bloqueado (solo un administrador lo cambia). Queda en el Historial.
-- Re-ejecutable.

create or replace function public.deshacer_porteria(p_evento uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  rol text := public.rol_actual();
  ev public.eventos;
  hoy date := (now() at time zone 'America/Santiago')::date;
  previo text;
  paso text;
begin
  if rol not in ('porteria', 'editor', 'admin', 'superusuario') then
    raise exception 'Tu usuario no puede registrar movimientos de recepción.' using errcode = 'P0001';
  end if;

  select * into ev from public.eventos where id = p_evento for update;
  if not found or not public.puede_ver_obra(ev.obra_id) then
    raise exception 'Camión no encontrado.' using errcode = 'P0001';
  end if;
  if rol = 'porteria' and ev.fecha <> hoy then
    raise exception 'Recepción solo puede corregir camiones de hoy.' using errcode = 'P0001';
  end if;
  if ev.estado = 'cancelado' then
    raise exception 'Este camión está cancelado.' using errcode = 'P0001';
  end if;
  if ev.estado = 'completado' and rol not in ('admin', 'superusuario') then
    raise exception 'Este camión ya está completado: solo un administrador puede modificarlo.' using errcode = 'P0001';
  end if;

  perform set_config('calendario.porteria', '1', true);

  if ev.salida_real is not null then
    paso := 'termino';
    update public.eventos set salida_real = null where id = p_evento;
  elsif ev.inicio_proceso_real is not null then
    paso := 'inicio';
    update public.eventos
       set inicio_proceso_real = null,
           estado = case when estado = 'en_proceso' then 'en_porteria' else estado end
     where id = p_evento;
  elsif ev.llegada_real is not null then
    paso := 'llego';
    -- Estado que tenía antes de la llegada (según el historial); si no se sabe, programado.
    select a.antes ->> 'estado' into previo
      from public.auditoria a
     where a.tabla = 'eventos' and a.registro_id = p_evento and a.accion = 'modificar'
       and a.despues ->> 'estado' = 'en_porteria' and a.antes ->> 'estado' in ('programado', 'confirmado')
     order by a.id desc limit 1;
    if previo is null or previo not in ('programado', 'confirmado') then
      previo := 'programado';
    end if;
    update public.eventos
       set llegada_real = null,
           estado = case when estado = 'en_porteria' then previo else estado end
     where id = p_evento;
  else
    perform set_config('calendario.porteria', '', true);
    raise exception 'Este camión no tiene pasos registrados para deshacer.' using errcode = 'P0001';
  end if;

  perform set_config('calendario.porteria', '', true);
  return paso;
end;
$$;

revoke execute on function public.deshacer_porteria(uuid) from public, anon;
grant execute on function public.deshacer_porteria(uuid) to authenticated;
