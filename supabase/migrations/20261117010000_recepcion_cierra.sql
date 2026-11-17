-- Recepción puede marcar un camión como Completo o Incompleto (pedido de Víctor, 17-11-2026).
-- Nada más: no marca No recibido ni Cancelado, no edita otros datos, no anota pendientes ni
-- comentarios. Se hace con esta función porque la tabla eventos no deja editar al rol porteria.
--  * Solo camiones de sus obras que ya llegaron (tienen hora de llegada) y no están cancelados.
--  * Un camión Completo queda bloqueado como siempre: solo un administrador lo cambia.
--  * Incompleto se puede cambiar después a Completo.
-- Re-ejecutable.

create or replace function public.cerrar_recepcion(p_evento uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rol text := public.rol_actual();
  ev public.eventos;
begin
  if rol not in ('porteria', 'editor', 'admin', 'superusuario') then
    raise exception 'Tu usuario no puede cerrar camiones.' using errcode = 'P0001';
  end if;
  if p_estado not in ('completado', 'incompleto') then
    raise exception 'Recepción solo puede marcar Completo o Incompleto.' using errcode = 'P0001';
  end if;

  select * into ev from public.eventos where id = p_evento for update;
  if not found or not public.puede_ver_obra(ev.obra_id) then
    raise exception 'Camión no encontrado.' using errcode = 'P0001';
  end if;
  if ev.estado = 'cancelado' then
    raise exception 'Este camión está cancelado.' using errcode = 'P0001';
  end if;
  if ev.llegada_real is null then
    raise exception 'Primero hay que registrar la llegada.' using errcode = 'P0001';
  end if;
  if ev.estado = 'completado' and rol not in ('admin', 'superusuario') then
    raise exception 'Este camión ya está completado: solo un administrador puede modificarlo.' using errcode = 'P0001';
  end if;
  if ev.estado = p_estado then
    return;
  end if;

  perform set_config('calendario.porteria', '1', true);
  update public.eventos set estado = p_estado where id = p_evento;
  perform set_config('calendario.porteria', '', true);
end;
$$;

revoke execute on function public.cerrar_recepcion(uuid, text) from public, anon;
grant execute on function public.cerrar_recepcion(uuid, text) to authenticated;
