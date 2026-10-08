import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { accionInfo, cambios, fechaHora } from '../lib/auditoria.js';
import { atrasoMin, atrasoTexto, duracionTexto, horaChile, tiempoDescargaMin, tiempoEnObraMin } from '../lib/tiempos.js';
import { Badge } from './ui.jsx';

// "Creado por X · modificado por Y" (visible para todos) y, solo para el admin, el historial
// del registro. A quien no es admin, RLS le devuelve el historial vacío y no se muestra.
export default function Autoria({ evento }) {
  const [historial, setHistorial] = useState([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vigente = true;
    supabase
      .from('auditoria')
      .select('*')
      .eq('registro_id', evento.id)
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        if (vigente) setHistorial(data || []);
      });
    return () => {
      vigente = false;
    };
  }, [evento.id, evento.actualizadoEn]);

  const modificado = evento.actualizadoEn && evento.actualizadoEn !== evento.creadoEn;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
      {evento.llegadaReal && (
        <div className="mb-1 text-sm text-gray-700">
          Portería: llegó <b>{horaChile(evento.llegadaReal)}</b> ({atrasoTexto(atrasoMin(evento))})
          {evento.inicioProcesoReal && (
            <>
              {' '}
              · inicio <b>{horaChile(evento.inicioProcesoReal)}</b>
            </>
          )}
          {evento.salidaReal && (
            <>
              {' '}
              · salió <b>{horaChile(evento.salidaReal)}</b> · {duracionTexto(tiempoEnObraMin(evento))} en obra
              {tiempoDescargaMin(evento) !== null && <> ({duracionTexto(tiempoDescargaMin(evento))} de descarga/carga)</>}
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Creado por <b className="text-gray-700">{evento.creadoPorUsuario || '—'}</b> el {fechaHora(evento.creadoEn)}
          {modificado && (
            <>
              {' '}
              · modificado por <b className="text-gray-700">{evento.actualizadoPorUsuario || '—'}</b> el {fechaHora(evento.actualizadoEn)}
            </>
          )}
        </span>
        {historial.length > 0 && (
          <button type="button" onClick={() => setAbierto((v) => !v)} className="font-medium text-[#B3261E] hover:underline">
            {abierto ? 'Ocultar historial' : `Ver historial (${historial.length})`}
          </button>
        )}
      </div>
      {abierto && (
        <ul className="mt-2 space-y-2 border-t border-gray-200 pt-2">
          {historial.map((h) => (
            <li key={h.id}>
              <div className="flex items-center gap-2">
                <Badge className={accionInfo(h.accion).color}>{accionInfo(h.accion).label}</Badge>
                <span className="text-gray-700">{h.usuario || '—'}</span>
                <span>{fechaHora(h.fecha)}</span>
              </div>
              {h.accion === 'modificar' && (
                <ul className="ml-2 mt-1">
                  {cambios(h).map((c) => (
                    <li key={c.campo}>
                      {c.campo}: <span className="line-through">{c.antes}</span> → <span className="text-gray-800">{c.despues}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
