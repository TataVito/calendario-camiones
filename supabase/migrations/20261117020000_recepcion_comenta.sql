-- Recepción puede dejar comentarios en los camiones de sus obras (pedido de Víctor, 17-11-2026).
-- Igual que el editor: autor y hora los pone la base, nadie edita un comentario y solo el admin
-- de obra o el súper usuario los borra. Re-ejecutable.

drop policy if exists "comentarios: crear editor" on public.evento_comentarios;
drop policy if exists "comentarios: crear" on public.evento_comentarios;
create policy "comentarios: crear" on public.evento_comentarios
  for insert to authenticated
  with check ((select public.rol_actual()) in ('porteria', 'editor', 'admin', 'superusuario') and public.puede_ver_obra(obra_id));
