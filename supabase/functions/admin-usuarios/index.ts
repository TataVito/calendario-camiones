// Gestión de usuarios del calendario. La usan el súper usuario (todo) y el admin de obra
// (solo lectores, portería y editores de sus propias obras).
// Usa la service role key (solo existe en el servidor de Supabase, nunca en el navegador).
import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMINIO = 'calendario-rvc.invalid';
const ROLES = ['lector', 'porteria', 'editor', 'admin', 'superusuario'];
const ROLES_ADMIN_OBRA = ['lector', 'porteria', 'editor'];
const UUID_RE = /^[0-9a-f-]{36}$/i;
const USUARIO_RE = /^[a-z0-9._-]{3,30}$/;
const CLAVE_MIN = 8;

const ORIGENES = (Deno.env.get('ORIGENES_PERMITIDOS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function cors(req: Request) {
  const origen = req.headers.get('origin') ?? '';
  const permitido = ORIGENES.length === 0 || ORIGENES.includes(origen) ? origen : ORIGENES[0];
  return {
    'Access-Control-Allow-Origin': permitido || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function responder(req: Request, status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return responder(req, 405, { error: 'Método no permitido' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Identificar a quien llama a partir de su token de sesión.
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quien, error: errAuth } = await admin.auth.getUser(token);
  if (errAuth || !quien?.user) return responder(req, 401, { error: 'Sesión inválida' });

  // 2. Solo súper usuario (todo) o admin de obra (limitado a sus obras y a roles menores).
  const { data: perfil } = await admin.from('perfiles').select('rol, usuario').eq('id', quien.user.id).single();
  const esSuper = perfil?.rol === 'superusuario';
  if (!esSuper && perfil?.rol !== 'admin') return responder(req, 403, { error: 'Solo un administrador puede gestionar usuarios' });

  // Auditoría de la gestión de usuarios (las claves nunca se guardan, solo que cambiaron).
  const anotar = (accion: string, registroId: string, antes: unknown, despues: unknown) =>
    admin.from('auditoria').insert({
      usuario_id: quien.user.id,
      usuario: perfil.usuario,
      accion,
      tabla: 'usuarios',
      registro_id: registroId,
      antes,
      despues,
    });
  const leerObras = async (id: string): Promise<string[]> =>
    ((await admin.from('obra_usuarios').select('obra_id').eq('usuario_id', id)).data ?? []).map((r) => r.obra_id).sort();
  const leerPerfil = async (id: string) => {
    const p = (await admin.from('perfiles').select('usuario, nombre, rol').eq('id', id).single()).data;
    return p ? { ...p, obras: await leerObras(id) } : null;
  };

  // Lo que puede tocar quien llama.
  const misObras = esSuper ? null : new Set(await leerObras(quien.user.id));
  const rolesPermitidos = esSuper ? ROLES : ROLES_ADMIN_OBRA;
  const administra = (p: { rol: string; obras: string[] }) =>
    esSuper || (ROLES_ADMIN_OBRA.includes(p.rol) && p.obras.some((o) => misObras!.has(o)));

  // Calcula las obras finales: el admin solo cambia las suyas; las demás del usuario se conservan.
  const obrasFinales = (pedidas: unknown, actuales: string[]): string[] | string => {
    if (!Array.isArray(pedidas) || !pedidas.every((o) => typeof o === 'string' && UUID_RE.test(o))) return 'Obras inválidas';
    if (esSuper) return [...new Set(pedidas as string[])];
    const ajenas = (pedidas as string[]).filter((o) => !misObras!.has(o));
    if (ajenas.length) return 'Solo podés asignar tus propias obras.';
    return [...new Set([...actuales.filter((o) => !misObras!.has(o)), ...(pedidas as string[])])];
  };
  const guardarObras = async (id: string, obras: string[]) => {
    const { error: e1 } = await admin.from('obra_usuarios').delete().eq('usuario_id', id);
    if (e1) return e1.message;
    if (obras.length) {
      const { error: e2 } = await admin.from('obra_usuarios').insert(obras.map((obra_id) => ({ obra_id, usuario_id: id })));
      if (e2) return e2.message;
    }
    return null;
  };

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return responder(req, 400, { error: 'Solicitud inválida' });
  }
  const accion = body.accion;

  if (accion === 'crear') {
    const usuario = String(body.usuario ?? '').trim().toLowerCase();
    const nombre = String(body.nombre ?? '').trim();
    const clave = String(body.clave ?? '');
    const rol = String(body.rol ?? 'lector');
    if (!USUARIO_RE.test(usuario)) return responder(req, 400, { error: 'Usuario inválido: 3 a 30 caracteres, solo letras minúsculas, números, punto, guion.' });
    if (clave.length < CLAVE_MIN) return responder(req, 400, { error: `La clave debe tener al menos ${CLAVE_MIN} caracteres.` });
    if (!rolesPermitidos.includes(rol)) return responder(req, 403, { error: 'No podés asignar ese rol.' });
    const obras = obrasFinales(body.obras ?? [], []);
    if (typeof obras === 'string') return responder(req, 403, { error: obras });
    if (!esSuper && obras.length === 0) return responder(req, 400, { error: 'Asigná al menos una de tus obras.' });

    const { data, error } = await admin.auth.admin.createUser({
      email: `${usuario}@${DOMINIO}`,
      password: clave,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (error) {
      const msg = /already|registered|exists/i.test(error.message) ? 'Ese usuario ya existe.' : error.message;
      return responder(req, 400, { error: msg });
    }
    // El trigger crea el perfil como 'lector'; aquí se asigna el rol elegido.
    await admin.from('perfiles').update({ rol, nombre }).eq('id', data.user.id);
    const errObras = await guardarObras(data.user.id, rol === 'superusuario' ? [] : obras);
    if (errObras) return responder(req, 400, { error: errObras });
    await anotar('crear', data.user.id, null, await leerPerfil(data.user.id));
    return responder(req, 200, { ok: true });
  }

  if (accion === 'actualizar') {
    const id = String(body.id ?? '');
    if (!id) return responder(req, 400, { error: 'Falta el usuario' });
    const antes = await leerPerfil(id);
    if (!antes) return responder(req, 404, { error: 'Usuario no encontrado' });
    const esUnoMismo = id === quien.user.id;
    if (!esUnoMismo && !administra(antes)) return responder(req, 403, { error: 'No podés modificar a este usuario.' });

    const cambios: Record<string, string> = {};
    if (body.nombre !== undefined) cambios.nombre = String(body.nombre).trim();
    if (body.rol !== undefined && body.rol !== antes.rol) {
      const rol = String(body.rol);
      if (esUnoMismo) return responder(req, 400, { error: 'No podés cambiar tu propio rol.' });
      if (!rolesPermitidos.includes(rol)) return responder(req, 403, { error: 'No podés asignar ese rol.' });
      cambios.rol = rol;
    }
    let obras: string[] | undefined;
    if (body.obras !== undefined && !esUnoMismo) {
      const r = obrasFinales(body.obras, antes.obras);
      if (typeof r === 'string') return responder(req, 403, { error: r });
      obras = (cambios.rol ?? antes.rol) === 'superusuario' ? [] : r;
    }
    if (body.clave) {
      const clave = String(body.clave);
      if (clave.length < CLAVE_MIN) return responder(req, 400, { error: `La clave debe tener al menos ${CLAVE_MIN} caracteres.` });
      const { error } = await admin.auth.admin.updateUserById(id, { password: clave });
      if (error) return responder(req, 400, { error: error.message });
    }
    if (Object.keys(cambios).length) {
      const { error } = await admin.from('perfiles').update(cambios).eq('id', id);
      if (error) return responder(req, 400, { error: error.message });
    }
    if (obras) {
      const errObras = await guardarObras(id, obras);
      if (errObras) return responder(req, 400, { error: errObras });
    }
    const despues = { ...(await leerPerfil(id)), ...(body.clave ? { clave: '(cambiada)' } : {}) };
    if (JSON.stringify(despues) !== JSON.stringify(antes)) await anotar('modificar', id, antes, despues);
    return responder(req, 200, { ok: true });
  }

  if (accion === 'eliminar') {
    const id = String(body.id ?? '');
    if (!id) return responder(req, 400, { error: 'Falta el usuario' });
    if (id === quien.user.id) return responder(req, 400, { error: 'No podés eliminar tu propio usuario.' });
    const antes = await leerPerfil(id);
    if (!antes) return responder(req, 404, { error: 'Usuario no encontrado' });
    if (!administra(antes)) return responder(req, 403, { error: 'No podés eliminar a este usuario.' });
    // Un admin de obra no puede dejar sin acceso a alguien que también trabaja en otras obras.
    if (!esSuper && antes.obras.some((o) => !misObras!.has(o))) {
      return responder(req, 403, { error: 'Este usuario también trabaja en otras obras: quitale tus obras editándolo en vez de eliminarlo.' });
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return responder(req, 400, { error: error.message });
    await anotar('eliminar', id, antes, null);
    return responder(req, 200, { ok: true });
  }

  return responder(req, 400, { error: 'Acción desconocida' });
});
