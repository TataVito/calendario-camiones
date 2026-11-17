-- Restaurar un camión eliminado por error, desde el Historial (pedido de Víctor, 17-11-2026).
-- Lo puede hacer el admin de la obra o el súper usuario. Se recrea con los mismos datos e id que
-- tenía (copia guardada en auditoria al eliminarlo) y, si se borraron junto con él, también:
--  * sus comentarios, con el autor y la hora originales;
--  * sus fotos de guía: al eliminar el camión se borra solo el registro, el archivo sigue en el
--    bucket «guias», así que se vuelven a enlazar (las que ya no estén en el bucket se informan);
--  * sus pendientes vuelven a quedar unidos al camión.
-- Si al restaurarlo choca con otro camión, se restaura igual como choque aceptado.
-- Re-ejecutable.

-- Marca interna que solo pone restaurar_camion: los triggers conservan autor y hora originales.
create or replace function public.marcar_creacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('calendario.restaurando', true) = '1' and tg_table_name = 'eventos' then
    return new;
  end if;
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

create or replace function public.marcar_comentario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.obra_id := (select obra_id from public.eventos where id = new.evento_id);
  new.texto := btrim(regexp_replace(new.texto, '\s+', ' ', 'g'));
  if auth.uid() is not null and coalesce(current_setting('calendario.restaurando', true), '') <> '1' then
    new.autor_id := auth.uid();
    new.autor_usuario := public.usuario_actual();
    new.creado_en := now();
  end if;
  return new;
end;
$$;

create or replace function public.marcar_foto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('calendario.restaurando', true), '') <> '1' then
    new.subido_en := now();
    new.subido_por := auth.uid();
    new.subido_por_usuario := public.usuario_actual();
  end if;
  -- La obra y la carpeta se derivan del camión: no se pueden falsear.
  select obra_id into new.obra_id from public.eventos where id = new.evento_id;
  if new.ruta not like new.obra_id::text || '/' || new.evento_id::text || '/%' then
    raise exception 'Ruta de foto inválida.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Pendientes: igual que antes, salvo que la restauración puede volver a unirlos a su camión.
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
  -- Al restaurar un camión eliminado (restaurar_camion), el pendiente vuelve a unirse a él.
  if new.evento_id is not null
     and not (old.evento_id is null and current_setting('calendario.restaurando', true) = '1') then
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

-- Inserta en una tabla una fila guardada como jsonb, solo con las columnas que existen hoy
-- (las que no venían en la copia toman su valor por defecto).
create or replace function public.insertar_desde_copia(p_tabla text, p_fila jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_tabla
     and p_fila ? c.column_name
     and c.is_generated = 'NEVER' and c.is_identity = 'NO';
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                 p_tabla, cols, cols, p_tabla)
    using p_fila;
end;
$$;

revoke execute on function public.insertar_desde_copia(text, jsonb) from public, anon, authenticated;

create or replace function public.restaurar_camion(p_auditoria bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rol text := public.rol_actual();
  del public.auditoria;
  ev_id uuid;
  fila jsonb;
  n_com int := 0;
  n_fotos int := 0;
  n_sin_archivo int := 0;
  n_pend int := 0;
  r record;
begin
  if rol not in ('admin', 'superusuario') then
    raise exception 'Solo el admin de obra o el súper usuario pueden restaurar camiones.' using errcode = 'P0001';
  end if;

  select * into del from public.auditoria where id = p_auditoria;
  if not found or del.tabla <> 'eventos' or del.accion <> 'eliminar' or del.antes is null then
    raise exception 'Ese registro del historial no es un camión eliminado.' using errcode = 'P0001';
  end if;
  ev_id := del.registro_id;
  if not exists (select 1 from public.obras where id = del.obra_id) then
    raise exception 'La obra de ese camión ya no existe.' using errcode = 'P0001';
  end if;
  if not public.puede_ver_obra(del.obra_id) then
    raise exception 'Ese camión es de una obra que no administras.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.eventos where id = ev_id) then
    raise exception 'Ese camión ya está en el calendario (ya fue restaurado).' using errcode = 'P0001';
  end if;

  perform set_config('calendario.restaurando', '1', true);
  perform set_config('calendario.sistema', '1', true);

  -- El camión, con sus datos tal como estaban. Si choca con otro, queda como choque aceptado.
  fila := del.antes;
  begin
    perform public.insertar_desde_copia('eventos', fila);
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'Choca con otro camión%' then
      raise;
    end if;
    perform public.insertar_desde_copia('eventos', fila || '{"choque_aceptado": true}'::jsonb);
  end;

  -- Comentarios y fotos borrados junto con el camión (misma operación = misma hora en el historial).
  for r in
    select a.tabla, a.antes
      from public.auditoria a
     where a.accion = 'eliminar' and a.fecha = del.fecha
       and a.tabla in ('evento_comentarios', 'evento_fotos')
       and a.antes ->> 'evento_id' = ev_id::text
     order by a.id
  loop
    if r.tabla = 'evento_comentarios' then
      if not exists (select 1 from public.evento_comentarios where id = (r.antes ->> 'id')::uuid) then
        perform public.insertar_desde_copia('evento_comentarios', r.antes);
        n_com := n_com + 1;
      end if;
    else
      if exists (select 1 from storage.objects o where o.bucket_id = 'guias' and o.name = r.antes ->> 'ruta') then
        if not exists (select 1 from public.evento_fotos where ruta = r.antes ->> 'ruta') then
          perform public.insertar_desde_copia('evento_fotos', r.antes);
          n_fotos := n_fotos + 1;
        end if;
      else
        n_sin_archivo := n_sin_archivo + 1;
      end if;
    end if;
  end loop;

  -- Pendientes que quedaron sueltos al eliminar el camión.
  update public.pendientes p
     set evento_id = ev_id
   where p.evento_id is null
     and p.id in (select a.registro_id from public.auditoria a
                   where a.tabla = 'pendientes' and a.accion = 'modificar' and a.fecha = del.fecha
                     and a.antes ->> 'evento_id' = ev_id::text);
  get diagnostics n_pend = row_count;

  perform set_config('calendario.restaurando', '', true);
  perform set_config('calendario.sistema', '', true);

  return jsonb_build_object('comentarios', n_com, 'fotos', n_fotos, 'fotos_sin_archivo', n_sin_archivo, 'pendientes', n_pend);
end;
$$;

revoke execute on function public.restaurar_camion(bigint) from public, anon;
grant execute on function public.restaurar_camion(bigint) to authenticated;
