import { useState } from 'react';
import { Button, Modal } from './ui.jsx';
import { supabase } from '../lib/supabase.js';
import { aEvento, hoyChile } from '../lib/useEventos.js';
import { compararConAgendados, leerCalendarioHTML, observacionesDe } from '../lib/importarCalendario.js';
import { etiquetaFechaLarga } from '../lib/fechas.js';

// Botón + ventana para subir el "Calendario de despachos" (.html) de la obra.
// Muestra qué se va a agendar, mover o cancelar, y solo aplica lo marcado.
export default function ImportarCalendario({ obraId, obraNombre, onListo }) {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState('');
  const [plan, setPlan] = useState(null);
  const [marcados, setMarcados] = useState(new Set());
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState(null);

  function cerrar() {
    setAbierto(false);
    setArchivo('');
    setPlan(null);
    setError('');
    setResultado(null);
  }

  async function elegirArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPlan(null);
    setResultado(null);
    setArchivo(file.name);
    setTrabajando(true);
    try {
      const despachos = leerCalendarioHTML(await file.text());
      const hoy = hoyChile();
      const { data, error: err } = await supabase.from('eventos').select('*').eq('obra_id', obraId).gte('fecha', hoy).limit(5000);
      if (err) throw new Error(err.message);
      const p = compararConAgendados(despachos, data.map(aEvento), hoy);
      setPlan(p);
      setMarcados(new Set([...p.nuevos, ...p.movidos, ...p.actualizar].map((x) => x.despacho.ref)));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setTrabajando(false);
    }
  }

  function alternar(clave) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });
  }

  async function aplicar() {
    setTrabajando(true);
    const hoy = hoyChile();
    const r = { agendados: 0, movidos: 0, ordenados: 0, cancelados: 0, fallas: [] };
    for (const item of plan.nuevos) {
      const d = item.despacho;
      if (!marcados.has(d.ref)) continue;
      const { error: err } = await supabase.from('eventos').insert({
        obra_id: obraId,
        tipo: 'recepcion',
        fecha: d.fecha,
        hora_inicio: item.horaInicio,
        duracion_min: 60,
        guia_oc: d.oc,
        proveedor_cliente: d.proveedor || item.separadoDe?.proveedorCliente || '',
        material: d.material,
        forma_descarga: 'manual',
        estado: 'programado',
        observaciones: observacionesDe(d, hoy),
        choque_aceptado: item.choque,
      });
      if (err) r.fallas.push(`${d.fecha} ${d.material}: ${err.message}`);
      else r.agendados++;
    }
    for (const item of plan.movidos) {
      const d = item.despacho;
      if (!marcados.has(d.ref)) continue;
      const { error: err } = await supabase
        .from('eventos')
        .update({
          fecha: d.fecha,
          hora_inicio: item.horaInicio,
          guia_oc: d.oc || item.evento.guiaOC,
          proveedor_cliente: d.proveedor || item.evento.proveedorCliente,
          observaciones: observacionesDe(d, hoy),
          choque_aceptado: item.choque,
        })
        .eq('id', item.evento.id);
      if (err) r.fallas.push(`${d.fecha} ${d.material}: ${err.message}`);
      else r.movidos++;
    }
    for (const { despacho: d, evento } of plan.actualizar) {
      if (!marcados.has(d.ref)) continue;
      const { error: err } = await supabase
        .from('eventos')
        .update({
          material: d.material,
          guia_oc: d.oc,
          proveedor_cliente: d.proveedor || evento.proveedorCliente,
          observaciones: observacionesDe(d, hoy),
        })
        .eq('id', evento.id);
      if (err) r.fallas.push(`${d.fecha} ${d.material}: ${err.message}`);
      else r.ordenados++;
    }
    for (const { evento } of plan.sobran) {
      if (!marcados.has(evento.id)) continue;
      const { error: err } = await supabase.from('eventos').update({ estado: 'cancelado' }).eq('id', evento.id);
      if (err) r.fallas.push(`${evento.fecha} ${evento.material}: ${err.message}`);
      else r.cancelados++;
    }
    setResultado(r);
    setPlan(null);
    setTrabajando(false);
    onListo?.();
  }

  const cuantosMarcados = plan
    ? [...plan.nuevos, ...plan.movidos, ...plan.actualizar].filter((x) => marcados.has(x.despacho.ref)).length +
      plan.sobran.filter((x) => marcados.has(x.evento.id)).length
    : 0;

  return (
    <>
      <Button variant="secondary" onClick={() => setAbierto(true)} disabled={!obraId}>
        📥 Importar calendario de despachos
      </Button>
      <Modal open={abierto} onClose={cerrar} title={`Importar calendario de despachos — ${obraNombre || 'obra'}`} wide>
        <div className="space-y-4 text-sm">
          <p className="text-gray-600">
            Sube el archivo <b>.html</b> del calendario de despachos. Se agendan como recepción los despachos de hoy en adelante
            que todavía no estén. Si vuelves a subir una versión nueva, los que cambiaron de fecha se mueven y no se duplican.
          </p>
          <label className="inline-flex min-h-[40px] cursor-pointer items-center border border-tinta px-3.5 py-2 font-medium text-tinta hover:bg-tinta/5">
            📄 Elegir archivo…
            <input type="file" accept=".html,.htm,text/html" className="hidden" onChange={elegirArchivo} disabled={trabajando} />
          </label>
          {archivo && <span className="ml-3 font-mono text-xs text-gray-500">{archivo}</span>}
          {trabajando && <p className="text-gray-500">Procesando…</p>}
          {error && <p className="border border-[#D13038] bg-[#D13038]/5 p-3 text-[#D13038]">{error}</p>}

          {plan && (
            <>
              <Seccion
                titulo={`Nuevos para agendar (${plan.nuevos.length})`}
                items={plan.nuevos}
                clave={(x) => x.despacho.ref}
                marcados={marcados}
                alternar={alternar}
                detalle={(x) =>
                  `${x.horaInicio}${x.choque ? ' · choca con otro camión' : ''}${
                    x.separadoDe ? ` · OC separada del camión de las ${x.separadoDe.horaInicio}${x.separadoDe.proveedorCliente ? ` (${x.separadoDe.proveedorCliente})` : ''}` : ''
                  }`
                }
              />
              <Seccion
                titulo={`Cambiaron de fecha: se mueven (${plan.movidos.length})`}
                items={plan.movidos}
                clave={(x) => x.despacho.ref}
                marcados={marcados}
                alternar={alternar}
                detalle={(x) => `antes ${etiquetaFechaLarga(x.evento.fecha)} → ${x.horaInicio}`}
              />
              <Seccion
                titulo={`Cargados antes: quedan con nombre del material, su OC y cantidades (${plan.actualizar.length})`}
                items={plan.actualizar}
                clave={(x) => x.despacho.ref}
                marcados={marcados}
                alternar={alternar}
                detalle={(x) => `antes: ${x.evento.material || '—'} · OC ${x.evento.guiaOC || '—'}`}
              />
              <Seccion
                titulo={`Ya no están en el archivo (${plan.sobran.length}) — marca los que quieras cancelar`}
                items={plan.sobran}
                clave={(x) => x.evento.id}
                marcados={marcados}
                alternar={alternar}
                fecha={(x) => x.evento.fecha}
                nombre={(x) => `${x.evento.material || '—'}${x.evento.proveedorCliente ? ` · ${x.evento.proveedorCliente}` : ''}`}
                detalle={(x) => x.evento.horaInicio}
              />
              {plan.iguales.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-gray-600">
                    {plan.iguales.length} ya estaban agendados y no se tocan (ver cuáles)
                  </summary>
                  <ul className="mt-1 max-h-64 divide-y divide-gray-200 overflow-y-auto border border-gray-300">
                    {plan.iguales.map((x) => (
                      <li key={x.despacho.ref} className="px-3 py-1.5">
                        <span className="font-medium">{etiquetaFechaLarga(x.despacho.fecha)}</span> — {x.despacho.material}
                        <span className="block font-mono text-[11px] text-gray-500">
                          ya está como: {x.evento.horaInicio} · {x.evento.material || '—'}
                          {x.evento.proveedorCliente ? ` · ${x.evento.proveedorCliente}` : ''}
                          {x.aviso ? ` · no se movió: ${x.aviso}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {plan.pasados.length > 0 && (
                <p className="text-gray-500">{plan.pasados.length} despachos tienen fecha anterior a hoy y no se cargan.</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={cerrar}>
                  Cancelar
                </Button>
                <Button onClick={aplicar} disabled={trabajando || cuantosMarcados === 0}>
                  Aplicar ({cuantosMarcados})
                </Button>
              </div>
            </>
          )}

          {resultado && (
            <div className="border border-tinta p-3">
              <p className="font-semibold">
                Listo: {resultado.agendados} agendados · {resultado.movidos} movidos · {resultado.ordenados} ordenados ·{' '}
                {resultado.cancelados} cancelados.
              </p>
              {resultado.fallas.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-[#D13038]">
                  {resultado.fallas.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-end">
                <Button onClick={cerrar}>Cerrar</Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function Seccion({ titulo, items, clave, marcados, alternar, detalle, fecha = (x) => x.despacho.fecha, nombre }) {
  if (!items.length) return null;
  const nombreDe =
    nombre || ((x) => `${x.despacho.material}${x.despacho.oc ? ` · OC ${x.despacho.oc}` : ''}${x.despacho.proveedor ? ` · ${x.despacho.proveedor}` : ''}`);
  return (
    <div>
      <h4 className="mb-1 font-mono text-[11px] uppercase tracking-wide text-gray-500">{titulo}</h4>
      <ul className="max-h-64 divide-y divide-gray-200 overflow-y-auto border border-gray-300">
        {items.map((x) => (
          <li key={clave(x)}>
            <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-gray-50">
              <input type="checkbox" className="mt-1" checked={marcados.has(clave(x))} onChange={() => alternar(clave(x))} />
              <span>
                <span className="font-medium">{etiquetaFechaLarga(fecha(x))}</span> — {nombreDe(x)}
                <span className="block font-mono text-[11px] text-gray-500">{detalle(x)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
