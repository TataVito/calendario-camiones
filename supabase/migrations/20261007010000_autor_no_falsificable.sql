-- El autor y las fechas de creación los fija la base, nunca el cliente.
create or replace function public.marcar_creacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.creado_en := now();
  new.creado_por := auth.uid();
  if tg_table_name = 'eventos' then
    new.actualizado_en := now();
    new.actualizado_por := auth.uid();
  end if;
  return new;
end;
$$;

create trigger eventos_creacion
  before insert on public.eventos
  for each row execute function public.marcar_creacion();

create trigger obras_creacion
  before insert on public.obras
  for each row execute function public.marcar_creacion();

-- En obras, tampoco se puede reescribir quién/cuándo la creó.
create or replace function public.proteger_creacion_obra()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.creado_en := old.creado_en;
  new.creado_por := old.creado_por;
  return new;
end;
$$;

create trigger obras_actualizacion
  before update on public.obras
  for each row execute function public.proteger_creacion_obra();
