import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, Select, Textarea } from './ui.jsx';
import Autoria from './Autoria.jsx';
import FotosGuia from './FotosGuia.jsx';
import { desdeISO, hoyISO, sumarDias } from '../lib/fechas.js';
import { ESTADOS, FORMAS_DESCARGA, RECURSOS_SUGERIDOS, TIPOS, horaFin, tipoInfo } from '../lib/useEventos.js';

const DURACIONES = [15, 30, 45, 60, 90, 120, 180];

const DIAS_SEMANA = [
  { n: 1, l: 'Lun' },
  { n: 2, l: 'Mar' },
  { n: 3, l: 'Mié' },
  { n: 4, l: 'Jue' },
  { n: 5, l: 'Vie' },
  { n: 6, l: 'Sáb' },
  { n: 0, l: 'Dom' },
];
const MAX_DIAS_SERIE = 92;

// Fechas de una serie desde `inicio` hasta `fin` (incluidas) en los días de semana elegidos.
function fechasSerie(inicio, fin, dias) {
  const fechas = [];
  for (let f = inicio; f <= fin && fechas.length < 200; f = sumarDias(f, 1)) {
    if (dias.has(desdeISO(f).getDay())) fechas.push(f);
  }
  return fechas;
}

function valoresIniciales(evento, fechaSugerida, horaSugerida, obraActivaId) {
  if (evento) {
    // Aceptar un choque es una decisión de cada guardado, nunca se hereda.
    return { ...evento, choqueAceptado: false };
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
    choqueAceptado: false,
  };
}

