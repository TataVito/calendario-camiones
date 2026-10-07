import { useState } from 'react';
import { Button, Card, Field, Input, Select } from '../components/ui.jsx';

function FormularioUsuario({ usuario, onGuardar, onCancelar }) {
  const [nombre, setNombre] = useState(usuario?.nombre || '');
  const [clave, setClave] = useState(usuario?.clave || '');

  function submit(e) {
    e.preventDefault();
    if (!nombre.trim() || !clave.trim()) return;
    onGuardar({ nombre: nombre.trim(), clave: clave.trim() });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Juan Pérez" required autoFocus />
        </Field>
        <Field label="Clave" required>
          <Input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Clave de acceso" required />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit">{usuario ? 'Guardar cambios' : 'Crear usuario'}</Button>
      </div>
    </form>
  );
}

function PrimerAdmin({ crearPrimerAdmin }) {
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!nombre.trim() || !clave.trim()) return;
    crearPrimerAdmin({ nombre: nombre.trim(), clave: clave.trim() });
  }

  return (
    <Card className="mx-auto mt-6 max-w-md p-6">
      <h2 className="mb-2 text-lg font-semibold text-gray-800">Creá el primer usuario administrador</h2>
      <p className="mb-4 text-sm text-gray-500">
        Todos pueden ver la programación de camiones, pero solo los usuarios registrados aquí pueden crear, modificar o
        eliminar. Empezá creando tu cuenta.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nombre" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" required autoFocus />
        </Field>
        <Field label="Clave" required>
          <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Clave de acceso" required />
        </Field>
        <Button type="submit" className="w-full justify-center">
          Crear mi cuenta
        </Button>
      </form>
    </Card>
  );
}

function Login({ usuarios, login }) {
  const [nombre, setNombre] = useState(usuarios[0]?.nombre || '');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');

  function submit(e) {
    e.preventDefault();
    const ok = login(nombre, clave);
    if (!ok) {
      setError('Usuario o clave incorrectos.');
    }
  }

  return (
    <Card className="mx-auto mt-6 max-w-md p-6">
      <h2 className="mb-2 text-lg font-semibold text-gray-800">Iniciar sesión</h2>
      <p className="mb-4 text-sm text-gray-500">Solo los usuarios autorizados pueden crear, modificar o eliminar camiones agendados.</p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Usuario" required>
          <Select value={nombre} onChange={(e) => setNombre(e.target.value)}>
            {usuarios.map((u) => (
              <option key={u.id} value={u.nombre}>
                {u.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Clave" required>
          <Input
            type="password"
            value={clave}
            onChange={(e) => {
              setClave(e.target.value);
              setError('');
            }}
            placeholder="Clave de acceso"
            required
            autoFocus
          />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full justify-center">
          Ingresar
        </Button>
      </form>
    </Card>
  );
}

function PanelAutenticado({ usuarios, usuarioActivo, agregarUsuario, actualizarUsuario, eliminarUsuario, logout }) {
  const [editandoId, setEditandoId] = useState(null);
  const [creando, setCreando] = useState(false);

  function eliminar(usuario) {
    if (usuarios.length <= 1) return;
    const ok = window.confirm(`¿Eliminar al usuario "${usuario.nombre}"? Ya no podrá iniciar sesión.`);
    if (ok) eliminarUsuario(usuario.id);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="mb-4 flex items-center justify-between p-4">
        <p className="text-sm text-gray-700">
          Conectado como <span className="font-semibold text-gray-900">{usuarioActivo.nombre}</span>
        </p>
        <Button variant="secondary" onClick={logout}>
          Cerrar sesión
        </Button>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-base font-semibold text-gray-800">Usuarios autorizados</h2>
        <div className="space-y-2">
          {usuarios.map((u) =>
            editandoId === u.id ? (
              <FormularioUsuario
                key={u.id}
                usuario={u}
                onCancelar={() => setEditandoId(null)}
                onGuardar={(datos) => {
                  actualizarUsuario(u.id, datos);
                  setEditandoId(null);
                }}
              />
            ) : (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-900">{u.nombre}</span>
                  {u.id === usuarioActivo.id && <span className="ml-2 text-xs text-gray-400">(tú)</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setEditandoId(u.id)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => eliminar(u)} disabled={usuarios.length <= 1}>
                    Eliminar
                  </Button>
                </div>
              </div>
            ),
          )}

          {creando ? (
            <FormularioUsuario
              onCancelar={() => setCreando(false)}
              onGuardar={(datos) => {
                agregarUsuario(datos);
                setCreando(false);
              }}
            />
          ) : (
            <Button variant="secondary" className="w-full justify-center" onClick={() => setCreando(true)}>
              + Nuevo usuario
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function Administracion({ usuarios, usuarioActivo, autenticado, agregarUsuario, actualizarUsuario, eliminarUsuario, login, logout, crearPrimerAdmin }) {
  if (usuarios.length === 0) {
    return <PrimerAdmin crearPrimerAdmin={crearPrimerAdmin} />;
  }

  if (!autenticado) {
    return <Login usuarios={usuarios} login={login} />;
  }

  return (
    <PanelAutenticado
      usuarios={usuarios}
      usuarioActivo={usuarioActivo}
      agregarUsuario={agregarUsuario}
      actualizarUsuario={actualizarUsuario}
      eliminarUsuario={eliminarUsuario}
      logout={logout}
    />
  );
}
