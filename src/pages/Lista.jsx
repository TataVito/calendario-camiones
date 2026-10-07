import { useMemo, useState } from 'react';
import { Button, Card, Field, Input, Modal, Select } from '../components/ui.jsx';
import EventoForm from '../components/EventoForm.jsx';
import EventoDetalle from '../components/EventoDetalle.jsx';
import { ESTADOS, TIPOS, estadoInfo, formaDescargaInfo, horaFin, tipoInfo } from '../lib/useEventos.js';
import { etiquetaFechaLarga, hoyISO } from '../lib/fechas.js';

export default function Lista({ eventos, obraActivaId, autenticado, esAdmin, agregar, actualizar, eliminar, buscarConflictos }) {
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return eventos
      .filter((ev) => (!desde || ev.fecha >= desde) && (!hasta || ev.fecha <= hasta))
      .filter((ev) => !tipo || ev.tipo === tipo)
      .filter((ev) => !estado || ev.estado === estado)
      .filter((ev) => {
        if (!q) return true;
        return [ev.guiaOC, ev.proveedorCliente, ev.material]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(q));
      })
      .sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
  }, [eventos, desde, hasta, tipo, estado, busqueda]);

  function hoy() {
    setDesde(hoyISO());
    setHasta(hoyISO());
  }

  // Completado: solo el admin lo puede modificar; los demás lo ven como detalle.
  function soloLectura(evento) {
    return !autenticado || (evento.estado === 'completado' && !esAdmin);
  }

  function guardar(datos) {
    if (modal?.evento) actualizar(modal.evento.id, datos);
    else agregar(datos);
    setModal(null);
  }

  function borrar(id) {
    eliminar(id);
    setModal(null);
  }

  const esRangoUnDia = desde === hasta;

  return (
    <div>
      <Card className="mb-4 p-4 no-print">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Field label="Desde">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Field>
          <Field label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Buscar">
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Guía, proveedor/cliente, recurso..."
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={hoy}>
              Hoy
            </Button>
            {autenticado && <Button onClick={() => setModal({ fecha: hoyISO() })}>+ Nuevo</Button>}
          </div>
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/rvc.jpg" alt="RVC" className="h-8 w-8 rounded object-cover" />
          <h2 className="text-lg font-semibold text-gray-800 print:block">
            {esRangoUnDia ? `Lista de camiones — ${etiquetaFechaLarga(desde)}` : `Lista de camiones (${desde} a ${hasta})`}
          </h2>
        </div>
        <Button variant="secondary" className="no-print" onClick={() => window.print()}>
          🖨️ Imprimir para portería
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Hora</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Guía/OC</th>
              <th className="px-3 py-2">Prov./Cliente</th>
              <th className="px-3 py-2">Recurso</th>
              <th className="px-3 py-2">Descarga</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 no-print">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrados.map((ev) => {
              const est = estadoInfo(ev.estado);
              return (
                <tr key={ev.id} className={ev.estado === 'cancelado' ? 'opacity-50' : ''}>
                  <td className="px-3 py-2 whitespace-nowrap">{ev.fecha}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ev.horaInicio}–{horaFin(ev)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{tipoInfo(ev.tipo).label}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{ev.guiaOC}</td>
                  <td className="px-3 py-2">{ev.proveedorCliente}</td>
                  <td className="px-3 py-2">{ev.material}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formaDescargaInfo(ev.formaDescarga).label}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${est.color}`}>{est.label}</span>
                  </td>
                  <td className="px-3 py-2 no-print">
                    <button className="text-sm text-[#C42B2B] hover:underline" onClick={() => setModal({ evento: ev })}>
                      {soloLectura(ev) ? 'Ver' : 'Editar'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                  No hay camiones agendados con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.evento ? (soloLectura(modal.evento) ? 'Detalle del camión' : 'Editar camión agendado') : 'Agendar nuevo camión'}
        wide
      >
        {modal &&
          (modal.evento && soloLectura(modal.evento) ? (
            <EventoDetalle evento={modal.evento} onCerrar={() => setModal(null)} completado={autenticado} />
          ) : (
            <EventoForm
              evento={modal.evento}
              fechaSugerida={modal.fecha}
              obraActivaId={obraActivaId}
              esAdmin={esAdmin}
              onGuardar={guardar}
              onCancelar={() => setModal(null)}
              onEliminar={borrar}
              buscarConflictos={buscarConflictos}
            />
          ))}
      </Modal>
    </div>
  );
}
