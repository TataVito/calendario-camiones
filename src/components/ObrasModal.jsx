import { useState } from 'react';
import { Button, Field, Input, Modal } from './ui.jsx';

function FormularioObra({ obra, onGuardar, onCancelar }) {
  const [nombre, setNombre] = useState(obra?.nombre || '');
  const [direccion, setDireccion] = useState(obra?.direccion || '');

  function submit(e) {
    e.preventDefault();
    if (!nombre.trim()) return;
    onGuardar({ nombre: nombre.trim(), direccion: direccion.trim() });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre de la obra" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Edificio Los Alerces" required autoFocus />
        </Field>
        <Field label="Dirección (opcional)">
          <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ej: Av. Siempre Viva 123" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit">{obra ? 'Guardar cambios' : 'Crear obra'}</Button>
      </div>
    </form>
  );
}

// Crear y eliminar obras: solo el súper usuario. El admin de obra solo edita las suyas.
export default function ObrasModal({ open, onClose, obras, obraActivaId, setObraActivaId, agregarObra, actualizarObra, eliminarObra, puedeCrearEliminar }) {
  const [editandoId, setEditandoId] = useState(null);
  const [creando, setCreando] = useState(false);

  function eliminar(obra) {
    const ok = window.confirm(`¿Eliminar la obra "${obra.nombre}"? También se eliminará todo el movimiento de camiones registrado en ella.`);
    if (ok) eliminarObra(obra.id);
  }

  return (
    <Modal open={open} onClose={onClose} title="Obras" wide>
      <div className="space-y-2">
        {obras.length === 0 && !creando && (
          <p className="text-sm text-gray-500">Todavía no hay obras creadas. Agregá la primera para empezar a coordinar camiones.</p>
        )}

        {obras.map((obra) =>
          editandoId === obra.id ? (
            <FormularioObra
              key={obra.id}
              obra={obra}
              onCancelar={() => setEditandoId(null)}
              onGuardar={(datos) => {
                actualizarObra(obra.id, datos);
                setEditandoId(null);
              }}
            />
          ) : (
            <div
              key={obra.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${obra.id === obraActivaId ? 'border-[#C42B2B] bg-red-50' : 'border-gray-200'}`}
            >
              <div>
                <div className="font-medium text-gray-900">{obra.nombre}</div>
                {obra.direccion && <div className="text-xs text-gray-500">{obra.direccion}</div>}
              </div>
              <div className="flex items-center gap-2">
                {obra.id !== obraActivaId && (
                  <Button variant="secondary" onClick={() => setObraActivaId(obra.id)}>
                    Seleccionar
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setEditandoId(obra.id)}>
                  Editar
                </Button>
                {puedeCrearEliminar && (
                  <Button variant="danger" onClick={() => eliminar(obra)}>
                    Eliminar
                  </Button>
                )}
              </div>
            </div>
          ),
        )}

        {!puedeCrearEliminar ? null : creando ? (
          <FormularioObra
            onCancelar={() => setCreando(false)}
            onGuardar={(datos) => {
              agregarObra(datos);
              setCreando(false);
            }}
          />
        ) : (
          <Button variant="secondary" className="w-full justify-center" onClick={() => setCreando(true)}>
            + Nueva obra
          </Button>
        )}
      </div>
    </Modal>
  );
}
