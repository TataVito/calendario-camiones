import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'rvc_calendario_usuarios_v1';
const SESION_KEY = 'rvc_calendario_sesion_v1';

function cargarUsuarios() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function cargarSesion() {
  return localStorage.getItem(SESION_KEY) || '';
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState(cargarUsuarios);
  const [sesionUsuarioId, setSesionUsuarioId] = useState(cargarSesion);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usuarios));
  }, [usuarios]);

  useEffect(() => {
    localStorage.setItem(SESION_KEY, sesionUsuarioId || '');
  }, [sesionUsuarioId]);

  const usuarioActivo = usuarios.find((u) => u.id === sesionUsuarioId) || null;
  const autenticado = !!usuarioActivo;

  const agregarUsuario = useCallback((datos) => {
    const nuevo = { id: uid(), ...datos };
    setUsuarios((prev) => [...prev, nuevo]);
    return nuevo;
  }, []);

  const actualizarUsuario = useCallback((id, datos) => {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, ...datos } : u)));
  }, []);

  const eliminarUsuario = useCallback((id) => {
    setUsuarios((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const login = useCallback(
    (nombre, clave) => {
      const encontrado = usuarios.find((u) => u.nombre === nombre && u.clave === clave);
      if (encontrado) {
        setSesionUsuarioId(encontrado.id);
        return true;
      }
      return false;
    },
    [usuarios],
  );

  const logout = useCallback(() => {
    setSesionUsuarioId('');
  }, []);

  const crearPrimerAdmin = useCallback((datos) => {
    const nuevo = { id: uid(), ...datos };
    setUsuarios((prev) => [...prev, nuevo]);
    setSesionUsuarioId(nuevo.id);
    return nuevo;
  }, []);

  return {
    usuarios,
    usuarioActivo,
    autenticado,
    agregarUsuario,
    actualizarUsuario,
    eliminarUsuario,
    login,
    logout,
    crearPrimerAdmin,
  };
}
