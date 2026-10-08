-- Mejoras 2026-10-08:
--  * Permisos por obra (obra_usuarios): cada usuario ve/edita solo sus obras; el admin, todas.
--  * Rol 'porteria': solo marca llegada / inicio / término (con hora real) y sube fotos.
--  * Horas reales de llegada, inicio de descarga y salida (no falsificables).
--  * Fotos de guías en Storage (bucket privado 'guias') con registro en evento_fotos.
--  * Auditoría del cambio de clave propio y ping para que el proyecto no se pause.
-- Se puede ejecutar más de una vez: salta lo que ya existe.

-- ---------------------------------------------------------------------------
-- Rol portería
-- ---------------------------------------------------------------------------
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('lector', 'porteria', 'editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Permisos por obra
-- ---------------------------------------------------------------------------
create table if not exists public.obra_usuarios (
  obra_id uuid not null references public.obras (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  primary key (obra_id, usuario_id)
);

create index if not exists obra_usuarios_usuario on public.obra_usuarios (usuario_id);

-- Para no cortar accesos: los usuarios actuales quedan en todas las obras actuales
-- (solo la primera vez: si ya hay asignaciones, no se toca nada).
insert into public.obra_usuarios (obra_id, usuario_id)
select o.id, p.id from public.obras o cross join public.perfiles p
where p.rol <> 'admin' and not exists (select 1 from public.obra_usuarios)
on conflict do nothing;

create or replace function public.puede_ver_obra(p_obra uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rol_actual() = 'admin'
    or exists (select 1 from public.obra_usuarios where obra_id = p_obra and usuario_id = auth.uid());
$$;

revoke execute on function public.puede_ver_obra(uuid) from public, anon;
grant execute on function public.puede_ver_obra(uuid) to authenticated;

-- Quien crea una obra queda asignado a ella.
create or replace function public.asignar_creador_obra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.obra_usuarios (obra_id, usuario_id) values (new.id, auth.uid())
    on conflict do nothing;
  end if;
  return null;
end;
$$;

revoke execute on function public.asignar_creador_obra() from public, anon, authenticated;

drop trigger if exists obras_asignar_creador on public.obras;
create trigger obras_asignar_creador
  after insert on public.obras
  for each row execute function public.asignar_creador_obra();

alter table public.obra_usuarios enable row level security;

drop policy if exists "obra_usuarios: propias o admin" on public.obra_usuarios;
create policy "obra_usuarios: propias o admin" on public.obra_usuarios
  for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.rol_actual()) = 'admin');

revoke all on public.obra_usuarios from anon;
revoke insert, update, delete, truncate on public.obra_usuarios from authenticated;

-- Políticas de obras y eventos, ahora filtradas por obra asignada.
drop policy if exists "obras: leer con sesion" on public.obras;
drop policy if exists "obras: modificar editor" on public.obras;
drop policy if exists "obras: eliminar editor" on public.obras;
drop policy if exists "eventos: leer con sesion" on public.eventos;
drop policy if exists "eventos: crear editor" on public.eventos;
drop policy if exists "eventos: modificar editor" on public.eventos;
drop policy if exists "eventos: eliminar editor" on public.eventos;

drop policy if exists "obras: leer asignadas" on public.obras;
create policy "obras: leer asignadas" on public.obras
  for select to authenticated
  using (public.puede_ver_obra(id));

drop policy if exists "obras: modificar editor" on public.obras;
create policy "obras: modificar editor" on public.obras
  for update to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin') and public.puede_ver_obra(id))
  with check ((select public.rol_actual()) in ('editor', 'admin') and public.puede_ver_obra(id));

drop policy if exists "obras: eliminar editor" on public.obras;
create policy "obras: eliminar editor" on public.obras
  for delete to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin') and public.puede_ver_obra(id));

drop policy if exists "eventos: leer asignadas" on public.eventos;
create policy "eventos: leer asignadas" on public.eventos
  for select to authenticated
  using (public.puede_ver_obra(obra_id));

drop policy if exists "eventos: crear editor" on public.eventos;
create policy "eventos: crear editor" on public.eventos
  for insert to authenticated
  with check ((select public.rol_actual()) in ('editor', 'admin') and public.puede_ver_obra(obra_id));

drop policy if exists "eventos: modificar editor" on public.eventos;
create policy "eventos: modificar editor" on public.eventos
  for update to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin') and public.puede_ver_obra(obra_id))
  with check ((select public.rol_actual()) in ('editor', 'admin') and public.puede_ver_obra(obra_id));

drop policy if exists "eventos: eliminar editor" on public.eventos;
create policy "eventos: eliminar editor" on public.eventos
  for delete to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin') and public.puede_ver_obra(obra_id));

-- ---------------------------------------------------------------------------
-- Horas reales (solo las fija marcar_porteria; el admin puede corregirlas)
-- ---------------------------------------------------------------------------
alter table public.eventos
  add column if not exists llegada_real timestamptz,
  add column if not exists inicio_proceso_real timestamptz,
  add column if not exists salida_real timestamptz;

create index if not exists eventos_obra_fecha_estado on public.eventos (obra_id, fecha, estado);

create or replace function public.proteger_horas_reales()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or public.rol_actual() = 'admin'
     or current_setting('calendario.porteria', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.llegada_real := null;
    new.inicio_proceso_real := null;
    new.salida_real := null;
  else
    new.llegada_real := old.llegada_real;
    new.inicio_proceso_real := old.inicio_proceso_real;
    new.salida_real := old.salida_real;
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_horas_reales() from public, anon, authenticated;

drop trigger if exists eventos_horas_reales on public.eventos;
create trigger eventos_horas_reales
  before insert or update on public.eventos
  for each row execute function public.proteger_horas_reales();

-- Pasos de portería: llego -> inicio -> termino. Portería solo opera camiones de hoy.
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

-- ---------------------------------------------------------------------------
-- Fotos de guías
-- ---------------------------------------------------------------------------
create table if not exists public.evento_fotos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  obra_id uuid not null,
  ruta text not null unique,
  subido_en timestamptz not null default now(),
  subido_por uuid default auth.uid(),
  subido_por_usuario text not null default ''
);

create index if not exists evento_fotos_evento on public.evento_fotos (evento_id);

create or replace function public.marcar_foto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.subido_en := now();
  new.subido_por := auth.uid();
  new.subido_por_usuario := public.usuario_actual();
  -- La obra y la carpeta se derivan del camión: no se pueden falsear.
  select obra_id into new.obra_id from public.eventos where id = new.evento_id;
  if new.ruta not like new.obra_id::text || '/' || new.evento_id::text || '/%' then
    raise exception 'Ruta de foto inválida.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.marcar_foto() from public, anon, authenticated;

drop trigger if exists evento_fotos_marcar on public.evento_fotos;
create trigger evento_fotos_marcar
  before insert on public.evento_fotos
  for each row execute function public.marcar_foto();

alter table public.auditoria drop constraint if exists auditoria_tabla_check;
alter table public.auditoria add constraint auditoria_tabla_check
  check (tabla in ('obras', 'eventos', 'usuarios', 'evento_fotos'));

drop trigger if exists evento_fotos_auditoria on public.evento_fotos;
create trigger evento_fotos_auditoria
  after insert or delete on public.evento_fotos
  for each row execute function public.registrar_auditoria();

alter table public.evento_fotos enable row level security;

drop policy if exists "fotos: leer obras asignadas" on public.evento_fotos;
create policy "fotos: leer obras asignadas" on public.evento_fotos
  for select to authenticated
  using (public.puede_ver_obra(obra_id));

drop policy if exists "fotos: subir porteria/editor" on public.evento_fotos;
create policy "fotos: subir porteria/editor" on public.evento_fotos
  for insert to authenticated
  with check (
    (select public.rol_actual()) in ('porteria', 'editor', 'admin')
    and exists (select 1 from public.eventos e where e.id = evento_id and public.puede_ver_obra(e.obra_id))
  );

-- Borrar fotos: editor (si el camión no está completado) o admin.
drop policy if exists "fotos: borrar editor" on public.evento_fotos;
create policy "fotos: borrar editor" on public.evento_fotos
  for delete to authenticated
  using (
    public.puede_ver_obra(obra_id)
    and (
      (select public.rol_actual()) = 'admin'
      or ((select public.rol_actual()) = 'editor'
          and not exists (select 1 from public.eventos e where e.id = evento_id and e.estado = 'completado'))
    )
  );

revoke all on public.evento_fotos from anon;
revoke update, truncate on public.evento_fotos from authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'evento_fotos') then
    alter publication supabase_realtime add table public.evento_fotos;
  end if;
