-- Mejora 2026-11-09 (se puede ejecutar más de una vez):
--  * Comentarios en su propia tabla (evento_comentarios), con autor y hora puestos por la base:
--    no se pueden falsear ni se pierden si alguien edita las observaciones a mano.
--    Editor, admin y súper comentan en las obras que ven, también en camiones completados.
--    Nadie los modifica; solo el admin de la obra o el súper los puede borrar.
--  * eventos.ultimo_comentario: copia del último comentario (para mostrarlo en el calendario sin
--    cargar todos los comentarios). La mantiene la base; el cliente no la puede cambiar.
--  * eventos.ref_calendario: referencia del despacho en el calendario HTML de la obra (antes era
--    la línea "Ref. calendario: ..." dentro de observaciones).
--  * Los comentarios (líneas "💬 ...") y referencias que hoy están en observaciones se pasan a
--    la tabla y la columna nuevas, y se sacan de observaciones.
--  * Un cambio hecho por la base o desde el SQL Editor (sin usuario) ya no borra el
--    "modificado por" del camión.

-- ---------------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------------
alter table public.eventos
  add column if not exists ref_calendario text not null default '',
  add column if not exists ultimo_comentario text not null default '';

create index if not exists eventos_ref_calendario on public.eventos (obra_id, ref_calendario) where ref_calendario <> '';

-- ---------------------------------------------------------------------------
-- Tabla de comentarios
-- ---------------------------------------------------------------------------
create table if not exists public.evento_comentarios (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  obra_id uuid not null references public.obras (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 500),
  autor_id uuid references auth.users (id) on delete set null,
  autor_usuario text not null default '',
  creado_en timestamptz not null default now()
);

create index if not exists evento_comentarios_evento on public.evento_comentarios (evento_id, creado_en);

alter table public.evento_comentarios enable row level security;

-- Autor, hora y obra los pone la base (con usuario). Sin usuario (migración) se respeta lo que venga.
create or replace function public.marcar_comentario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.obra_id := (select obra_id from public.eventos where id = new.evento_id);
  new.texto := btrim(regexp_replace(new.texto, '\s+', ' ', 'g'));
  if auth.uid() is not null then
    new.autor_id := auth.uid();
    new.autor_usuario := public.usuario_actual();
    new.creado_en := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.marcar_comentario() from public, anon, authenticated;

drop trigger if exists evento_comentarios_marcar on public.evento_comentarios;
create trigger evento_comentarios_marcar
  before insert on public.evento_comentarios
  for each row execute function public.marcar_comentario();

-- Mantiene eventos.ultimo_comentario al agregar o borrar comentarios.
create or replace function public.actualizar_ultimo_comentario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev uuid := coalesce(new.evento_id, old.evento_id);
begin
  perform set_config('calendario.sistema', '1', true);
  update public.eventos
     set ultimo_comentario = coalesce(
       (select texto from public.evento_comentarios where evento_id = ev order by creado_en desc, id desc limit 1), '')
   where id = ev;
  perform set_config('calendario.sistema', '', true);
  return null;
end;
$$;

revoke execute on function public.actualizar_ultimo_comentario() from public, anon, authenticated;

drop trigger if exists evento_comentarios_ultimo on public.evento_comentarios;
create trigger evento_comentarios_ultimo
  after insert or delete on public.evento_comentarios
  for each row execute function public.actualizar_ultimo_comentario();

-- Historial: el comentario se anota una vez (en evento_comentarios); la copia en el camión no.
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  fila_despues jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  fila jsonb := coalesce(fila_despues, fila_antes);
  ignorar text[] := array['actualizado_en', 'actualizado_por', 'actualizado_por_usuario', 'ultimo_comentario'];
begin
  if tg_op = 'UPDATE' and (fila_antes - ignorar) = (fila_despues - ignorar) then
    return null;
  end if;

  insert into public.auditoria (usuario_id, usuario, accion, tabla, registro_id, obra_id, antes, despues)
  values (
    auth.uid(),
    public.usuario_actual(),
    case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'modificar' else 'eliminar' end,
    tg_table_name,
    (fila ->> 'id')::uuid,
    case when tg_table_name = 'obras' then (fila ->> 'id')::uuid else (fila ->> 'obra_id')::uuid end,
    fila_antes,
    fila_despues
  );
  return null;
end;
$$;

alter table public.auditoria drop constraint if exists auditoria_tabla_check;
alter table public.auditoria add constraint auditoria_tabla_check
  check (tabla in ('obras', 'eventos', 'usuarios', 'evento_fotos', 'evento_comentarios'));

drop trigger if exists evento_comentarios_auditoria on public.evento_comentarios;
create trigger evento_comentarios_auditoria
  after insert or delete on public.evento_comentarios
  for each row execute function public.registrar_auditoria();

drop policy if exists "comentarios: leer obras asignadas" on public.evento_comentarios;
create policy "comentarios: leer obras asignadas" on public.evento_comentarios
  for select to authenticated
  using (public.puede_ver_obra(obra_id));

