import { supabase } from './supabase.js';
import { esErrorDeRed, guardarLocal, leerLocal } from './local.js';

// Marcas de portería hechas sin señal. Cada una guarda la hora real en que se pulsó y se envía
// en orden cuando vuelve la conexión (la base acepta marcas de hasta 12 horas atrás).
const CLAVE = 'cola_porteria';

export function pendientes() {
  return leerLocal(CLAVE, []);
}

export function encolar(eventoId, paso) {
  const cola = pendientes();
  cola.push({ eventoId, paso, momento: new Date().toISOString() });
  guardarLocal(CLAVE, cola);
  return cola.length;
}

// Envía la cola en orden. Se detiene en el primer error de red (se reintenta luego);
// una marca que la base rechaza se descarta y se informa.
export async function enviarCola() {
  const cola = pendientes();
  const rechazadas = [];
  while (cola.length) {
    const m = cola[0];
    const { error } = await supabase.rpc('marcar_porteria', { p_evento: m.eventoId, p_paso: m.paso, p_momento: m.momento });
    if (error && esErrorDeRed(error)) break;
    if (error) rechazadas.push({ ...m, motivo: error.message });
    cola.shift();
    guardarLocal(CLAVE, cola);
  }
  return { quedan: cola.length, rechazadas };
}
