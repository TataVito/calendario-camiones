const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function hoyISO() {
  return toISO(new Date());
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function desdeISO(iso) {
  return new Date(iso + 'T00:00:00');
}

export function sumarDias(iso, dias) {
  const d = desdeISO(iso);
  d.setDate(d.getDate() + dias);
  return toISO(d);
}

export function inicioSemana(iso) {
  const d = desdeISO(iso);
  const diaSemana = d.getDay();
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + offset);
  return toISO(d);
}

export function diasDeSemana(isoInicio) {
  return Array.from({ length: 7 }, (_, i) => sumarDias(isoInicio, i));
}

export function etiquetaDia(iso) {
  const d = desdeISO(iso);
  const diaSemana = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return `${DIAS[diaSemana]} ${d.getDate()}`;
}

export function etiquetaRango(isoInicio, isoFin) {
  const a = desdeISO(isoInicio);
  const b = desdeISO(isoFin);
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()} – ${b.getDate()} de ${MESES[a.getMonth()]} ${a.getFullYear()}`;
  }
  return `${a.getDate()} de ${MESES[a.getMonth()]} – ${b.getDate()} de ${MESES[b.getMonth()]} ${b.getFullYear()}`;
}

export function etiquetaFechaLarga(iso) {
  const d = desdeISO(iso);
  const diaSemana = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const nombreDia = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][diaSemana];
  return `${nombreDia} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function esHoy(iso) {
  return iso === hoyISO();
}

export function primerDiaMes(iso) {
  const d = desdeISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function sumarMeses(iso, n) {
  const d = desdeISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export function mismoMes(iso, referenciaIso) {
  const d = desdeISO(iso);
  const r = desdeISO(referenciaIso);
  return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth();
}

export function etiquetaMes(iso) {
  const d = desdeISO(iso);
  const nombre = MESES[d.getMonth()];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d.getFullYear()}`;
}

export function cuadriculaMes(iso) {
  const inicio = inicioSemana(primerDiaMes(iso));
  const d = desdeISO(iso);
  const ultimoDiaISO = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const fin = sumarDias(inicioSemana(ultimoDiaISO), 6);
  const dias = [];
  let cursor = inicio;
  while (cursor <= fin) {
    dias.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return semanas;
}
