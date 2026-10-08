-- Súper usuario y admin de obra (2026-10-08).
--  * superusuario: ve y hace todo (lo que antes hacía 'admin'). Solo él crea y elimina obras.
--  * admin: administrador DE OBRA. Solo ve sus obras asignadas; en ellas se salta las reglas,
--    edita la obra, ve el historial y gestiona lectores/portería/editores (vía Edge Function).
-- Se puede ejecutar más de una vez.

-- ---------------------------------------------------------------------------
-- Rol nuevo. Los admin actuales pasan a súper usuario (solo la primera vez).
-- ---------------------------------------------------------------------------
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('lector', 'porteria', 'editor', 'admin', 'superusuario'));

update public.perfiles set rol = 'superusuario'
where rol = 'admin' and not exists (select 1 from public.perfiles where rol = 'superusuario');

-- ---------------------------------------------------------------------------
-- Ayudas de permisos
-- ---------------------------------------------------------------------------
create or replace function public.es_super()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rol_actual() = 'superusuario';
$$;

-- Súper usuario: todas. Resto (admin incluido): solo las asignadas.
create or replace function public.puede_ver_obra(p_obra uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rol_actual() = 'superusuario'
    or exists (select 1 from public.obra_usuarios where obra_id = p_obra and usuario_id = auth.uid());
$$;

-- ¿El usuario actual administra a p_usuario? Súper: a todos. Admin: a lectores, portería y
-- editores que comparten al menos una de sus obras.
create or replace function public.administra_usuario(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rol_actual() = 'superusuario'
    or (
      public.rol_actual() = 'admin'
      and exists (
        select 1
        from public.obra_usuarios suyo
        join public.obra_usuarios mio on mio.obra_id = suyo.obra_id and mio.usuario_id = auth.uid()
        where suyo.usuario_id = p_usuario
      )
    );
$$;

revoke execute on function public.es_super() from public, anon;
revoke execute on function public.administra_usuario(uuid) from public, anon;
grant execute on function public.es_super() to authenticated;
grant execute on function public.administra_usuario(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Perfiles y asignaciones: el admin ve a quienes comparten sus obras.
-- ---------------------------------------------------------------------------
drop policy if exists "perfiles: leer propio o admin" on public.perfiles;
drop policy if exists "perfiles: leer propio o administrados" on public.perfiles;
create policy "perfiles: leer propio o administrados" on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or public.administra_usuario(id));

drop policy if exists "obra_usuarios: propias o admin" on public.obra_usuarios;
drop policy if exists "obra_usuarios: propias o de mis obras" on public.obra_usuarios;
create policy "obra_usuarios: propias o de mis obras" on public.obra_usuarios
  for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or (select public.rol_actual()) = 'superusuario'
    or ((select public.rol_actual()) = 'admin' and public.puede_ver_obra(obra_id))
  );

-- ---------------------------------------------------------------------------
-- Obras: crear y eliminar solo el súper usuario; editar el admin de la obra.
-- ---------------------------------------------------------------------------
drop policy if exists "obras: crear editor" on public.obras;
drop policy if exists "obras: crear super" on public.obras;
create policy "obras: crear super" on public.obras
  for insert to authenticated
  with check ((select public.rol_actual()) = 'superusuario');

drop policy if exists "obras: modificar editor" on public.obras;
drop policy if exists "obras: modificar admin" on public.obras;
create policy "obras: modificar admin" on public.obras
  for update to authenticated
  using ((select public.rol_actual()) in ('admin', 'superusuario') and public.puede_ver_obra(id))
  with check ((select public.rol_actual()) in ('admin', 'superusuario') and public.puede_ver_obra(id));

drop policy if exists "obras: eliminar editor" on public.obras;
drop policy if exists "obras: eliminar super" on public.obras;
create policy "obras: eliminar super" on public.obras
  for delete to authenticated
  using ((select public.rol_actual()) = 'superusuario');

-- ---------------------------------------------------------------------------
-- Camiones: editor, admin y súper en las obras que ven.
-- ---------------------------------------------------------------------------
drop policy if exists "eventos: crear editor" on public.eventos;
create policy "eventos: crear editor" on public.eventos
  for insert to authenticated
  with check ((select public.rol_actual()) in ('editor', 'admin', 'superusuario') and public.puede_ver_obra(obra_id));

drop policy if exists "eventos: modificar editor" on public.eventos;
create policy "eventos: modificar editor" on public.eventos
  for update to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin', 'superusuario') and public.puede_ver_obra(obra_id))
  with check ((select public.rol_actual()) in ('editor', 'admin', 'superusuario') and public.puede_ver_obra(obra_id));

drop policy if exists "eventos: eliminar editor" on public.eventos;
create policy "eventos: eliminar editor" on public.eventos
  for delete to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin', 'superusuario') and public.puede_ver_obra(obra_id));

-- Reglas: admin y súper se las saltan (el admin solo llega a sus obras por RLS).
create or replace function public.reglas_eventos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if auth.uid() is null or public.rol_actual() in ('admin', 'superusuario') then
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

-- Horas reales: además de portería, las corrige el admin de la obra o el súper.
create or replace function public.proteger_horas_reales()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or public.rol_actual() in ('admin', 'superusuario')
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
  if rol not in ('porteria', 'editor', 'admin', 'superusuario') then
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

-- ---------------------------------------------------------------------------
-- Fotos
-- ---------------------------------------------------------------------------
drop policy if exists "fotos: subir porteria/editor" on public.evento_fotos;
create policy "fotos: subir porteria/editor" on public.evento_fotos
  for insert to authenticated
  with check (
    (select public.rol_actual()) in ('porteria', 'editor', 'admin', 'superusuario')
    and exists (select 1 from public.eventos e where e.id = evento_id and public.puede_ver_obra(e.obra_id))
  );

drop policy if exists "fotos: borrar editor" on public.evento_fotos;
create policy "fotos: borrar editor" on public.evento_fotos
  for delete to authenticated
  using (
    public.puede_ver_obra(obra_id)
    and (
      (select public.rol_actual()) in ('admin', 'superusuario')
      or ((select public.rol_actual()) = 'editor'
          and not exists (select 1 from public.eventos e where e.id = evento_id and e.estado = 'completado'))
    )
  );

drop policy if exists "guias: subir porteria/editor" on storage.objects;
create policy "guias: subir porteria/editor" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'guias'
    and (select public.rol_actual()) in ('porteria', 'editor', 'admin', 'superusuario')
    and public.puede_ver_obra(public.obra_de_ruta(name))
  );

drop policy if exists "guias: borrar editor" on storage.objects;
create policy "guias: borrar editor" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'guias'
    and (select public.rol_actual()) in ('editor', 'admin', 'superusuario')
    and public.puede_ver_obra(public.obra_de_ruta(name))
  );

-- ---------------------------------------------------------------------------
-- Historial: súper todo; admin lo de sus obras, sus propias acciones y los
-- usuarios que administra.
-- ---------------------------------------------------------------------------
drop policy if exists "auditoria: solo admin lee" on public.auditoria;
drop policy if exists "auditoria: super y admin de obra" on public.auditoria;
create policy "auditoria: super y admin de obra" on public.auditoria
  for select to authenticated
  using (
    (select public.rol_actual()) = 'superusuario'
    or (
      (select public.rol_actual()) = 'admin'
      and (
        (obra_id is not null and public.puede_ver_obra(obra_id))
        or (tabla = 'usuarios' and (usuario_id = (select auth.uid()) or public.administra_usuario(registro_id)))
      )
    )
  );
