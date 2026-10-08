import { Button } from './ui.jsx';
import Autoria from './Autoria.jsx';
import FotosGuia from './FotosGuia.jsx';
import { estadoInfo, formaDescargaInfo, horaFin, tipoInfo } from '../lib/useEventos.js';

function Dato({ label, valor }) {
  if (!valor) return null;
  return (
    <div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="text-sm text-gray-900">{valor}</div>
    </div>
  );
}

export default function EventoDetalle({ evento, onCerrar, completado, puedeSubirFotos }) {
  const estado = estadoInfo(evento.estado);
  const esRecepcion = evento.tipo === 'recepcion';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">
          {evento.fecha} · {evento.horaInicio}–{horaFin(evento)} · {tipoInfo(evento.tipo).label}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${estado.color}`}>{estado.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Dato label={esRecepcion ? 'Proveedor' : 'Cliente / obra destino'} valor={evento.proveedorCliente} />
        <Dato label="Tipo de recurso" valor={evento.material} />
        <Dato label="Forma de descarga" valor={evento.formaDescarga && formaDescargaInfo(evento.formaDescarga).label} />
        <Dato label="N° de guía / orden de compra" valor={evento.guiaOC} />
      </div>

      {evento.observaciones && <Dato label="Observaciones" valor={evento.observaciones} />}

      <FotosGuia evento={evento} puedeSubir={puedeSubirFotos} puedeBorrar={false} />
      <Autoria evento={evento} />

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
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

      <div className="flex justify-end">
        <Button variant="secondary" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