end $$;

-- Bucket privado: solo imágenes, máx. 5 MB. Ruta: <obra_id>/<evento_id>/<archivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guias', 'guias', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.obra_de_ruta(p_ruta text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_ruta, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists "guias: leer obras asignadas" on storage.objects;
create policy "guias: leer obras asignadas" on storage.objects
  for select to authenticated
  using (bucket_id = 'guias' and public.puede_ver_obra(public.obra_de_ruta(name)));

drop policy if exists "guias: subir porteria/editor" on storage.objects;
create policy "guias: subir porteria/editor" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'guias'
    and (select public.rol_actual()) in ('porteria', 'editor', 'admin')
    and public.puede_ver_obra(public.obra_de_ruta(name))
  );

drop policy if exists "guias: borrar editor" on storage.objects;
create policy "guias: borrar editor" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'guias'
    and (select public.rol_actual()) in ('editor', 'admin')
    and public.puede_ver_obra(public.obra_de_ruta(name))
  );

-- ---------------------------------------------------------------------------
-- Cambio de clave propio: se anota en la auditoría (la clave nunca se guarda).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_cambio_clave_propia()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u text := public.usuario_actual();
begin
  if auth.uid() is null then
    raise exception 'Sin sesión.' using errcode = 'P0001';
  end if;
  insert into public.auditoria (usuario_id, usuario, accion, tabla, registro_id, antes, despues)
  values (auth.uid(), u, 'modificar', 'usuarios', auth.uid(),
          jsonb_build_object('usuario', u),
          jsonb_build_object('usuario', u, 'clave', '(cambiada por el propio usuario)'));
end;
$$;

revoke execute on function public.registrar_cambio_clave_propia() from public, anon;
grant execute on function public.registrar_cambio_clave_propia() to authenticated;

-- ---------------------------------------------------------------------------
-- Ping para la tarea programada que evita que el plan gratis pause el proyecto.
-- No lee ni expone datos.
-- ---------------------------------------------------------------------------
create or replace function public.ping()
returns text
language sql
stable
set search_path = ''
as $$ select 'ok'::text $$;

grant execute on function public.ping() to anon, authenticated;
