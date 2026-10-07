import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Field, Input, Select } from '../components/ui.jsx';
import { supabase } from '../lib/supabase.js';
import Historial from './Historial.jsx';

const ROLES = [
  { value: 'lector', label: 'Lector — solo ve' },
  { value: 'editor', label: 'Editor — agenda camiones y obras' },
  { value: 'admin', label: 'Admin — además gestiona usuarios' },
];

const CLAVE_MIN = 8;

// Claves del almacenamiento local de la versión anterior (sin nube).
const LEGADO = {
  obras: 'rvc_calendario_obras_v1',
  eventos: 'rvc_calendario_camiones_v1',
};

async function llamarAdmin(cuerpo) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body: cuerpo });
  if (error) {
    let msg = error.message;
    try {
      msg = (await error.context.json()).error || msg;
    } catch {
      // respuesta sin JSON
    }
    throw new Error(msg);
  }
  return data;
}

function rolLabel(rol) {
  return ROLES.find((r) => r.value === rol)?.label.split(' — ')[0] || rol;
}

function FormularioUsuario({ usuario, esUnoMismo, onGuardar, onCancelar }) {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [nombre, setNombre] = useState(usuario?.nombre || '');
  const [clave, setClave] = useState('');
  const [rol, setRol] = useState(usuario?.rol || 'lector');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!usuario && !/^[a-z0-9._-]{3,30}$/.test(nombreUsuario.trim().toLowerCase())) {
      return setError('Usuario: 3 a 30 caracteres, solo letras minúsculas, números, punto o guion.');
    }
    if ((!usuario || clave) && clave.length < CLAVE_MIN) {
      return setError(`La clave debe tener al menos ${CLAVE_MIN} caracteres.`);
    }
    setEnviando(true);
    setError('');
    try {
      await onGuardar({ usuario: nombreUsuario.trim().toLowerCase(), nombre: nombre.trim(), clave, rol });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {usuario ? (
          <Field label="Usuario">
            <Input value={usuario.usuario} disabled />
          </Field>
        ) : (
          <Field label="Usuario (para ingresar)" required>
            <Input
              value={nombreUsuario}
              onChange={(e) => setNombreUsuario(e.target.value)}
              placeholder="Ej: jperez"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
            />
          </Field>
        )}
        <Field label="Nombre completo">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Juan Pérez" />
        </Field>
        <Field label={usuario ? 'Nueva clave' : 'Clave'} required={!usuario} hint={usuario ? 'Dejala vacía para no cambiarla.' : `Mínimo ${CLAVE_MIN} caracteres.`}>
          <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" required={!usuario} />
        </Field>
        <Field label="Rol" required hint={esUnoMismo ? 'No podés cambiar tu propio rol.' : undefined}>
          <Select value={rol} onChange={(e) => setRol(e.target.value)} disabled={esUnoMismo}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando}>
          {usuario ? 'Guardar cambios' : 'Crear usuario'}
        </Button>
      </div>
    </form>
  );
}

function GestionUsuarios({ perfil }) {
  const [usuarios, setUsuarios] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [creando, setCreando] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [error, setError] = useState('');

  // RLS deja al admin leer todos los perfiles directamente.
  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('perfiles').select('id, usuario, nombre, rol').order('usuario');
    if (error) setError(error.message);
    else setUsuarios(data);
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function eliminar(id) {
    setError('');
    try {
      await llamarAdmin({ accion: 'eliminar', id });
      setConfirmandoId(null);
      await recargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-base font-semibold text-gray-800">Usuarios</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        {usuarios.map((u) =>
          editandoId === u.id ? (
            <FormularioUsuario
              key={u.id}
              usuario={u}
              esUnoMismo={u.id === perfil.id}
              onCancelar={() => setEditandoId(null)}
              onGuardar={async ({ nombre, clave, rol }) => {
                await llamarAdmin({ accion: 'actualizar', id: u.id, nombre, rol, ...(clave ? { clave } : {}) });
                setEditandoId(null);
                await recargar();
              }}
            />
          ) : (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
              <div className="text-sm">
                <span className="font-medium text-gray-900">{u.usuario}</span>
                {u.nombre && <span className="ml-2 text-gray-500">{u.nombre}</span>}
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{rolLabel(u.rol)}</span>
                {u.id === perfil.id && <span className="ml-2 text-xs text-gray-400">(tú)</span>}
              </div>
              {confirmandoId === u.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-700">¿Eliminar a {u.usuario}?</span>
                  <Button variant="danger" onClick={() => eliminar(u.id)}>
                    Sí, eliminar
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmandoId(null)}>
                    No
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setEditandoId(u.id)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => setConfirmandoId(u.id)} disabled={u.id === perfil.id}>
                    Eliminar
                  </Button>
                </div>
              )}
            </div>
          ),
        )}

        {creando ? (
          <FormularioUsuario
            onCancelar={() => setCreando(false)}
            onGuardar={async (datos) => {
              await llamarAdmin({ accion: 'crear', ...datos });
              setCreando(false);
              await recargar();
            }}
          />
        ) : (
          <Button variant="secondary" className="w-full justify-center" onClick={() => setCreando(true)}>
            + Nuevo usuario
          </Button>
        )}
      </div>
    </Card>
  );
}

