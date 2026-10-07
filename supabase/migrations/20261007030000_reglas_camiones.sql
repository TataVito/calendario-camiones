-- Reglas de negocio sobre camiones; solo el admin puede saltárselas:
--  1. No se agenda un camión en una fecha anterior a hoy (ni se mueve a una fecha pasada).
--  2. Un camión completado no se modifica ni se elimina.
-- "Hoy" es la fecha de Chile, no la del servidor (UTC).
-- Sin sesión (auth.uid() nulo) solo llega el SQL Editor/service role: se permite.

create or replace function public.reglas_eventos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if auth.uid() is null or public.rol_actual() = 'admin' then
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

revoke execute on function public.reglas_eventos() from public, anon, authenticated;

create trigger eventos_reglas
  before insert or update or delete on public.eventos
  for each row execute function public.reglas_eventos();
