// Importa el "Calendario de despachos" en HTML (el que se exporta desde la planilla de
// despachos de la obra) y lo compara con los camiones ya agendados en la obra.
//
// Formato que se lee:
//   .day[data-date="AAAA-MM-DD"]  -> un día del calendario
//     a.entry-btn[href="#id"]     -> un despacho de ese día (vale el día donde está la celda,
//                                    aunque se haya arrastrado desde otra fecha)
//     .baked-note-text            -> nota del día (opcional)
//   .modal-overlay#id             -> detalle: h2 (familia), .oc b, .prov b y la tabla de materiales
//
// Cada camión importado lleva en observaciones la línea "Ref. calendario: <id>". Así, al subir
// una versión nueva del archivo, el mismo despacho se reconoce y solo se mueve si cambió de fecha.

import { sumarMinutos, toMinutos } from './useEventos.js';

export const MARCA_REF = 'Ref. calendario: ';
// Comentarios que la obra agrega desde la ficha: se conservan al volver a importar.
export const MARCA_COMENTARIO = '💬 ';
const MARCA_PLANILLA = 'Importado de la planilla Control Despachos';
const MARCA_CALENDARIO = 'Importado del calendario de despachos';

const texto = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const sinRegistrar = (v) => (/^sin registrar$/i.test(v) ? '' : v);

