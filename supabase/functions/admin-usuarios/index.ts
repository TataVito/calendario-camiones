// Gestión de usuarios del calendario. Solo la puede usar un usuario con rol 'admin'.
// Usa la service role key (solo existe en el servidor de Supabase, nunca en el navegador).
import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMINIO = 'calendario-rvc.invalid';
const ROLES = ['lector', 'editor', 'admin'];
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

  // 2. Confirmar que es admin.
  const { data: perfil } = await admin.from('perfiles').select('rol, usuario').eq('id', quien.user.id).single();
  if (perfil?.rol !== 'admin') return responder(req, 403, { error: 'Solo un administrador puede gestionar usuarios' });

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
  const leerPerfil = async (id: string) =>
    (await admin.from('perfiles').select('usuario, nombre, rol').eq('id', id).single()).data;

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
    if (!ROLES.includes(rol)) return responder(req, 400, { error: 'Rol inválido' });

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
    await anotar('crear', data.user.id, null, { usuario, nombre, rol });
    return responder(req, 200, { ok: true });
  }

  if (accion === 'actualizar') {
    const id = String(body.id ?? '');
    if (!id) return responder(req, 400, { error: 'Falta el usuario' });
    const antes = await leerPerfil(id);
    if (!antes) return responder(req, 404, { error: 'Usuario no encontrado' });
    const cambios: Record<string, string> = {};
    if (body.nombre !== undefined) cambios.nombre = String(body.nombre).trim();
    if (body.rol !== undefined) {
      const rol = String(body.rol);
      if (!ROLES.includes(rol)) return responder(req, 400, { error: 'Rol inválido' });
      if (id === quien.user.id && rol !== 'admin') return responder(req, 400, { error: 'No podés quitarte el rol de administrador a vos mismo.' });
      cambios.rol = rol;
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
    const despues = { ...antes, ...cambios, ...(body.clave ? { clave: '(cambiada)' } : {}) };
    if (JSON.stringify(despues) !== JSON.stringify(antes)) await anotar('modificar', id, antes, despues);
    return responder(req, 200, { ok: true });
  }

  if (accion === 'eliminar') {
    const id = String(body.id ?? '');
    if (!id) return responder(req, 400, { error: 'Falta el usuario' });
    if (id === quien.user.id) return responder(req, 400, { error: 'No podés eliminar tu propio usuario.' });
    const antes = await leerPerfil(id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return responder(req, 400, { error: error.message });
    await anotar('eliminar', id, antes, null);
    return responder(req, 200, { ok: true });
  }

  return responder(req, 400, { error: 'Acción desconocida' });
});