-- obra_id se calcula en el trigger antes de revisar la política.
drop policy if exists "comentarios: crear editor" on public.evento_comentarios;
create policy "comentarios: crear editor" on public.evento_comentarios
  for insert to authenticated
  with check ((select public.rol_actual()) in ('editor', 'admin', 'superusuario') and public.puede_ver_obra(obra_id));

drop policy if exists "comentarios: borrar admin" on public.evento_comentarios;
create policy "comentarios: borrar admin" on public.evento_comentarios
  for delete to authenticated
  using ((select public.rol_actual()) in ('admin', 'superusuario') and public.puede_ver_obra(obra_id));

-- ---------------------------------------------------------------------------
-- eventos.ultimo_comentario: solo la cambia la base.
-- ---------------------------------------------------------------------------
create or replace function public.proteger_ultimo_comentario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or current_setting('calendario.sistema', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.ultimo_comentario := '';
  else
    new.ultimo_comentario := old.ultimo_comentario;
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_ultimo_comentario() from public, anon, authenticated;

drop trigger if exists eventos_ultimo_comentario on public.eventos;
create trigger eventos_ultimo_comentario
  before insert or update on public.eventos
  for each row execute function public.proteger_ultimo_comentario();

-- Las reglas (camión completado, fechas pasadas) no aplican a lo que hace la propia base.
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
     or current_setting('calendario.sistema', true) = '1' then
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

-- Sin usuario (SQL Editor, migraciones) se conserva el "modificado por" anterior.
-- Al guardar un comentario, el camión queda "modificado por" quien comentó.
create or replace function public.marcar_actualizacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    new.actualizado_en := old.actualizado_en;
    new.actualizado_por := old.actualizado_por;
    new.actualizado_por_usuario := old.actualizado_por_usuario;
  else
    new.actualizado_en := now();
    new.actualizado_por := auth.uid();
    new.actualizado_por_usuario := public.usuario_actual();
  end if;
  new.creado_en := old.creado_en;
  new.creado_por := old.creado_por;
  new.creado_por_usuario := old.creado_por_usuario;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pasar lo que hoy está dentro de observaciones
-- ---------------------------------------------------------------------------
-- Comentarios "💬 autor · dd-mm hh:mm — texto". El año se toma de la última modificación del
-- camión (los comentarios existen desde noviembre de 2026).
insert into public.evento_comentarios (evento_id, obra_id, texto, autor_usuario, creado_en)
select e.id,
       e.obra_id,
       m[6],
       m[1],
       make_timestamptz(extract(year from e.actualizado_en at time zone 'America/Santiago')::int,
                        m[3]::int, m[2]::int, m[4]::int, m[5]::int, 0, 'America/Santiago')
from public.eventos e
cross join lateral regexp_split_to_table(e.observaciones, E'\n') as t(linea)
cross join lateral regexp_match(btrim(linea), '^💬 (.*?) · (\d\d)-(\d\d) (\d\d):(\d\d) — (.+)$') as r(m)
where m is not null
  and not exists (
    select 1 from public.evento_comentarios c
    where c.evento_id = e.id and c.texto = m[6] and c.autor_usuario = m[1]
  );

-- Comentarios con otro formato (escritos a mano con 💬): sin autor ni hora conocidos.
insert into public.evento_comentarios (evento_id, obra_id, texto, autor_usuario, creado_en)
select e.id, e.obra_id, btrim(substr(btrim(linea), 3)), '', e.actualizado_en
from public.eventos e
cross join lateral regexp_split_to_table(e.observaciones, E'\n') as t(linea)
where btrim(linea) like '💬 %'
  and btrim(linea) !~ '^💬 (.*?) · (\d\d)-(\d\d) (\d\d):(\d\d) — (.+)$'
  and btrim(substr(btrim(linea), 3)) <> ''
  and not exists (
    select 1 from public.evento_comentarios c
    where c.evento_id = e.id and c.texto = btrim(substr(btrim(linea), 3))
  );

-- Referencia del calendario HTML y limpieza de observaciones (sin las líneas 💬 ni la referencia).
update public.eventos e
   set ref_calendario = coalesce(nullif(e.ref_calendario, ''),
                                 btrim((regexp_match(e.observaciones, 'Ref\. calendario: ([^\n]*)'))[1]), ''),
       observaciones = coalesce((
         select string_agg(linea, E'\n' order by n)
         from regexp_split_to_table(e.observaciones, E'\n') with ordinality as t(linea, n)
         where btrim(linea) not like '💬 %' and btrim(linea) not like 'Ref. calendario: %'
       ), '')
 where e.observaciones like '%💬 %' or e.observaciones like '%Ref. calendario: %';

-- Último comentario de cada camión.
update public.eventos e
   set ultimo_comentario = c.texto
  from (
    select distinct on (evento_id) evento_id, texto
    from public.evento_comentarios
    order by evento_id, creado_en desc, id desc
  ) c
 where c.evento_id = e.id and e.ultimo_comentario is distinct from c.texto;

-- ---------------------------------------------------------------------------
-- Mensaje de choque con el español de Chile ("marca", no "marcá"). Misma lógica de 20261009.
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
    raise exception 'Choca con otro camión en el mismo horario: %. Para agendarlo igual, marca "Agendar igual".', choques
      using errcode = 'P0001', hint = 'choque';
  end if;
  return new;
end;
$$;
