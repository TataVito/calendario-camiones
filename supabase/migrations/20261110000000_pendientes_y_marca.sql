-- Mejora 2026-11-10 (se puede ejecutar más de una vez):
--  * eventos.marca: ícono que se muestra junto al material en el calendario
--    (🚚 retira la obra, 📦 para juntar, ⚡ urgente, ⚠️ revisar). Sirve para ver de un vistazo
--    los despachos que se pueden consolidar en un solo viaje.
--  * Tabla pendientes: lo que faltó (o no llegó) en un camión, o cualquier pendiente anotado a
--    mano, para hacerle seguimiento hasta que llegue. Al llegar se marca como resuelto (no se
--    borra: queda en «Ya llegaron»). Autor y horas los pone la base.
--    Editor, admin y súper anotan y resuelven en las obras que ven; solo admin y súper borran.

-- ---------------------------------------------------------------------------
-- Ícono del camión
-- ---------------------------------------------------------------------------
alter table public.eventos
  add column if not exists marca text not null default '';

alter table public.eventos drop constraint if exists eventos_marca_check;
alter table public.eventos add constraint eventos_marca_check
  check (marca in ('', 'retira_obra', 'consolidar', 'urgente', 'revisar'));

-- ---------------------------------------------------------------------------
-- Pendientes
-- ---------------------------------------------------------------------------
create table if not exists public.pendientes (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  evento_id uuid references public.eventos (id) on delete set null,
  descripcion text not null check (char_length(btrim(descripcion)) between 1 and 300),
  cantidad text not null default '' check (char_length(cantidad) <= 60),
  proveedor text not null default '' check (char_length(proveedor) <= 200),
  material text not null default '' check (char_length(material) <= 200),
  fecha_origen date not null default ((now() at time zone 'America/Santiago')::date),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelto')),
  nota text not null default '' check (char_length(nota) <= 300),
  creado_por uuid references auth.users (id) on delete set null,
  creado_por_usuario text not null default '',
  creado_en timestamptz not null default now(),
  resuelto_por_usuario text not null default '',
  resuelto_en timestamptz
);

create index if not exists pendientes_obra on public.pendientes (obra_id, estado, fecha_origen);
create index if not exists pendientes_evento on public.pendientes (evento_id) where evento_id is not null;

alter table public.pendientes enable row level security;

-- Autor, horas y obra los pone la base. Si viene de un camión, la obra es la del camión y lo que
-- no se indique (proveedor, material) se copia de él; la fecha es siempre la del camión.
create or replace function public.marcar_pendiente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.eventos;
begin
  new.descripcion := btrim(regexp_replace(new.descripcion, '\s+', ' ', 'g'));
  new.cantidad := btrim(new.cantidad);
  new.nota := btrim(new.nota);

  if tg_op = 'INSERT' then
    if new.evento_id is not null then
      select * into ev from public.eventos where id = new.evento_id;
      if found then
        new.obra_id := ev.obra_id;
        if btrim(new.proveedor) = '' then new.proveedor := ev.proveedor_cliente; end if;
        if btrim(new.material) = '' then new.material := ev.material; end if;
        new.fecha_origen := ev.fecha;
      end if;
    end if;
    if auth.uid() is not null then
      new.creado_por := auth.uid();
      new.creado_por_usuario := public.usuario_actual();
      new.creado_en := now();
    end if;
    new.resuelto_por_usuario := '';
    new.resuelto_en := null;
    if new.estado = 'resuelto' then
      new.resuelto_por_usuario := public.usuario_actual();
      new.resuelto_en := now();
    end if;
    return new;
  end if;

  -- UPDATE: la obra, el camión de origen y la autoría no cambian. El camión solo puede quedar
  -- vacío (lo hace la base al borrar el camión: on delete set null).
  new.obra_id := old.obra_id;
  if new.evento_id is not null then
    new.evento_id := old.evento_id;
  end if;
  new.creado_por := old.creado_por;
  new.creado_por_usuario := old.creado_por_usuario;
  new.creado_en := old.creado_en;
  if new.estado = 'resuelto' and old.estado <> 'resuelto' then
    new.resuelto_por_usuario := public.usuario_actual();
    new.resuelto_en := now();
  elsif new.estado = 'pendiente' then
    new.resuelto_por_usuario := '';
    new.resuelto_en := null;
  else
    new.resuelto_por_usuario := old.resuelto_por_usuario;
    new.resuelto_en := old.resuelto_en;
  end if;
  return new;
end;
$$;

revoke execute on function public.marcar_pendiente() from public, anon, authenticated;

drop trigger if exists pendientes_marcar on public.pendientes;
create trigger pendientes_marcar
  before insert or update on public.pendientes
  for each row execute function public.marcar_pendiente();

-- Historial
alter table public.auditoria drop constraint if exists auditoria_tabla_check;
alter table public.auditoria add constraint auditoria_tabla_check
  check (tabla in ('obras', 'eventos', 'usuarios', 'evento_fotos', 'evento_comentarios', 'pendientes'));

drop trigger if exists pendientes_auditoria on public.pendientes;
create trigger pendientes_auditoria
  after insert or update or delete on public.pendientes
  for each row execute function public.registrar_auditoria();

-- Permisos
drop policy if exists "pendientes: leer obras asignadas" on public.pendientes;
create policy "pendientes: leer obras asignadas" on public.pendientes
  for select to authenticated
  using (public.puede_ver_obra(obra_id));

-- obra_id se corrige en el trigger (con la del camión) antes de revisar la política.
drop policy if exists "pendientes: crear editor" on public.pendientes;
create policy "pendientes: crear editor" on public.pendientes
  for insert to authenticated
  with check ((select public.rol_actual()) in ('editor', 'admin', 'superusuario') and public.puede_ver_obra(obra_id));

drop policy if exists "pendientes: modificar editor" on public.pendientes;
create policy "pendientes: modificar editor" on public.pendientes
  for update to authenticated
  using ((select public.rol_actual()) in ('editor', 'admin', 'superusuario') and public.puede_ver_obra(obra_id))
  with check ((select public.rol_actual()) in ('editor', 'admin', 'superusuario') and public.puede_ver_obra(obra_id));

drop policy if exists "pendientes: borrar admin" on public.pendientes;
create policy "pendientes: borrar admin" on public.pendientes
  for delete to authenticated
  using ((select public.rol_actual()) in ('admin', 'superusuario') and public.puede_ver_obra(obra_id));

-- Cambios en vivo (la lista se actualiza sola en todos los equipos).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pendientes') then
    alter publication supabase_realtime add table public.pendientes;
  end if;
end;
$$;

-- Sin sesión no se toca nada (como las demás tablas; las políticas ya lo impedían).
revoke all on public.pendientes, public.evento_comentarios from anon;
