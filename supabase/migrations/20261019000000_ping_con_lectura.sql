-- Mejora 2026-10-19 (se puede ejecutar más de una vez):
--  * El proyecto se pausó entre el 15 y el 18 de octubre aunque la tarea "Mantener Supabase activo"
--    funcionó el 12 y el 15. El ping anterior solo devolvía 'ok' sin tocar ninguna tabla, y
--    probablemente Supabase no lo cuenta como uso. Ahora lee de verdad las tablas principales.
--  * Sigue devolviendo solo 'ok': no expone ningún dato. La tarea de GitHub no cambia.

create or replace function public.ping()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  select count(*) into n from public.obras;
  select count(*) into n from public.eventos;
  select count(*) into n from public.perfiles;
  return 'ok';
end;
$$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
