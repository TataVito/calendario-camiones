import { useState } from 'react';
import { Button, Textarea } from './ui.jsx';
import Autoria from './Autoria.jsx';
import FotosGuia from './FotosGuia.jsx';
import { estadoInfo, formaDescargaInfo, horaFin, marcaInfo, nombreCamion, tipoInfo } from '../lib/useEventos.js';
import { colorBase, leerObservaciones } from '../lib/materiales.js';
import { useComentarios } from '../lib/comentarios.js';
import { usePendientes } from '../lib/pendientes.js';
import PendienteLineas, { lineaVacia } from './PendienteLineas.jsx';
import { etiquetaFechaLarga } from '../lib/fechas.js';

function Dato({ label, valor }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-base font-semibold text-tinta">{valor || <span className="font-normal text-gray-400">sin registrar</span>}</div>
    </div>
  );
}

// Cómo quedó la recepción: botones rápidos en la ficha.
const CIERRES = [
  { value: 'completado', label: '✓ Completo', estilo: 'border-[#2E6B4F] text-[#2E6B4F] hover:bg-[#2E6B4F]/5', activo: 'bg-[#2E6B4F] border-[#2E6B4F] text-white' },
  { value: 'incompleto', label: '◐ Incompleto', estilo: 'border-[#B07A1E] text-[#8A5A0B] hover:bg-[#B07A1E]/5', activo: 'bg-[#B07A1E] border-[#B07A1E] text-white' },
  { value: 'no_recibido', label: '✕ No recibido', estilo: 'border-[#A8232A] text-[#A8232A] hover:bg-[#A8232A]/5', activo: 'bg-[#A8232A] border-[#A8232A] text-white' },
];

