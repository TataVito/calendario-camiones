-- Recepción (antes «Portería») solo registra horas: llegada, inicio y salida.
-- Ya no cierra el camión: Completo / Incompleto / No recibido lo decide la obra en la ficha.
--  * «Terminó y salió» guarda la hora de salida y deja el estado como estaba.
--  * Llegada e inicio siguen moviendo un camión ABIERTO a «En recepción» / «En proceso»,
--    pero nunca tocan un estado de cierre que la obra ya haya puesto.
--  * Si la obra cerró el camión antes de que saliera, Recepción igual puede anotar las horas.
-- Re-ejecutable.

create or replace function public.marcar_porteria(p_evento uuid, p_paso text, p_momento timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rol text := public.rol_actual();
  ev public.eventos;
  t timestamptz := coalesce(p_momento, now());
  dia date;
  abierto boolean;
begin
  if rol not in ('porteria', 'editor', 'admin', 'superusuario') then
    raise exception 'Tu usuario no puede registrar movimientos de recepción.' using errcode = 'P0001';
  end if;
  if p_momento is not null and (p_momento > now() + interval '2 minutes' or p_momento < now() - interval '12 hours') then
    raise exception 'La hora registrada no es válida (solo se aceptan marcas de las últimas 12 horas).' using errcode = 'P0001';
  end if;
  dia := (t at time zone 'America/Santiago')::date;

  select * into ev from public.eventos where id = p_evento for update;
  if not found or not public.puede_ver_obra(ev.obra_id) then
    raise exception 'Camión no encontrado.' using errcode = 'P0001';
  end if;
  if rol = 'porteria' and ev.fecha <> dia then
    raise exception 'Recepción solo puede registrar camiones de hoy.' using errcode = 'P0001';
  end if;
  if ev.estado = 'cancelado' then
    raise exception 'Este camión está cancelado.' using errcode = 'P0001';
  end if;
  abierto := ev.estado in ('programado', 'confirmado', 'en_porteria', 'en_proceso');

  perform set_config('calendario.porteria', '1', true);

  if p_paso = 'llego' then
    if ev.llegada_real is not null then
      raise exception 'La llegada de este camión ya fue registrada.' using errcode = 'P0001';
    end if;
    update public.eventos
      set llegada_real = t,
          estado = case when ev.estado in ('programado', 'confirmado') then 'en_porteria' else estado end
      where id = p_evento;
  elsif p_paso = 'inicio' then
    if ev.llegada_real is null then
      raise exception 'Primero hay que registrar la llegada.' using errcode = 'P0001';
    end if;
    if ev.inicio_proceso_real is not null then
      raise exception 'El inicio de este camión ya fue registrado.' using errcode = 'P0001';
    end if;
    update public.eventos
      set inicio_proceso_real = greatest(t, ev.llegada_real),
          estado = case when abierto then 'en_proceso' else estado end
      where id = p_evento;
  elsif p_paso = 'termino' then
    if ev.llegada_real is null then
      raise exception 'Primero hay que registrar la llegada.' using errcode = 'P0001';
    end if;
    if ev.salida_real is not null then
      raise exception 'La salida de este camión ya fue registrada.' using errcode = 'P0001';
    end if;
    -- El estado no cambia: la obra lo cierra en la ficha.
    update public.eventos
      set inicio_proceso_real = coalesce(inicio_proceso_real, greatest(t, ev.llegada_real)),
          salida_real = greatest(t, coalesce(ev.inicio_proceso_real, ev.llegada_real)),
          estado = case when abierto then 'en_proceso' else estado end
      where id = p_evento;
  else
    raise exception 'Paso desconocido.' using errcode = 'P0001';
  end if;

  perform set_config('calendario.porteria', '', true);
end;
$$;

revoke execute on function public.marcar_porteria(uuid, text, timestamptz) from public, anon;
grant execute on function public.marcar_porteria(uuid, text, timestamptz) to authenticated;

-- Recepción puede anotar horas aunque la obra ya haya marcado el camión como Completo.
-- (La marca calendario.porteria solo la pone marcar_porteria, que solo toca horas y estados abiertos.)
create or replace function public.reglas_eventos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if auth.uid() is null
     or public.rol_actual() in ('admin', 'superusuario')
     or current_setting('calendario.sistema', true) = '1'
     or current_setting('calendario.porteria', true) = '1' then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.estado = 'completado' then
    raise exception 'Este camión ya está completado: solo un administrador puede %.',
      case tg_op when 'UPDATE' then 'modificarlo' else 'eliminarlo' end
      using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' and new.fecha < hoy then
    raise exception 'No se puede agendar un camión en una fecha anterior a hoy (%).', to_char(hoy, 'DD-MM-YYYY')
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and new.fecha is distinct from old.fecha and new.fecha < hoy then
    raise exception 'No se puede mover un camión a una fecha anterior a hoy (%).', to_char(hoy, 'DD-MM-YYYY')
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;
