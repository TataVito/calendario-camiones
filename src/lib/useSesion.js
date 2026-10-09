import { useCallback, useEffect, useState } from 'react';
import { correoDeUsuario, supabase } from './supabase.js';
import { borrarTodoLocal, guardarLocal, leerLocal } from './local.js';

// Sesión de Supabase Auth + perfil (rol) del usuario conectado.
export function useSesion() {
  const [sesion, setSesion] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      if (!data.session) setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
      if (!nueva) {
        setPerfil(null);
        setCargando(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = sesion?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let vigente = true;
    setCargando(true);
    supabase
      .from('perfiles')
      .select('id, usuario, nombre, rol')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!vigente) return;
        // Sin señal: se usa el último perfil conocido de este usuario (la base igual valida todo).
        const perfilLocal = leerLocal('perfil');
        if (error && perfilLocal?.id === userId) setPerfil(perfilLocal);
        else {
          setPerfil(data);
          if (data) guardarLocal('perfil', data);
        }
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [userId]);

  const login = useCallback(async (usuario, clave) => {
    const { error } = await supabase.auth.signInWithPassword({ email: correoDeUsuario(usuario), password: clave });
    if (!error) return null;
    if (/rate|too many/i.test(error.message)) return 'Demasiados intentos. Esperá unos minutos.';
    return 'Usuario o clave incorrectos.';
  }, []);

  // Al salir se borran las copias locales de datos: no deben quedar en un equipo compartido.
  const logout = useCallback(async (motivo) => {
    borrarTodoLocal();
    if (typeof motivo === 'string' && motivo) {
      try {
        sessionStorage.setItem('rvc_motivo_salida', motivo);
      } catch {
        // sin almacenamiento: solo no se muestra el motivo
      }
    }
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const rol = perfil?.rol || '';
  return {
    cargando,
    conectado: Boolean(sesion && perfil),
    perfil,
    rol,
    puedeEditar: ['editor', 'admin', 'superusuario'].includes(rol),
    puedePorteria: ['porteria', 'editor', 'admin', 'superusuario'].includes(rol),
    // esAdmin: administrador (de obra o súper): se salta reglas, gestiona usuarios y ve el historial.
    esAdmin: rol === 'admin' || rol === 'superusuario',
    esSuper: rol === 'superusuario',
    login,
    logout,
  };
}
