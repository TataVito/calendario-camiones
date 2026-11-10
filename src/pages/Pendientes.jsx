import { useMemo, useState } from 'react';
import { Button, Card, Field, Input, Modal, Select, Textarea } from '../components/ui.jsx';
import PendienteLineas, { lineaVacia } from '../components/PendienteLineas.jsx';
import { PERIODOS, diasPendiente, enPeriodo, ordenar, textoDias, usePendientes } from '../lib/pendientes.js';
import { etiquetaDia, hoyISO } from '../lib/fechas.js';
import { cuandoCorto } from '../lib/comentarios.js';

function fechaCorta(iso) {
  return cuandoCorto(iso);
}

// Lista de lo que quedó pendiente en la obra (faltantes de camiones o anotados a mano).
// «✓ Llegó» lo saca de la lista y lo deja en «Ya llegaron».
export default function Pendientes({ obraNombre, puedeEditar, esAdmin }) {
  const { lista, cargando, error, limpiarError, agregar, resolver, reabrir, modificar, eliminar } = usePendientes();
  const [vista, setVista] = useState('pendiente'); // 'pendiente' | 'resuelto'
  const [periodo, setPeriodo] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [llegando, setLlegando] = useState(null); // id del pendiente que se está marcando
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyISO();

  const cuenta = useMemo(() => ({ pendiente: lista.filter((p) => p.estado === 'pendiente').length, resuelto: lista.filter((p) => p.estado === 'resuelto').length }), [lista]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ordenar(
      lista
        .filter((p) => p.estado === vista)
        .filter((p) => enPeriodo(p, periodo, hoy))
        .filter((p) => !q || [p.descripcion, p.material, p.proveedor, p.nota].some((v) => v.toLowerCase().includes(q))),
    );
  }, [lista, vista, periodo, busqueda, hoy]);

  async function confirmarLlegada(id) {
    setGuardando(true);
    const ok = await resolver(id, nota);
    setGuardando(false);
    if (ok) {
      setLlegando(null);
      setNota('');
    }
  }

  async function pedirBorrado(p) {
    if (!window.confirm(`¿Eliminar «${p.descripcion}» de la lista? No queda en «Ya llegaron». Si llegó, usa «✓ Llegó».`)) return;
    await eliminar(p.id);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <div>
          <h2 className="text-lg font-bold text-tinta">Pendientes de la obra</h2>
          <p className="text-sm text-gray-600">Lo que faltó en un camión o quedó por llegar. Cuando llegue, márcalo con «✓ Llegó».</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimir
          </Button>
          {puedeEditar && <Button onClick={() => setNuevo(true)}>+ Anotar pendiente</Button>}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 border border-[#D13038] bg-[#FBEBEC] px-3 py-2 text-sm text-[#A8232A] no-print">
          <span>No se pudo completar la operación: {error}</span>
          <button onClick={limpiarError}>✕</button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3 no-print">
        <div className="flex border border-tinta">
          {[
            { value: 'pendiente', label: 'Por llegar' },
            { value: 'resuelto', label: 'Ya llegaron' },
          ].map((v, i) => (
            <button
              key={v.value}
              onClick={() => setVista(v.value)}
              aria-pressed={vista === v.value}
              className={`min-h-[40px] px-4 text-sm font-medium ${i ? 'border-l border-tinta' : ''} ${vista === v.value ? 'bg-rvc font-bold text-white' : 'bg-white text-tinta hover:bg-tinta/5'}`}
            >
              {v.label} · {cuenta[v.value]}
            </button>
          ))}
        </div>
        <Field label="Quedó pendiente">
          <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Buscar">
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Material, proveedor…" />
        </Field>
      </div>

      <div className="mb-2 hidden print:block">
        <h2 className="text-lg font-bold">
          Pendientes {vista === 'resuelto' ? 'que ya llegaron' : 'por llegar'} · {obraNombre}
        </h2>
        <p className="text-xs">
          {PERIODOS.find((p) => p.value === periodo).label} · impreso el {etiquetaDia(hoy)}
        </p>
      </div>

      {cargando ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : visibles.length === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-500">
          {vista === 'pendiente'
            ? periodo === 'todos'
              ? 'No hay nada pendiente. Al marcar un camión como Incompleto o No recibido puedes anotar lo que faltó.'
              : 'No quedó nada pendiente en este periodo.'
            : 'Todavía no hay pendientes resueltos en este periodo.'}
        </Card>
      ) : (
        <ul className="divide-y divide-gray-300 border border-tinta bg-white">
          {visibles.map((p) => {
            const dias = diasPendiente(p, hoy);
            const atrasado = p.estado === 'pendiente' && dias >= 7;
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 pl-6 pr-4"
                style={{ boxShadow: `inset 8px 0 0 ${p.estado === 'resuelto' ? '#2E6B4F' : atrasado ? '#A8232A' : '#B07A1E'}` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold text-tinta">
                    {p.descripcion}
                    {p.cantidad && <span className="ml-2 font-mono text-sm font-medium text-gray-700">× {p.cantidad}</span>}
                  </div>
                  {(p.material || p.proveedor) && <div className="text-sm text-gray-700">{[p.material, p.proveedor].filter(Boolean).join(' · ')}</div>}
                  <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                    {p.eventoId ? 'Camión del ' : 'Desde el '}
                    {etiquetaDia(p.fechaOrigen)}
                    {p.estado === 'pendiente' && <span className={atrasado ? 'font-bold text-[#A8232A]' : ''}> ({textoDias(dias)})</span>}
                    {p.creadoPorUsuario && ` · anotó ${p.creadoPorUsuario}`}
                  </div>
                  {p.estado === 'resuelto' && (
                    <div className="mt-0.5 text-sm text-[#2E6B4F]">
                      ✓ Llegó{p.resueltoEn && ` el ${fechaCorta(p.resueltoEn)}`}
                      {p.resueltoPorUsuario && ` · marcó ${p.resueltoPorUsuario}`}
                      {p.nota && <span className="text-gray-700"> — {p.nota}</span>}
                    </div>
                  )}

                  {llegando === p.id && (
                    <div className="mt-2 space-y-2 no-print">
                      <Textarea rows={2} maxLength={300} autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional): en qué camión llegó, cuántas…" />
                      <div className="flex gap-2">
                        <Button variant="secondary" disabled={guardando} onClick={() => setLlegando(null)}>
                          Cancelar
                        </Button>
                        <Button disabled={guardando} onClick={() => confirmarLlegada(p.id)}>
                          {guardando ? 'Guardando…' : 'Confirmar que llegó'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {puedeEditar && llegando !== p.id && (
                  <div className="flex flex-wrap gap-2 no-print">
                    {p.estado === 'pendiente' ? (
                      <button
                        onClick={() => {
                          setLlegando(p.id);
                          setNota('');
                        }}
                        className="min-h-[40px] border border-[#2E6B4F] px-3 text-sm font-medium text-[#2E6B4F] hover:bg-[#2E6B4F]/10"
                      >
                        ✓ Llegó
                      </button>
                    ) : (
                      <button onClick={() => reabrir(p.id)} className="min-h-[40px] border border-tinta px-3 text-sm font-medium text-tinta hover:bg-tinta/5">
                        Volver a pendiente
                      </button>
                    )}
                    {p.estado === 'pendiente' && (
                      <button onClick={() => setEditando(p)} className="min-h-[40px] border border-gray-300 px-3 text-sm text-tinta hover:border-tinta">
                        Editar
                      </button>
                    )}
                    {esAdmin && (
                      <button onClick={() => pedirBorrado(p)} aria-label="Eliminar" className="min-h-[40px] border border-gray-300 px-3 text-sm text-[#A8232A] hover:border-[#A8232A]">
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={nuevo} title="Anotar pendiente" onClose={() => setNuevo(false)} wide>
        <FormPendiente
          onCancelar={() => setNuevo(false)}
          onGuardar={async (d) => {
            const ok = await agregar(d.lineas.map((l) => ({ ...l, proveedor: d.proveedor, material: d.material, fechaOrigen: d.fecha })));
            if (ok) setNuevo(false);
            return ok;
          }}
        />
      </Modal>
      <Modal open={!!editando} title="Editar pendiente" onClose={() => setEditando(null)} wide>
        {editando && (
          <FormPendiente
            pendiente={editando}
            onCancelar={() => setEditando(null)}
            onGuardar={async (d) => {
              const ok = await modificar(editando.id, { ...d.lineas[0], proveedor: d.proveedor, material: d.material });
              if (ok) setEditando(null);
              return ok;
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function FormPendiente({ pendiente, onGuardar, onCancelar }) {
  const [lineas, setLineas] = useState(() => (pendiente ? [{ descripcion: pendiente.descripcion, cantidad: pendiente.cantidad }] : [lineaVacia()]));
  const [material, setMaterial] = useState(pendiente?.material || '');
  const [proveedor, setProveedor] = useState(pendiente?.proveedor || '');
  const [fecha, setFecha] = useState(hoyISO());
  const [guardando, setGuardando] = useState(false);
  const valido = lineas.some((l) => l.descripcion.trim());

  async function submit(e) {
    e.preventDefault();
    if (!valido) return;
    setGuardando(true);
    await onGuardar({ lineas: lineas.filter((l) => l.descripcion.trim()), material, proveedor, fecha });
    setGuardando(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {pendiente ? (
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Field label="Qué falta" required>
            <Input maxLength={300} value={lineas[0].descripcion} onChange={(e) => setLineas([{ ...lineas[0], descripcion: e.target.value }])} required />
          </Field>
          <Field label="Cantidad">
            <Input maxLength={60} value={lineas[0].cantidad} onChange={(e) => setLineas([{ ...lineas[0], cantidad: e.target.value }])} />
          </Field>
        </div>
      ) : (
        <Field label="Qué falta">
          <PendienteLineas lineas={lineas} onChange={setLineas} autoFocus />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Material">
          <Input maxLength={200} value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Ej: Tinas" />
        </Field>
        <Field label="Proveedor">
          <Input maxLength={200} value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </Field>
      </div>
      {!pendiente && (
        <Field label="Desde cuándo está pendiente">
          <Input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} required />
        </Field>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!valido || guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
