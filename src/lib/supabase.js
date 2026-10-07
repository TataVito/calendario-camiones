import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && anonKey);

// La anon key es pública por diseño: la seguridad la imponen las políticas RLS de la base.
export const supabase = configurado ? createClient(url, anonKey) : null;

// Los usuarios entran con "usuario + clave"; internamente Supabase Auth necesita un correo.
// Debe coincidir con DOMINIO en supabase/functions/admin-usuarios/index.ts.
export const DOMINIO_USUARIOS = 'calendario-rvc.invalid';

export function correoDeUsuario(usuario) {
  return `${usuario.trim().toLowerCase()}@${DOMINIO_USUARIOS}`;
}
