// Pruebas de la lógica que no depende de la nube: importador, materiales, comentarios y tiempos.
// Se corren con: npm test
import { describe, expect, it } from 'vitest';
import { compararConAgendados, observacionesDe, refDe, normalizar } from '../src/lib/importarCalendario.js';
import { colorBase, leerObservaciones, estiloMaterial } from '../src/lib/materiales.js';
import { cuandoCorto } from '../src/lib/comentarios.js';
import { atrasoMin, duracionTexto, esPuntual, promedio, tiempoDescargaMin, atrasoTexto } from '../src/lib/tiempos.js';
import { sumarMinutos, toMinutos, horaFin, ESTADOS_CERRADOS } from '../src/lib/useEventos.js';
import { sumarDias } from '../src/lib/fechas.js';

const HOY = '2026-11-09';

function camion(datos) {
  return {
    id: datos.id || Math.random().toString(36).slice(2),
    obraId: 'obra',
    tipo: 'recepcion',
    fecha: HOY,
    horaInicio: '09:00',
    duracionMin: 60,
    guiaOC: '',
    proveedorCliente: '',
    material: '',
    estado: 'programado',
    observaciones: '',
    refCalendario: '',
    ...datos,
  };
}

function despacho(datos) {
  return { ref: 'd1', fecha: HOY, material: 'Cerámica', oc: '', proveedor: '', materiales: [], nota: '', ...datos };
}