// Ficha del camión: lo esencial para la obra (material, OC, proveedor y cantidades).
// Lo demás (forma de descarga, autoría) queda plegado en "Más información".
// Con onActualizar (quien puede editar) se marca cómo quedó sin abrir el formulario.
// Con puedeComentar se agregan comentarios (también en camiones completados).
export default function EventoDetalle({ evento, onCerrar, onEditar, onActualizar, puedeComentar, esAdmin, completado, puedeSubirFotos }) {
  const estado = estadoInfo(evento.estado);
  const esRecepcion = evento.tipo === 'recepcion';
  const { items, notas } = leerObservaciones(evento.observaciones);
  const { comentarios, agregar: agregarComentario, error: errorComentario } = useComentarios(evento);
  const color = colorBase(evento.material) || '#26262B';
  const { lista: todosPendientes, agregar: agregarPendientes, resolver: resolverPendiente, error: errorPendiente } = usePendientes();
  const pendientes = todosPendientes.filter((p) => p.eventoId === evento.id);
  const [faltantes, setFaltantes] = useState([]); // líneas «qué faltó» que se anotarán en Pendientes

  // Estado elegido que espera confirmación (con comentario opcional) y comentario suelto.
  const [eligiendo, setEligiendo] = useState(null);
  const [comentando, setComentando] = useState(false);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  // cual: estado elegido, null = comentario suelto, 'pendiente' = solo anotar lo que falta.
  function abrir(cual) {
    setEligiendo(cual === 'pendiente' ? null : cual);
    setComentando(cual === null);
    setTexto('');
    const conFaltantes = puedeComentar && (cual === 'incompleto' || cual === 'no_recibido' || cual === 'pendiente');
    setFaltantes(conFaltantes ? [lineaVacia(cual === 'no_recibido' ? evento.material || '' : '')] : []);
  }

  function cancelar() {
    setEligiendo(null);
    setComentando(false);
    setTexto('');
    setFaltantes([]);
  }

  const lineasFaltantes = faltantes.filter((l) => l.descripcion.trim());

  async function guardar() {
    if (!eligiendo && !texto.trim() && !lineasFaltantes.length) return cancelar();
    setGuardando(true);
    let ok = true;
    if (eligiendo && eligiendo !== evento.estado) ok = await onActualizar({ estado: eligiendo });
    if (ok && lineasFaltantes.length) ok = await agregarPendientes(lineasFaltantes.map((l) => ({ ...l, eventoId: evento.id })));
    if (ok && texto.trim()) ok = await agregarComentario(texto);
    setGuardando(false);
    if (ok) cancelar();
  }

  const elegido = CIERRES.find((c) => c.value === eligiendo);
  const bloquea = eligiendo === 'completado' && !esAdmin;

  return (
    <div className="space-y-4">
      <div className="border-l-8 pl-3" style={{ borderColor: color }}>
        <div className="text-xl font-bold text-tinta">{nombreCamion(evento)}</div>
        {evento.marca && <div className="text-sm font-medium text-tinta">{marcaInfo(evento.marca).icono} {marcaInfo(evento.marca).label}</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>
            {etiquetaFechaLarga(evento.fecha)} · {evento.horaInicio}–{horaFin(evento)} · {tipoInfo(evento.tipo).label}
          </span>
          <span className={`border px-2 py-0.5 text-xs font-medium ${estado.color}`}>{estado.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Dato label="Orden de compra / guía" valor={evento.guiaOC} />
        <Dato label={esRecepcion ? 'Proveedor' : 'Cliente / obra destino'} valor={evento.proveedorCliente} />
      </div>

      {items.length > 0 && (
        <table className="w-full border border-gray-300 text-sm">
          <thead className="bg-gray-100 text-left font-mono text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-1.5">Material</th>
              <th className="px-3 py-1.5 text-right">Cantidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((it, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5">{it.descripcion}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{it.cantidad || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {notas.length > 0 && (
        <div className="whitespace-pre-line border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{notas.join('\n')}</div>
      )}

      {comentarios.length > 0 && (
        <div>
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-gray-500">Comentarios</div>
          <ul className="space-y-1.5">
            {comentarios.map((c, i) => (
              <li key={i} className="border-l-4 border-[#B07A1E] bg-[#FBF5E8] px-3 py-1.5 text-sm text-tinta">
                {c.texto}
                {(c.autor || c.cuando) && <div className="font-mono text-[11px] text-gray-500">{[c.autor, c.cuando].filter(Boolean).join(' · ')}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendientes.length > 0 && (
        <div>
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wide text-gray-500">Pendientes de este camión</div>
          <ul className="space-y-1.5">
            {pendientes.map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-2 border-l-4 px-3 py-1.5 text-sm ${p.estado === 'pendiente' ? 'border-[#B07A1E] bg-[#FBF5E8] text-tinta' : 'border-[#2E6B4F] bg-[#EEF5F1] text-gray-600'}`}
              >
                <span>
                  {p.estado === 'resuelto' && '✓ '}
                  <b>{p.descripcion}</b>
                  {p.cantidad && ` × ${p.cantidad}`}
                  {p.estado === 'resuelto' ? ' — llegó' : ''}
                </span>
                {puedeComentar && p.estado === 'pendiente' && (
                  <button
                    type="button"
                    onClick={() => resolverPendiente(p.id)}
                    className="min-h-[32px] shrink-0 border border-[#2E6B4F] bg-white px-2 text-xs font-medium text-[#2E6B4F] hover:bg-[#2E6B4F]/10"
                  >
                    ✓ Llegó
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(onActualizar || puedeComentar) && (
        <div className="space-y-2 border border-gray-300 p-3">
          {onActualizar && <div className="font-mono text-[11px] uppercase tracking-wide text-gray-500">¿Cómo quedó {esRecepcion ? 'la recepción' : 'el despacho'}?</div>}
          <div className="flex flex-wrap gap-2">
            {onActualizar && CIERRES.map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={guardando}
                aria-pressed={evento.estado === c.value}
                onClick={() => abrir(c.value)}
                className={`min-h-[40px] border px-3 text-sm font-medium ${evento.estado === c.value || eligiendo === c.value ? c.activo : c.estilo}`}
              >
                {c.label}
              </button>
            ))}
            {puedeComentar && <button
              type="button"
              disabled={guardando}
              onClick={() => abrir(null)}
              className="min-h-[40px] border border-tinta px-3 text-sm font-medium text-tinta hover:bg-tinta/5"
            >
              💬 Agregar comentario
            </button>}
            {puedeComentar && <button
              type="button"
              disabled={guardando}
              onClick={() => abrir('pendiente')}
              className="min-h-[40px] border border-tinta px-3 text-sm font-medium text-tinta hover:bg-tinta/5"
            >
              📋 Anotar pendiente
            </button>}
          </div>
          {errorComentario && <p className="text-sm text-[#A8232A]">No se pudo guardar el comentario: {errorComentario}</p>}
          {errorPendiente && <p className="text-sm text-[#A8232A]">No se pudo guardar el pendiente: {errorPendiente}</p>}

          {(eligiendo || comentando || faltantes.length > 0) && (
            <div className="space-y-2 pt-1">
              {elegido && (
                <p className="text-sm text-gray-700">
                  Se marcará como <b>{estadoInfo(eligiendo).label}</b>.
                  {bloquea && ' Después ya no podrás modificarlo ni eliminarlo; solo un administrador.'}
                </p>
              )}
              {faltantes.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-tinta">¿Qué faltó? Queda en la lista de Pendientes hasta que llegue.</div>
                  <PendienteLineas lineas={faltantes} onChange={setFaltantes} autoFocus={!eligiendo || eligiendo === 'incompleto'} />
                </div>
              )}
              <Textarea
                rows={2}
                maxLength={300}
                autoFocus={faltantes.length === 0}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={
                  eligiendo === 'incompleto'
                    ? 'Comentario (opcional): qué faltó, cuándo llega el resto…'
                    : eligiendo === 'no_recibido'
                      ? 'Comentario (opcional): motivo, nueva fecha…'
                      : eligiendo
                        ? 'Comentario (opcional)'
                        : comentando
                          ? 'Ej: los receptáculos llegarán aparte a mediodía'
                          : 'Comentario (opcional)'
                }
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={cancelar} disabled={guardando}>
                  Cancelar
                </Button>
                <Button type="button" onClick={guardar} disabled={guardando || (!eligiendo && !texto.trim() && !lineasFaltantes.length)}>
                  {guardando ? 'Guardando…' : elegido ? 'Confirmar' : comentando ? 'Guardar comentario' : 'Guardar pendiente'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <FotosGuia evento={evento} puedeSubir={puedeSubirFotos} puedeBorrar={false} />

      <details className="text-sm">
        <summary className="cursor-pointer text-gray-500">Más información</summary>
        <div className="mt-2 space-y-2">
          {evento.formaDescarga && <div>Forma de descarga: {formaDescargaInfo(evento.formaDescarga).label}</div>}
          <Autoria evento={evento} />
        </div>
      </details>

      {!onEditar && (
        <div className="border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          {completado ? (
            <>
              Este camión ya está <span className="font-medium text-gray-700">completado</span>: solo un administrador puede
              modificarlo o eliminarlo.
            </>
          ) : (
            <>
              Tu usuario es de solo lectura. Para modificar o eliminar programaciones, pídele a un administrador el rol{' '}
              <span className="font-medium text-gray-700">Editor</span>.
            </>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCerrar}>
          Cerrar
        </Button>
        {onEditar && <Button onClick={onEditar}>✏️ Editar</Button>}
      </div>
    </div>
  );
}
