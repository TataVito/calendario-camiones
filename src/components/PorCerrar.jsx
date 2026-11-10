import { useCallback, useEffect, useState } from 'react';
import { Button, Modal } from './ui.jsx';
import { supabase } from '../lib/supabase.js';
import { aEvento, estadoInfo, hoyChile, horaFin, nombreCamion, tipoInfo } from '../lib/useEventos.js';
import { etiquetaFechaLarga } from '../lib/fechas.js';

// Estados que, si el día ya pasó, significan que nadie anotó cómo terminó el camión.
export const ESTADOS_ABIERTOS = ['programado', 'confirmado', 'en_porteria', 'en_proceso'];

const CIERRES = [
  { value: 'completado', label: '✓ Completo', estilo: 'border-[#2E6B4F] text-[#2E6B4F] hover:bg-[#2E6B4F]/10' },
  { value: 'incompleto', label: '◐ Incompleto', estilo: 'border-[#B07A1E] text-[#8A5A0B] hover:bg-[#B07A1E]/10' },
  { value: 'no_recibido', label: '✕ No recibido', estilo: 'border-[#A8232A] text-[#A8232A] hover:bg-[#A8232A]/10' },
  { value: 'cancelado', label: 'Cancelado', estilo: 'border-gray-400 text-gray-600 hover:bg-gray-100' },
];

// Camiones de días anteriores que siguen abiertos en la obra. `cambio` fuerza volver a contar
// (se le pasa la lista de camiones cargados, que se actualiza con cada cambio por Realtime).
export function usePorCerrar(obraId, cambio) {
  const [pendientes, setPendientes] = useState([]);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!obraId) return setPendientes([]);
    const { data, error: err } = await supabase
      .from('eventos')
      .select('*')
      .eq('obra_id', obraId)
      .lt('fecha', hoyChile())
      .in('estado', ESTADOS_ABIERTOS)
      .order('fecha')
      .order('hora_inicio')
      .limit(300);
    if (err) return setError(err.message);
    setError('');
    setPendientes(data.map(aEvento));
  }, [obraId]);

  useEffect(() => {
    cargar();
  }, [cargar, cambio]);

  return { pendientes, recargar: cargar, error };
}

// Aviso + ventana para cerrar de un clic cada camión pendiente.
export default function PorCerrar({ obraId, cambio, esAdmin, actualizar }) {
  const { pendientes, recargar, error } = usePorCerrar(obraId, cambio);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(null);

  if (!pendientes.length) return null;

  async function cerrar(ev, estado) {
    setGuardando(ev.id);
    await actualizar(ev.id, { estado });
    await recargar();
    setGuardando(null);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border border-[#B07A1E] bg-[#F6EBD4] px-3 py-2 text-sm text-[#5C3D06] no-print">
        <span>
          <b>{pendientes.length === 1 ? '1 camión' : `${pendientes.length} camiones`}</b> de días anteriores{' '}
          {pendientes.length === 1 ? 'sigue' : 'siguen'} sin cerrar. Anota cómo terminó cada uno para que los reportes sean reales.
        </span>
        <Button variant="secondary" onClick={() => setAbierto(true)}>
          Revisar
        </Button>
      </div>

      <Modal open={abierto} onClose={() => setAbierto(false)} title={`Por cerrar (${pendientes.length})`} wide>
        <p className="mb-3 text-sm text-gray-600">
          Camiones con fecha anterior a hoy que siguen como programados o en curso. Elige cómo terminó cada uno.
          {!esAdmin && ' Un camión marcado como Completo ya no se puede modificar (solo un administrador).'}
        </p>
        {error && <p className="mb-2 text-sm text-[#A8232A]">{error}</p>}
        <ul className="divide-y divide-gray-200 border border-gray-300">
          {pendientes.map((ev) => (
            <li key={ev.id} className="flex flex-col gap-2 px-3 py-2 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-tinta">
                  {nombreCamion(ev)}
                  {ev.proveedorCliente && <span className="font-normal text-gray-600"> · {ev.proveedorCliente}</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {etiquetaFechaLarga(ev.fecha)} · {ev.horaInicio}–{horaFin(ev)} · {tipoInfo(ev.tipo).label}
                  {ev.guiaOC && ` · OC ${ev.guiaOC}`} · <span className="font-medium">{estadoInfo(ev.estado).label}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {CIERRES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    disabled={guardando === ev.id}
                    onClick={() => cerrar(ev, c.value)}
                    className={`min-h-[36px] border px-2.5 text-xs font-medium disabled:opacity-50 ${c.estilo}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" onClick={() => setAbierto(false)}>
            Cerrar
          </Button>
        </div>
      </Modal>
    </>
  );
}