describe('horas', () => {
  it('suma minutos y da la vuelta a medianoche', () => {
    expect(toMinutos('09:30')).toBe(570);
    expect(sumarMinutos('09:30', 45)).toBe('10:15');
    expect(sumarMinutos('23:30', 60)).toBe('00:30');
    expect(horaFin({ horaInicio: '08:00', duracionMin: 90 })).toBe('09:30');
  });

  it('suma días cruzando meses', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('incompleto y no recibido cierran el camión', () => {
    expect(ESTADOS_CERRADOS).toEqual(expect.arrayContaining(['completado', 'incompleto', 'no_recibido', 'cancelado']));
  });
});

describe('importador: referencia del calendario', () => {
  it('usa la columna ref_calendario', () => {
    expect(refDe(camion({ refCalendario: 'abc' }))).toBe('abc');
  });

  it('sigue leyendo la referencia antigua en observaciones', () => {
    expect(refDe(camion({ observaciones: 'Materiales:\nRef. calendario: viejo-1\notra' }))).toBe('viejo-1');
  });

  it('las observaciones nuevas ya no llevan la referencia', () => {
    const obs = observacionesDe(despacho({ ref: 'x9', materiales: [{ descripcion: 'Cerámica 60x60', cantidad: '120', um: 'M2' }] }), HOY);
    expect(obs).not.toContain('Ref. calendario');
    expect(obs).toContain('• Cerámica 60x60 — 120 M2');
    expect(obs).toContain('Importado del calendario de despachos (09-11-2026).');
  });
});

describe('importador: comparar con lo agendado', () => {
  it('reconoce por referencia y no duplica', () => {
    const ev = camion({ refCalendario: 'd1' });
    const plan = compararConAgendados([despacho()], [ev], HOY);
    expect(plan.nuevos).toHaveLength(0);
    expect(plan.iguales).toHaveLength(1);
  });

  it('mueve el camión si el despacho cambió de fecha', () => {
    const ev = camion({ refCalendario: 'd1' });
    const plan = compararConAgendados([despacho({ fecha: '2026-11-12' })], [ev], HOY);
    expect(plan.movidos).toHaveLength(1);
    expect(plan.movidos[0].horaInicio).toBe('09:00');
  });

  it('no mueve un camión cerrado', () => {
    const ev = camion({ refCalendario: 'd1', estado: 'incompleto' });
    const plan = compararConAgendados([despacho({ fecha: '2026-11-12' })], [ev], HOY);
    expect(plan.movidos).toHaveLength(0);
    expect(plan.iguales[0].aviso).toBe('ya está en curso o cerrado');
  });

  it('agenda nuevos en el primer horario libre', () => {
    const ocupado = camion({ horaInicio: '09:00', duracionMin: 60 });
    const plan = compararConAgendados([despacho({ ref: 'nuevo' })], [ocupado], HOY);
    expect(plan.nuevos).toHaveLength(1);
    expect(plan.nuevos[0].horaInicio).toBe('10:00');
    expect(plan.nuevos[0].choque).toBe(false);
  });

  it('no carga despachos de fechas pasadas', () => {
    const plan = compararConAgendados([despacho({ fecha: '2026-11-01' })], [], HOY);
    expect(plan.pasados).toHaveLength(1);
    expect(plan.nuevos).toHaveLength(0);
  });

  it('ofrece cancelar los importados que ya no están en el archivo', () => {
    const sobra = camion({ refCalendario: 'ya-no-esta', fecha: '2026-11-10' });
    const manual = camion({ fecha: '2026-11-10', horaInicio: '15:00' });
    const plan = compararConAgendados([despacho()], [sobra, manual], HOY);
    expect(plan.sobran.map((s) => s.evento.id)).toEqual([sobra.id]);
  });

  it('reescribe un camión de la planilla antigua que coincide por OC', () => {
    const viejo = camion({ guiaOC: 'OC 4500123', observaciones: 'Importado de la planilla Control Despachos (19-10-2026).' });
    const plan = compararConAgendados([despacho({ oc: '4500123' })], [viejo], HOY);
    expect(plan.actualizar).toHaveLength(1);
  });
});

describe('observaciones y comentarios', () => {
  it('separa materiales, notas y comentarios antiguos', () => {
    const obs = [
      'Materiales:',
      '• Porcelanato — 40 M2',
      'Nota del día: llamar antes',
      'Importado del calendario de despachos (04-11-2026).',
      'Ref. calendario: r1',
      '💬 ecastro · 06-11 10:15 — faltaron 5 cajas',
    ].join('\n');
    const { items, notas, comentarios } = leerObservaciones(obs);
    expect(items).toEqual([{ descripcion: 'Porcelanato', cantidad: '40 M2' }]);
    expect(notas).toEqual(['llamar antes']);
    expect(comentarios).toEqual([{ autor: 'ecastro', cuando: '06-11 10:15', texto: 'faltaron 5 cajas' }]);
  });

  it('formatea la hora del comentario en hora de Chile', () => {
    // 13:15 UTC = 10:15 en Chile (horario de verano, UTC-3).
    expect(cuandoCorto('2026-11-06T13:15:00Z')).toBe('06-11 10:15');
  });
});

describe('colores por material', () => {
  it('usa la palabra clave más específica', () => {
    expect(colorBase('Cerámica Blanca')).toBe('#B08A1E');
    expect(colorBase('Cerámica de piso')).toBe('#B5651D');
    expect(colorBase('WC One Piece')).toBe('#4A6FA5');
  });

  it('da siempre el mismo color a un material desconocido', () => {
    expect(colorBase('Material raro')).toBe(colorBase('material  RARO'));
    expect(colorBase('')).toBeNull();
    expect(estiloMaterial('')).toBeUndefined();
  });

  it('normaliza tildes y signos', () => {
    expect(normalizar('  Yeso-Cartón ')).toBe('yeso carton');
  });
});

describe('tiempos de portería', () => {
  it('calcula atraso y puntualidad en hora de Chile', () => {
    const ev = { fecha: '2026-11-06', horaInicio: '09:00', llegadaReal: '2026-11-06T12:20:00Z' }; // 09:20 Chile
    expect(atrasoMin(ev)).toBe(20);
    expect(esPuntual(ev)).toBe(false);
    expect(esPuntual({ ...ev, llegadaReal: '2026-11-06T12:10:00Z' })).toBe(true);
    expect(atrasoMin({ ...ev, llegadaReal: null })).toBeNull();
  });

  it('formatea duraciones y promedios', () => {
    expect(duracionTexto(45)).toBe('45 min');
    expect(duracionTexto(135)).toBe('2 h 15 min');
    expect(duracionTexto(null)).toBe('—');
    expect(atrasoTexto(-10)).toBe('10 min antes');
    expect(promedio([10, null, 20])).toBe(15);
    expect(promedio([])).toBeNull();
    expect(tiempoDescargaMin({ inicioProcesoReal: '2026-11-06T12:00:00Z', salidaReal: '2026-11-06T12:40:00Z' })).toBe(40);
  });
});
