-- Registro de auditoría: cada creación, modificación y eliminación de obras y camiones
-- queda anotada por la propia base (no depende de la app). Solo el admin lo lee y nadie
-- puede modificarlo ni borrarlo. La gestión de usuarios la anota la Edge Function.

create table public.auditoria (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  usuario_id uuid,             -- sin FK: el registro sobrevive aunque se elimine el usuario
  usuario text not null default '',
  accion text not null check (accion in ('crear', 'modificar', 'eliminar')),
  tabla text not null check (tabla in ('obras', 'eventos', 'usuarios')),
  registro_id uuid not null,
  obra_id uuid,
  antes jsonb,
  despues jsonb
);

create index auditoria_fecha on public.auditoria (fecha desc);
create index auditoria_registro on public.auditoria (registro_id, fecha desc);
create index auditoria_obra on public.auditoria (obra_id, fecha desc);

-- Nombre de usuario de la sesión actual ('' si no hay).
create or replace function public.usuario_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select usuario from public.perfiles where id = auth.uid()), '');
$$;

revoke execute on function public.usuario_actual() from public, anon;
grant execute on function public.usuario_actual() to authenticated;

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
begin
  -- Un UPDATE que no cambia nada (salvo marcas de auditoría) no se anota.
  if tg_op = 'UPDATE'
     and (fila_antes - array['actualizado_en', 'actualizado_por', 'actualizado_por_usuario'])
       = (fila_despues - array['actualizado_en', 'actualizado_por', 'actualizado_por_usuario']) then
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

revoke execute on function public.registrar_auditoria() from public, anon, authenticated;

create trigger obras_auditoria
  after insert or update or delete on public.obras
  for each row execute function public.registrar_auditoria();

create trigger eventos_auditoria
  after insert or update or delete on public.eventos
  for each row execute function public.registrar_auditoria();

-- Inmutable: ni siquiera con la service role se puede editar o borrar una entrada.
create or replace function public.auditoria_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El registro de auditoría no se puede modificar ni eliminar';
end;
$$;

create trigger auditoria_sin_cambios
  before update or delete on public.auditoria
  for each row execute function public.auditoria_inmutable();

create trigger auditoria_sin_truncate
  before truncate on public.auditoria
  for each statement execute function public.auditoria_inmutable();

alter table public.auditoria enable row level security;

create policy "auditoria: solo admin lee" on public.auditoria
  for select to authenticated
  using ((select public.rol_actual()) = 'admin');

revoke all on public.auditoria from anon;
revoke insert, update, delete, truncate on public.auditoria from authenticated;

-- ---------------------------------------------------------------------------
-- "Creado por / modificado por" visible para todos en cada camión, sin exponer
-- la tabla de perfiles: se guarda el nombre de usuario junto al camión.
-- ---------------------------------------------------------------------------
-- El autor es un dato histórico: no debe depender de que el usuario siga existiendo
-- (con la FK "on delete set null", eliminar un usuario chocaba con los triggers que
-- impiden reescribir creado_por y la eliminación fallaba).
alter table public.eventos drop constraint if exists eventos_creado_por_fkey;
alter table public.eventos drop constraint if exists eventos_actualizado_por_fkey;
alter table public.obras drop constraint if exists obras_creado_por_fkey;

alter table public.eventos
  add column creado_por_usuario text not null default '',
  add column actualizado_por_usuario text not null default '';

create or replace function public.marcar_creacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.creado_en := now();
  new.creado_por := auth.uid();
  if tg_table_name = 'eventos' then
    new.actualizado_en := now();
    new.actualizado_por := auth.uid();
    new.creado_por_usuario := public.usuario_actual();
    new.actualizado_por_usuario := new.creado_por_usuario;
  end if;
  return new;
end;
$$;

create or replace function public.marcar_actualizacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  new.actualizado_por_usuario := public.usuario_actual();
  new.creado_en := old.creado_en;
  new.creado_por := old.creado_por;
  new.creado_por_usuario := old.creado_por_usuario;
  return new;
end;
$$;

revoke execute on function public.marcar_creacion() from public, anon, authenticated;
revoke execute on function public.marcar_actualizacion() from public, anon, authenticated;
