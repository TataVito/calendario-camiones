// Cálculos con las horas reales registradas en portería. Todo en hora de Chile.

const TOLERANCIA_MIN = 15;

// Fecha y minuto del día, en Chile, de un timestamp.
function enChile(iso) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function horaChile(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false });
}

// Minutos de atraso de la llegada real respecto de la hora programada (negativo = antes).
export function atrasoMin(ev) {
  if (!ev.llegadaReal) return null;
  const real = enChile(ev.llegadaReal);
  const [h, m] = ev.horaInicio.split(':').map(Number);
  return diasEntre(ev.fecha, real.fecha) * 1440 + real.minutos - (h * 60 + m);
}

export function esPuntual(ev) {
  const a = atrasoMin(ev);
  return a === null ? null : a <= TOLERANCIA_MIN;
}

function minutosEntre(desde, hasta) {
  if (!desde || !hasta) return null;
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 60000);
}

// Tiempo total en obra (llegada → salida) y de carga/descarga (inicio → salida).
export const tiempoEnObraMin = (ev) => minutosEntre(ev.llegadaReal, ev.salidaReal);
export const tiempoDescargaMin = (ev) => minutosEntre(ev.inicioProcesoReal, ev.salidaReal);

export function duracionTexto(min) {
  if (min === null || min === undefined || Number.isNaN(min)) return '—';
  const abs = Math.abs(Math.round(min));
  const texto = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, '0')} min`;
  return min < 0 ? `-${texto}` : texto;
}

export function atrasoTexto(min) {
  if (min === null) return '';
  if (min <= 0) return min === 0 ? 'a la hora' : `${duracionTexto(-min)} antes`;
  return `${duracionTexto(min)} tarde`;
}

export function promedio(valores) {
  const v = valores.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export { TOLERANCIA_MIN };
