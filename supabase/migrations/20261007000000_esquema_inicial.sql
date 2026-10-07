-- Calendario de Camiones RVC — esquema inicial con seguridad a nivel de fila (RLS).
-- Regla general: sin sesión no se ve nada; lector solo lee; editor y admin escriben;
-- la gestión de usuarios pasa por la Edge Function `admin-usuarios` (service role).

-- ---------------------------------------------------------------------------
-- Perfiles (rol de cada usuario). Se crea solo al crear el usuario en Auth.
-- ---------------------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  usuario text not null unique,
  nombre text not null default '',
  rol text not null default 'lector' check (rol in ('lector', 'editor', 'admin')),
  creado_en timestamptz not null default now()
);

-- El usuario se deriva del correo interno "<usuario>@calendario.rvc"; el rol siempre
-- nace como 'lector' (nunca desde metadata del cliente) y solo el admin lo sube.
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, usuario, nombre)
  values (
    new.id,
    split_part(new.email, '@', 1),
    coalesce(new.raw_user_meta_data ->> 'nombre', '')
  );
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Rol del usuario de la sesión actual ('' si no hay sesión).
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select rol from public.perfiles where id = auth.uid()), '');
$$;

revoke execute on function public.rol_actual() from public, anon;
grant execute on function public.rol_actual() to authenticated;
revoke execute on function public.crear_perfil() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Obras y eventos (camiones)
-- ---------------------------------------------------------------------------
create table public.obras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text not null default '',
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid()
);

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  tipo text not null check (tipo in ('recepcion', 'despacho')),
  fecha date not null,
  hora_inicio text not null check (hora_inicio ~ '^[0-2][0-9]:[0-5][0-9]$'),
  duracion_min integer not null default 60 check (duracion_min between 5 and 1440),
  guia_oc text not null default '',
  proveedor_cliente text not null default '',
  material text not null default '',
  forma_descarga text not null default 'manual',
  estado text not null default 'programado'
    check (estado in ('programado', 'confirmado', 'en_porteria', 'en_proceso', 'completado', 'cancelado')),
  observaciones text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  actualizado_por uuid references auth.users (id) on delete set null default auth.uid()
);

create index eventos_obra_fecha on public.eventos (obra_id, fecha);

-- Auditoría: quién y cuándo modificó por última vez (no se puede falsear desde el cliente).
create or replace function public.marcar_actualizacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  new.creado_en := old.creado_en;
  new.creado_por := old.creado_por;
  return new;
end;
$$;

create trigger eventos_actualizacion
  before update on public.eventos
  for each row execute function public.marcar_actualizacion();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.obras enable row level security;
alter table public.eventos enable row level security;

-- Perfiles: cada uno ve el suyo; el admin ve todos. Nadie escribe desde el cliente.
create policy "perfiles: leer propio o admin" on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.rol_actual()) = 'admin');

-- Obras
create policy "obras: leer con sesion" on public.obras
  for select to authenticated
  using ((select public.rol_actual()) in ('lector', 'editor', 'admin'));

create policy "obras: crear editor" on public.obras
  for insert to authenticated
  with check ((select public.rol_actual()) in ('editor', 'admin'));

create policy "obras: modificar editor" on public.obras
  for update to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin'))
  with check ((select public.rol_actual()) in ('editor', 'admin'));

create policy "obras: eliminar editor" on public.obras
  for delete to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin'));

-- Eventos
create policy "eventos: leer con sesion" on public.eventos
  for select to authenticated
  using ((select public.rol_actual()) in ('lector', 'editor', 'admin'));

create policy "eventos: crear editor" on public.eventos
  for insert to authenticated
  with check ((select public.rol_actual()) in ('editor', 'admin'));

create policy "eventos: modificar editor" on public.eventos
  for update to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin'))
  with check ((select public.rol_actual()) in ('editor', 'admin'));

create policy "eventos: eliminar editor" on public.eventos
  for delete to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin'));

-- Sin acceso anónimo a nada.
revoke all on public.perfiles, public.obras, public.eventos from anon;

-- Cambios en vivo para todos los conectados (Realtime respeta RLS).
alter publication supabase_realtime add table public.obras, public.eventos;