function leerLegado(clave) {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Sube a Supabase las obras y camiones guardados en este navegador por la versión anterior.
function ImportarLegado({ alTerminar }) {
  const [obras] = useState(() => leerLegado(LEGADO.obras));
  const [eventos] = useState(() => leerLegado(LEGADO.eventos));
  const [estado, setEstado] = useState('');

  if (obras.length === 0 && eventos.length === 0) return null;

  async function importar() {
    setEstado('Importando…');
    const mapa = {};
    for (const o of obras) {
      const { data, error } = await supabase
        .from('obras')
        .insert({ nombre: o.nombre, direccion: o.direccion || '' })
        .select('id')
        .single();
      if (error) return setEstado(`Error en obra "${o.nombre}": ${error.message}`);
      mapa[o.id] = data.id;
    }
    const filas = eventos
      .filter((ev) => mapa[ev.obraId])
      .map((ev) => ({
        obra_id: mapa[ev.obraId],
        tipo: ev.tipo,
        fecha: ev.fecha,
        hora_inicio: ev.horaInicio,
        duracion_min: Number(ev.duracionMin) || 60,
        guia_oc: ev.guiaOC || '',
        proveedor_cliente: ev.proveedorCliente || '',
        material: ev.material || '',
        forma_descarga: ev.formaDescarga || 'manual',
        estado: ev.estado || 'programado',
        observaciones: ev.observaciones || '',
      }));
    if (filas.length) {
      const { error } = await supabase.from('eventos').insert(filas);
      if (error) return setEstado(`Error en camiones: ${error.message}`);
    }
    localStorage.removeItem(LEGADO.obras);
    localStorage.removeItem(LEGADO.eventos);
    setEstado(`Listo: ${obras.length} obras y ${filas.length} camiones importados.`);
    alTerminar?.();
  }

  return (
    <Card className="border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-1 text-base font-semibold text-gray-800">Datos de la versión anterior en este navegador</h2>
      <p className="mb-3 text-sm text-gray-600">
        Encontré {obras.length} obras y {eventos.length} camiones guardados solo en este equipo. Podés subirlos a la base compartida (se
        agregan a lo que ya exista).
      </p>
      {estado ? (
        <p className="text-sm text-gray-700">{estado}</p>
      ) : (
        <Button onClick={importar}>Importar a la nube</Button>
      )}
    </Card>
  );
}

export default function Administracion({ perfil, esAdmin, puedeEditar, logout, obras }) {
  const [seccion, setSeccion] = useState('usuarios');
  return (
    <div className={`mx-auto space-y-4 ${seccion === 'historial' ? 'max-w-5xl' : 'max-w-2xl'}`}>
      <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
        <p className="text-sm text-gray-700">
          Conectado como <span className="font-semibold text-gray-900">{perfil.usuario}</span>
          {perfil.nombre && <span className="text-gray-500"> ({perfil.nombre})</span>} ·{' '}
          <span className="font-medium">{rolLabel(perfil.rol)}</span>
        </p>
        <Button variant="secondary" onClick={logout}>
          Cerrar sesión
        </Button>
      </Card>

      {puedeEditar && <ImportarLegado />}

      {esAdmin ? (
        <>
          <nav className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {[
              ['usuarios', 'Usuarios'],
              ['historial', 'Historial de cambios'],
            ].map(([valor, label]) => (
              <button
                key={valor}
                onClick={() => setSeccion(valor)}
                className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition ${seccion === valor ? 'bg-white text-[#C42B2B] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {label}
              </button>
            ))}
          </nav>
          {seccion === 'usuarios' ? <GestionUsuarios perfil={perfil} /> : <Historial obras={obras} />}
        </>
      ) : (
        <Card className="p-4 text-sm text-gray-500">La gestión de usuarios es solo para administradores.</Card>
      )}
    </div>
  );
}
