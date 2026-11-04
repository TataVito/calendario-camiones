import { Button } from './ui.jsx';
import Autoria from './Autoria.jsx';
import FotosGuia from './FotosGuia.jsx';
import { estadoInfo, formaDescargaInfo, horaFin, tipoInfo } from '../lib/useEventos.js';
import { colorBase, leerObservaciones } from '../lib/materiales.js';
import { etiquetaFechaLarga } from '../lib/fechas.js';

function Dato({ label, valor }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-base font-semibold text-tinta">{valor || <span className="font-normal text-gray-400">sin registrar</span>}</div>
    </div>
  );
}

// Ficha del camión: lo esencial para la obra (material, OC, proveedor y cantidades).
// Lo demás (forma de descarga, autoría) queda plegado en "Más información".
export default function EventoDetalle({ evento, onCerrar, onEditar, completado, puedeSubirFotos }) {
  const estado = estadoInfo(evento.estado);
  const esRecepcion = evento.tipo === 'recepcion';
  const { items, notas } = leerObservaciones(evento.observaciones);
  const color = colorBase(evento.material) || '#26262B';

  return (
    <div className="space-y-4">
      <div className="border-l-8 pl-3" style={{ borderColor: color }}>
        <div className="text-xl font-bold text-tinta">{evento.material || tipoInfo(evento.tipo).label}</div>
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
              Tu usuario es de solo lectura. Para modificar o eliminar programaciones, pedile a un administrador el rol{' '}
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