// Minúsculas, sin tildes ni signos: para comparar nombres de materiales.
export function normalizar(v) {
  return (v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function leerMateriales(modal) {
  const tabla = modal.querySelector('table');
  if (!tabla) return [];
  const cabecera = [...tabla.querySelectorAll('thead th')].map(texto);
  const iUM = cabecera.findIndex((c) => /^um$/i.test(c));
  // Si no hay columna UM, la unidad viene en el título de la cantidad ("M2 de alfombra").
  const umFija = iUM < 0 && cabecera.length > 1 ? (cabecera[cabecera.length - 1].match(/^(\S+)\s+de\b/i)?.[1] || '') : '';
  return [...tabla.querySelectorAll('tbody tr')]
    .filter((tr) => !tr.classList.contains('total-row'))
    .map((tr) => {
      const celdas = [...tr.querySelectorAll('td')].map(texto);
      return {
        descripcion: celdas[0] || '',
        um: iUM >= 0 ? celdas[iUM] || '' : umFija,
        cantidad: celdas.length > 1 ? celdas[celdas.length - 1] : '',
      };
    })
    .filter((m) => m.descripcion);
}

// Devuelve [{ ref, fecha, material, oc, proveedor, materiales, nota }] ordenados por fecha.
export function leerCalendarioHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const dias = doc.querySelectorAll('.day[data-date]');
  if (!dias.length) throw new Error('El archivo no parece un calendario de despachos: no tiene días con fecha.');

  const despachos = [];
  const vistos = new Set();
  for (const dia of dias) {
    const fecha = dia.dataset.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const nota = texto(dia.querySelector('.baked-note-text'));
    for (const a of dia.querySelectorAll('a.entry-btn[href^="#"]')) {
      const ref = a.getAttribute('href').slice(1);
      if (!ref || vistos.has(ref)) continue;
      vistos.add(ref);
      const modal = doc.getElementById(ref);
      // El texto del botón viene con mayúsculas y tildes ("Yeso Cartón"); el título del detalle a veces no.
      const titulo = texto(a).replace(/^✎\s*/, '') || texto(modal?.querySelector('h2'));
      despachos.push({
        ref,
        fecha,
        material: titulo,
        oc: sinRegistrar(texto(modal?.querySelector('.oc b'))),
        proveedor: sinRegistrar(texto(modal?.querySelector('.prov b'))),
        materiales: modal ? leerMateriales(modal) : [],
        nota,
      });
    }
  }
  if (!despachos.length) throw new Error('El archivo no tiene despachos agendados.');
  return despachos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function observacionesDe(d, fechaImportacion, previas = '') {
  const lineas = [];
  if (d.materiales.length) {
    lineas.push('Materiales:');
    for (const m of d.materiales) lineas.push(`• ${m.descripcion}${m.cantidad ? ` — ${m.cantidad}${m.um ? ` ${m.um}` : ''}` : ''}`);
  }
  if (d.nota) lineas.push(`Nota del día: ${d.nota}`);
  const [a, m, dd] = fechaImportacion.split('-');
  lineas.push(`${MARCA_CALENDARIO} (${dd}-${m}-${a}).`);
  lineas.push(`${MARCA_REF}${d.ref}`);
  for (const l of (previas || '').split('\n')) if (l.startsWith(MARCA_COMENTARIO)) lineas.push(l);
  return lineas.join('\n');
}

export function refDe(ev) {
  const i = (ev.observaciones || '').indexOf(MARCA_REF);
  return i < 0 ? '' : ev.observaciones.slice(i + MARCA_REF.length).split('\n')[0].trim();
}

const esImportado = (ev) =>
  refDe(ev) !== '' || (ev.observaciones || '').includes(MARCA_PLANILLA) || (ev.observaciones || '').includes(MARCA_CALENDARIO);

// Palabra clave de la familia: "Hornos y Encimeras" -> "horno", "Cerámica Blanca" -> "ceramica".
function claveFamilia(material) {
  const palabra = normalizar(material).split(' ')[0] || '';
  return palabra.length > 4 ? palabra.replace(/(es|s)$/, '') : palabra;
}

// ¿Es el mismo despacho que un camión que ya estaba (cargado antes sin referencia)?
function pareceElMismo(d, ev) {
  if (ev.fecha !== d.fecha) return false;
  if (d.oc && (ev.guiaOC || '').includes(d.oc)) return true;
  const clave = claveFamilia(d.material);
  if (clave.length < 3) return false;
  // Solo el nombre del material: en las descripciones aparecen cruces ("MONOMANDO LAVAPLATOS" no es un lavaplatos).
  return normalizar(ev.material).split(' ').some((p) => p.startsWith(clave));
}

// Primer horario libre del día (de 09:00 a 18:00, 1 h). Si no hay, 09:00 marcado como choque aceptado.
function buscarHora(ocupados, duracion) {
  for (let inicio = toMinutos('09:00'); inicio + duracion <= toMinutos('18:00'); inicio += 30) {
    const fin = inicio + duracion;
    if (!ocupados.some((o) => inicio < o.fin && o.inicio < fin)) return { horaInicio: sumarMinutos('00:00', inicio), choque: false };
  }
  return { horaInicio: '09:00', choque: true };
}

const NO_TOCAR = new Set(['en_porteria', 'en_proceso', 'completado', 'incompleto', 'no_recibido', 'cancelado']);

// Compara el archivo con los camiones de la obra (de hoy en adelante) y arma el plan:
//   nuevos:   despachos que no están -> se agendan
//   movidos:  ya importados que cambiaron de fecha en el archivo -> se mueven
//   actualizar: cargados antes sin referencia (planilla) -> se reescriben con nombre, OC y cantidades
//   iguales:  ya están en esa fecha -> no se tocan
//   pasados:  despachos con fecha anterior a hoy -> no se cargan
//   sobran:   camiones importados antes que ya no están en el archivo -> se pueden cancelar
export function compararConAgendados(despachos, eventos, hoy) {
  const activos = eventos.filter((ev) => ev.estado !== 'cancelado');
  const usados = new Set();
  const plan = { nuevos: [], movidos: [], actualizar: [], iguales: [], pasados: [], sobran: [] };
  const reescritos = new Set();

  const porRef = new Map();
  for (const ev of activos) {
    const r = refDe(ev);
    if (r) porRef.set(r, ev);
  }

  // Horarios ocupados por día (se van sumando los que se agendan en este plan).
  const ocupados = new Map();
  const ocupar = (fecha, horaInicio, duracionMin, id) => {
    if (!ocupados.has(fecha)) ocupados.set(fecha, []);
    ocupados.get(fecha).push({ id, inicio: toMinutos(horaInicio), fin: toMinutos(horaInicio) + duracionMin });
  };
  for (const ev of activos) ocupar(ev.fecha, ev.horaInicio, ev.duracionMin, ev.id);
  const liberar = (ev) => {
    const lista = ocupados.get(ev.fecha) || [];
    const i = lista.findIndex((o) => o.id === ev.id);
    if (i >= 0) lista.splice(i, 1);
  };

  for (const d of despachos) {
    const previo = porRef.get(d.ref);
    if (previo) {
      usados.add(previo.id);
      if (previo.fecha === d.fecha) plan.iguales.push({ despacho: d, evento: previo });
      else if (d.fecha < hoy || NO_TOCAR.has(previo.estado)) plan.iguales.push({ despacho: d, evento: previo, aviso: d.fecha < hoy ? 'nueva fecha ya pasó' : 'ya está en curso o cerrado' });
      else plan.movidos.push({ despacho: d, evento: previo });
      continue;
    }
    if (d.fecha < hoy) {
      plan.pasados.push({ despacho: d });
      continue;
    }
    // Un camión cargado antes sin referencia puede traer varias familias del mismo proveedor
    // (ej. cerámica + porcelanato de ATIKA): por eso puede coincidir con más de un despacho.
    // Ese camión se reescribe con el formato del calendario (nombre del material, su OC y
    // cantidades); si juntaba varias OC, las demás quedan como camiones aparte.
    const mismo = activos.find((ev) => !refDe(ev) && pareceElMismo(d, ev));
    if (mismo) {
      usados.add(mismo.id);
      if (NO_TOCAR.has(mismo.estado)) plan.iguales.push({ despacho: d, evento: mismo, aviso: 'ya está en curso o cerrado' });
      else if (!reescritos.has(mismo.id)) {
        reescritos.add(mismo.id);
        plan.actualizar.push({ despacho: d, evento: mismo });
      } else plan.nuevos.push({ despacho: d, separadoDe: mismo });
      continue;
    }
    plan.nuevos.push({ despacho: d });
  }

  // Horarios: primero se liberan los que se mueven, después se asignan nuevos y movidos.
  for (const m of plan.movidos) liberar(m.evento);
  for (const item of [...plan.nuevos, ...plan.movidos]) {
    const fecha = item.despacho.fecha;
    const duracion = item.evento?.duracionMin || 60;
    const { horaInicio, choque } = buscarHora(ocupados.get(fecha) || [], duracion);
    item.horaInicio = horaInicio;
    item.choque = choque;
    ocupar(fecha, horaInicio, duracion);
  }

  plan.sobran = activos
    .filter((ev) => !usados.has(ev.id) && ev.fecha >= hoy && esImportado(ev) && !NO_TOCAR.has(ev.estado))
    .map((evento) => ({ evento }));

  return plan;
}
