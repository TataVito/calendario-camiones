-- Mejoras 2026-10-09 (se puede ejecutar más de una vez):
--  * Choques de horario revisados por la base, con bloqueo para que dos personas que agendan a la
--    vez no queden ambas sin aviso. Se permite agendar igual solo marcando choque_aceptado.
--  * serie_id: agrupa camiones recurrentes creados juntos.
--  * marcar_porteria acepta la hora real en que se pulsó (para marcas hechas sin señal y enviadas
--    después), acotada a las últimas 12 horas y sin futuro.

-- ---------------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------------
alter table public.eventos
  add column if not exists choque_aceptado boolean not null default false,
  add column if not exists serie_id uuid;

create index if not exists eventos_serie on public.eventos (serie_id) where serie_id is not null;

create or replace function public.minutos(p_hora text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select split_part(p_hora, ':', 1)::int * 60 + split_part(p_hora, ':', 2)::int;
$$;

-- ---------------------------------------------------------------------------
-- Choques de horario por obra y día
-- ---------------------------------------------------------------------------
create or replace function public.revisar_choques()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  choques text;
begin
  if new.estado = 'cancelado' then
    return new;
  end if;
  -- Cambios que no mueven el camión (estado, portería, textos) no se revisan.
  if tg_op = 'UPDATE'
     and new.obra_id = old.obra_id and new.fecha = old.fecha
     and new.hora_inicio = old.hora_inicio and new.duracion_min = old.duracion_min
     and old.estado <> 'cancelado' then
    return new;
  end if;

  -- Un solo guardado a la vez por obra y día: el segundo ve lo que guardó el primero.
  perform pg_advisory_xact_lock(hashtextextended(new.obra_id::text || '|' || new.fecha::text, 0));

  select string_agg(e.hora_inicio || '–' ||
           lpad(((public.minutos(e.hora_inicio) + e.duracion_min) / 60 % 24)::text, 2, '0') || ':' ||
           lpad(((public.minutos(e.hora_inicio) + e.duracion_min) % 60)::text, 2, '0') ||
           case when e.proveedor_cliente <> '' then ' (' || e.proveedor_cliente || ')' else '' end, ', '
           order by e.hora_inicio)
    into choques
  from public.eventos e
  where e.obra_id = new.obra_id
    and e.fecha = new.fecha
    and e.id <> new.id
    and e.estado <> 'cancelado'
    and int4range(public.minutos(e.hora_inicio), public.minutos(e.hora_inicio) + e.duracion_min)
        && int4range(public.minutos(new.hora_inicio), public.minutos(new.hora_inicio) + new.duracion_min);

  if choques is not null and not new.choque_aceptado then
    raise exception 'Choca con otro camión en el mismo horario: %. Para agendarlo igual, marcá "Agendar igual".', choques
      using errcode = 'P0001', hint = 'choque';
  end if;
  return new;
end;
$$;

revoke execute on function public.revisar_choques() from public, anon, authenticated;

drop trigger if exists eventos_choques on public.eventos;
create trigger eventos_choques
  before insert or update on public.eventos
  for each row execute function public.revisar_choques();

-- ---------------------------------------------------------------------------
-- Portería: hora real opcional (marcas hechas sin señal)
-- ---------------------------------------------------------------------------
drop function if exists public.marcar_porteria(uuid, text);

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
begin
  if rol not in ('porteria', 'editor', 'admin', 'superusuario') then
    raise exception 'Tu usuario no puede registrar movimientos de portería.' using errcode = 'P0001';
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
    update public.eventos set estado = 'en_porteria', llegada_real = t where id = p_evento;
  elsif p_paso = 'inicio' then
    if ev.estado <> 'en_porteria' then
      raise exception 'Primero hay que registrar la llegada.' using errcode = 'P0001';
    end if;
    update public.eventos set estado = 'en_proceso', inicio_proceso_real = greatest(t, ev.llegada_real) where id = p_evento;
  elsif p_paso = 'termino' then
    if ev.estado not in ('en_porteria', 'en_proceso') then
      raise exception 'Primero hay que registrar la llegada.' using errcode = 'P0001';
    end if;
    update public.eventos
      set estado = 'completado',
          inicio_proceso_real = coalesce(inicio_proceso_real, greatest(t, ev.llegada_real)),
          salida_real = greatest(t, coalesce(ev.inicio_proceso_real, ev.llegada_real))
      where id = p_evento;
  else
    raise exception 'Paso desconocido.' using errcode = 'P0001';
  end if;

  perform set_config('calendario.porteria', '', true);
end;
$$;

revoke execute on function public.marcar_porteria(uuid, text, timestamptz) from public, anon;
grant execute on function public.marcar_porteria(uuid, text, timestamptz) to authenticated;
