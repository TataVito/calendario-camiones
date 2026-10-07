import { useMemo, useState } from 'react';
import { Button, Field, Input, Select, Textarea } from './ui.jsx';
import Autoria from './Autoria.jsx';
import { hoyISO } from '../lib/fechas.js';
import { ESTADOS, FORMAS_DESCARGA, RECURSOS_SUGERIDOS, TIPOS, horaFin, tipoInfo } from '../lib/useEventos.js';

const DURACIONES = [15, 30, 45, 60, 90, 120, 180];

function valoresIniciales(evento, fechaSugerida, horaSugerida, obraActivaId) {
  if (evento) {
    return { ...evento };
  }
  return {
    obraId: obraActivaId,
    tipo: 'recepcion',
    fecha: fechaSugerida || new Date().toISOString().slice(0, 10),
    horaInicio: horaSugerida || '09:00',
    duracionMin: 60,
    guiaOC: '',
    proveedorCliente: '',
    material: '',
    formaDescarga: 'manual',
    estado: 'programado',
    observaciones: '',
  };
}

export default function EventoForm({ evento, fechaSugerida, horaSugerida, obraActivaId, esAdmin, onGuardar, onCancelar, onEliminar, buscarConflictos }) {
  const [datos, setDatos] = useState(() => valoresIniciales(evento, fechaSugerida, horaSugerida, obraActivaId));

  function pedirBorrado() {
    const ok = window.confirm('¿Eliminar esta programación? Esta acción no se puede deshacer.');
    if (ok) onEliminar(evento.id);
  }

  const conflictos = useMemo(
    () => buscarConflictos(datos, evento?.id),
    [datos.fecha, datos.horaInicio, datos.duracionMin, evento?.id, buscarConflictos],
  );

  function set(campo, valor) {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }

  // Solo el admin agenda (o mueve) camiones a fechas pasadas; la base también lo impide.
  const hoy = hoyISO();
  const cambiaFecha = !evento || datos.fecha !== evento.fecha;
  const fechaPasada = !esAdmin && cambiaFecha && datos.fecha < hoy;

  function submit(e) {
    e.preventDefault();
    if (fechaPasada) return;
    onGuardar(datos);
  }

  const esRecepcion = datos.tipo === 'recepcion';

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo de movimiento" required>
          <Select value={datos.tipo} onChange={(e) => set('tipo', e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={datos.estado} onChange={(e) => set('estado', e.target.value)}>
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Fecha" required>
          <Input type="date" value={datos.fecha} min={!esAdmin && cambiaFecha ? hoy : undefined} onChange={(e) => set('fecha', e.target.value)} required />
        </Field>
        <Field label="Hora de llegada" required>
          <Input type="time" value={datos.horaInicio} onChange={(e) => set('horaInicio', e.target.value)} required />
        </Field>
        <Field label="Duración estimada">
          <Select value={datos.duracionMin} onChange={(e) => set('duracionMin', Number(e.target.value))}>
            {DURACIONES.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h${m > 60 ? 's' : ''}`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {conflictos.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ Choca con el espacio de carga/descarga:{' '}
          {conflictos
            .map((c) => `${tipoInfo(c.tipo).label}${c.proveedorCliente ? ` (${c.proveedorCliente})` : ''} ${c.horaInicio}–${horaFin(c)}`)
            .join(', ')}
          .
          Solo hay un espacio disponible — reprogramá o confirmá a sabiendas.
        </div>
      )}

      <Field label={esRecepcion ? 'Proveedor' : 'Cliente / obra destino'}>
        <Input value={datos.proveedorCliente} onChange={(e) => set('proveedorCliente', e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Tipo de recurso a ${esRecepcion ? 'recibir' : 'despachar'}`}>
          <Input
            list="recursos-sugeridos"
            value={datos.material}
            onChange={(e) => set('material', e.target.value)}
            placeholder="Ej: Hormigón, Fierro, Áridos..."
          />
          <datalist id="recursos-sugeridos">
            {RECURSOS_SUGERIDOS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Forma de descarga">
          <Select value={datos.formaDescarga} onChange={(e) => set('formaDescarga', e.target.value)}>
            {FORMAS_DESCARGA.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="N° de guía / orden de compra">
        <Input value={datos.guiaOC} onChange={(e) => set('guiaOC', e.target.value)} placeholder="Ej: GD-00123" />
      </Field>

      <Field label="Observaciones">
        <Textarea rows={2} value={datos.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
      </Field>

      {fechaPasada && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se puede agendar un camión en una fecha anterior a hoy. Solo un administrador puede hacerlo.
        </p>
      )}
      {!esAdmin && datos.estado === 'completado' && evento?.estado !== 'completado' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Al guardarlo como <b>Completado</b> ya no podrás modificarlo ni eliminarlo; solo un administrador.
        </p>
      )}

      {evento && <Autoria evento={evento} />}

      <div className="flex items-center justify-between pt-2">
        <div>
          {evento && (
            <Button type="button" variant="danger" onClick={pedirBorrado}>
              Eliminar
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={fechaPasada}>{evento ? 'Guardar cambios' : 'Agendar camión'}</Button>
        </div>
      </div>
    </form>
  );
}