export default function EventoForm({ evento, fechaSugerida, horaSugerida, obraActivaId, esAdmin, onGuardar, onCancelar, onEliminar, onEliminarSerie, buscarConflictos }) {
  const [datos, setDatos] = useState(() => valoresIniciales(evento, fechaSugerida, horaSugerida, obraActivaId));

  // Repetición (solo al crear): 'no' | 'semanal' | 'diaria' (lunes a sábado).
  const [repetir, setRepetir] = useState('no');
  const [diasRepetir, setDiasRepetir] = useState(() => new Set([desdeISO(datos.fecha).getDay()]));
  const [hastaRepetir, setHastaRepetir] = useState(() => sumarDias(datos.fecha, 27));
  const fechas = useMemo(() => {
    if (evento || repetir === 'no') return [datos.fecha];
    const dias = repetir === 'diaria' ? new Set([1, 2, 3, 4, 5, 6]) : diasRepetir;
    const tope = sumarDias(datos.fecha, MAX_DIAS_SERIE);
    return fechasSerie(datos.fecha, hastaRepetir > tope ? tope : hastaRepetir, dias);
  }, [evento, repetir, diasRepetir, hastaRepetir, datos.fecha]);

  function alternarDia(n) {
    setDiasRepetir((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(n)) nuevo.delete(n);
      else nuevo.add(n);
      return nuevo;
    });
  }

  function pedirBorradoSerie() {
    const ok = window.confirm('¿Eliminar este camión y los siguientes de la serie? Los completados se conservan.');
    if (ok) onEliminarSerie(evento);
  }

  function pedirBorrado() {
    const ok = window.confirm('¿Eliminar esta programación? Esta acción no se puede deshacer.');
    if (ok) onEliminar(evento.id);
  }

  const [conflictos, setConflictos] = useState([]);
  useEffect(() => {
    let vigente = true;
    buscarConflictos(datos, evento?.id).then((c) => {
      if (vigente) setConflictos(c);
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.fecha, datos.horaInicio, datos.duracionMin, datos.obraId, evento?.id, buscarConflictos]);

  function set(campo, valor) {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }

  // Solo el admin agenda (o mueve) camiones a fechas pasadas; la base también lo impide.
  const hoy = hoyISO();
  const cambiaFecha = !evento || datos.fecha !== evento.fecha;
  const fechaPasada = !esAdmin && cambiaFecha && datos.fecha < hoy;

  const faltaAceptarChoque = conflictos.length > 0 && !datos.choqueAceptado && fechas.length === 1;
  const serieVacia = fechas.length === 0;

  function submit(e) {
    e.preventDefault();
    if (fechaPasada || faltaAceptarChoque || serieVacia) return;
    onGuardar(datos, fechas);
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
        <div className="rounded-lg border border-[#B07A1E] bg-[#F6EBD4] px-3 py-2 text-sm text-[#5C3D06]">
          ⚠️ Choca con el espacio de carga/descarga:{' '}
          {conflictos
            .map((c) => `${tipoInfo(c.tipo).label}${c.proveedorCliente ? ` (${c.proveedorCliente})` : ''} ${c.horaInicio}–${horaFin(c)}`)
            .join(', ')}
          .
          Solo hay un espacio disponible: reprogramá o marcá la casilla para agendarlo igual.
          <label className="mt-2 flex min-h-[40px] items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={!!datos.choqueAceptado}
              onChange={(e) => set('choqueAceptado', e.target.checked)}
              className="h-5 w-5 accent-[#D13038]"
            />
            Agendar igual, sé que choca (queda registrado)
          </label>
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

      {!evento && (
        <div className="border border-gray-300 p-3">
          <Field label="Repetir">
            <Select value={repetir} onChange={(e) => setRepetir(e.target.value)}>
              <option value="no">No se repite</option>
              <option value="semanal">Semanal, los días que elija</option>
              <option value="diaria">Diaria, de lunes a sábado</option>
            </Select>
          </Field>
          {repetir !== 'no' && (
            <div className="mt-3 space-y-3">
              {repetir === 'semanal' && (
                <div className="flex flex-wrap gap-1" role="group" aria-label="Días de la semana">
                  {DIAS_SEMANA.map((d) => (
                    <button
                      key={d.n}
                      type="button"
                      aria-pressed={diasRepetir.has(d.n)}
                      onClick={() => alternarDia(d.n)}
                      className={`min-h-[40px] min-w-[48px] border px-2 text-sm font-medium ${
                        diasRepetir.has(d.n) ? 'border-rvc bg-rvc text-white' : 'border-tinta text-tinta hover:bg-rvc/5'
                      }`}
                    >
                      {d.l}
                    </button>
                  ))}
                </div>
              )}
              <Field label="Hasta" hint={`Máximo ${MAX_DIAS_SERIE} días desde la primera fecha.`}>
                <Input type="date" value={hastaRepetir} min={datos.fecha} max={sumarDias(datos.fecha, MAX_DIAS_SERIE)} onChange={(e) => setHastaRepetir(e.target.value)} />
              </Field>
              <p className="text-sm text-gray-600">
                {serieVacia ? (
                  <span className="text-[#A8232A]">Elegí al menos un día que caiga dentro del rango.</span>
                ) : (
                  <>
                    Se agendarán <b>{fechas.length} camiones</b>
                    {fechas.length > 1 && `, del ${fechas[0].split('-').reverse().join('-')} al ${fechas.at(-1).split('-').reverse().join('-')}`}. Si alguna fecha choca
                    con otro camión, esa no se agenda y te aviso cuáles.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {fechaPasada && (
        <p className="border border-rvc bg-[#FBEBEC] px-3 py-2 text-sm text-[#A8232A]">
          No se puede agendar un camión en una fecha anterior a hoy. Solo un administrador puede hacerlo.
        </p>
      )}
      {!esAdmin && datos.estado === 'completado' && evento?.estado !== 'completado' && (
        <p className="border border-[#B07A1E] bg-[#F6EBD4] text-[#5C3D06] px-3 py-2 text-sm">
          Al guardarlo como <b>Completado</b> ya no podrás modificarlo ni eliminarlo; solo un administrador.
        </p>
      )}

      {evento && <FotosGuia evento={evento} puedeSubir puedeBorrar={esAdmin || evento.estado !== 'completado'} />}
      {evento && <Autoria evento={evento} />}

      <div className="flex items-center justify-between pt-2">
        <div>
          {evento && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="danger" onClick={pedirBorrado}>
                Eliminar
              </Button>
              {evento.serieId && onEliminarSerie && (
                <Button type="button" variant="danger" onClick={pedirBorradoSerie}>
                  Eliminar este y los siguientes
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={fechaPasada || faltaAceptarChoque || serieVacia}>
            {evento ? 'Guardar cambios' : fechas.length > 1 ? `Agendar ${fechas.length} camiones` : 'Agendar camión'}
          </Button>
        </div>
      </div>
    </form>
  );
}
