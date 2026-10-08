-- marcar_porteria: mensaje claro cuando el camión ya está completado o cancelado.
create or replace function public.marcar_porteria(p_evento uuid, p_paso text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rol text := public.rol_actual();
  ev public.eventos;
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if rol not in ('porteria', 'editor', 'admin') then
    raise exception 'Tu usuario no puede registrar movimientos de portería.' using errcode = 'P0001';
  end if;

  select * into ev from public.eventos where id = p_evento for update;
  if not found or not public.puede_ver_obra(ev.obra_id) then
    raise exception 'Camión no encontrado.' using errcode = 'P0001';
  end if;
  if rol = 'porteria' and ev.fecha <> hoy then
    raise exception 'Portería solo puede registrar camiones de hoy.' using errcode = 'P0001';
  end if;
  if ev.estado in ('completado', 'cancelado') then
    raise exception 'Este camión ya está %.', case ev.estado when 'completado' then 'completado' else 'cancelado' end
      using errcode = 'P0001';
  end if;

  perform set_config('calendario.porteria', '1', true);

  if p_paso = 'llego' then
    if ev.estado not in ('programado', 'confirmado') then
      raise exception 'Este camión ya fue registrado en portería.' using errcode = 'P0001';
    end if;
    update public.eventos set estado = 'en_porteria', llegada_real = now() where id = p_evento;
  elsif p_paso = 'inicio' then
    if ev.estado <> 'en_porteria' then
      raise exception 'Primero hay que registrar la llegada.' using errcode = 'P0001';
    end if;
    update public.eventos set estado = 'en_proceso', inicio_proceso_real = now() where id = p_evento;
  elsif p_paso = 'termino' then
    if ev.estado not in ('en_porteria', 'en_proceso') then
      raise exception 'Primero hay que registrar la llegada.' using errcode = 'P0001';
    end if;
    update public.eventos
      set estado = 'completado',
          inicio_proceso_real = coalesce(inicio_proceso_real, now()),
          salida_real = now()
      where id = p_evento;
  else
    raise exception 'Paso desconocido.' using errcode = 'P0001';
  end if;

  perform set_config('calendario.porteria', '', true);
end;
$$;

revoke execute on function public.marcar_porteria(uuid, text) from public, anon;
grant execute on function public.marcar_porteria(uuid, text) to authenticated;
