// Pruebas de permisos contra la base real (Supabase). Crea sus propios camiones en la obra de
// prueba y los borra al final.
//
// Requisitos (una vez):
//   1. Una obra de prueba, por ejemplo "ZZ prueba".
//   2. Cuatro usuarios asignados SOLO a esa obra: prueba.lector (lector), prueba.porteria
//      (portería), prueba.editor (editor) y prueba.admin (admin de obra).
//   3. Copiar .env.pruebas.example a .env.pruebas y completar (ese archivo no se sube a git).
//
// Correr: npm run test:permisos
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const faltan = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'PRUEBA_OBRA_ID'].filter((k) => !env[k]);
if (faltan.length) {
  console.error(`Faltan variables en .env.pruebas: ${faltan.join(', ')}`);
  process.exit(2);
}

const DOMINIO = 'calendario-rvc.invalid';
const OBRA = env.PRUEBA_OBRA_ID;
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const fechaMas = (dias) => {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

async function entrar(usuario) {
  const cliente = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await cliente.auth.signInWithPassword({ email: `${usuario}@${DOMINIO}`, password: env[`PRUEBA_CLAVE_${usuario.split('.')[1].toUpperCase()}`] || env.PRUEBA_CLAVE });
  if (error) throw new Error(`No se pudo entrar como ${usuario}: ${error.message}`);
  return cliente;
}

let ok = 0;
let mal = 0;
async function prueba(nombre, fn) {
  try {
    await fn();
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    mal++;
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
  }
}
function esperar(cond, msj) {
  if (!cond) throw new Error(msj);
}
// Supabase no da error si RLS filtra un UPDATE/DELETE: cambia 0 filas.
const filas = (r) => (r.data || []).length;

const camion = (extra = {}) => ({
  obra_id: OBRA,
  tipo: 'recepcion',
  fecha: fechaMas(1),
  hora_inicio: '06:00',
  duracion_min: 15,
  material: 'ZZ prueba automática',
  choque_aceptado: true,
  ...extra,
});

const creados = [];

const lector = await entrar('prueba.lector');
const porteria = await entrar('prueba.porteria');
const editor = await entrar('prueba.editor');
const admin = await entrar('prueba.admin');

console.log('Lector');
await prueba('ve los camiones de su obra', async () => {
  const r = await lector.from('eventos').select('id').eq('obra_id', OBRA).limit(1);
  esperar(!r.error, r.error?.message);
});
await prueba('no puede agendar', async () => {
  const r = await lector.from('eventos').insert(camion()).select();
  esperar(r.error, 'pudo agendar');
});

console.log('Editor');
let evId;
await prueba('agenda en su obra', async () => {
  const r = await editor.from('eventos').insert(camion()).select().single();
  esperar(!r.error, r.error?.message);
  evId = r.data.id;
  creados.push(evId);
  esperar(r.data.creado_por_usuario === 'prueba.editor', `autor: ${r.data.creado_por_usuario}`);
});
await prueba('no agenda en fecha pasada', async () => {
  const r = await editor.from('eventos').insert(camion({ fecha: fechaMas(-1) })).select();
  esperar(r.error, 'agendó en el pasado');
});
await prueba('no puede escribir ultimo_comentario a mano', async () => {
  await editor.from('eventos').update({ ultimo_comentario: 'falso' }).eq('id', evId);
  const r = await editor.from('eventos').select('ultimo_comentario').eq('id', evId).single();
  esperar(r.data.ultimo_comentario === '', `quedó "${r.data.ultimo_comentario}"`);
});
if (env.PRUEBA_OBRA_AJENA_ID) {
  await prueba('no agenda en una obra que no tiene asignada', async () => {
    const r = await editor.from('eventos').insert(camion({ obra_id: env.PRUEBA_OBRA_AJENA_ID })).select();
    esperar(r.error, 'agendó en obra ajena');
  });
}

console.log('Comentarios');
await prueba('editor comenta; autor y hora los pone la base', async () => {
  const r = await editor
    .from('evento_comentarios')
    .insert({ evento_id: evId, obra_id: OBRA, texto: '  prueba   de comentario ', autor_usuario: 'otro', creado_en: '2000-01-01T00:00:00Z' })
    .select()
    .single();
  esperar(!r.error, r.error?.message);
  esperar(r.data.autor_usuario === 'prueba.editor', `autor: ${r.data.autor_usuario}`);
  esperar(r.data.creado_en > '2026', `hora: ${r.data.creado_en}`);
  esperar(r.data.texto === 'prueba de comentario', `texto: "${r.data.texto}"`);
});
await prueba('el camión muestra el último comentario', async () => {
  const r = await editor.from('eventos').select('ultimo_comentario').eq('id', evId).single();
  esperar(r.data.ultimo_comentario === 'prueba de comentario', `quedó "${r.data.ultimo_comentario}"`);
});
await prueba('lector ve el comentario pero no puede comentar', async () => {
  const v = await lector.from('evento_comentarios').select('id').eq('evento_id', evId);
  esperar(filas(v) === 1, `ve ${filas(v)}`);
  const r = await lector.from('evento_comentarios').insert({ evento_id: evId, obra_id: OBRA, texto: 'x' }).select();
  esperar(r.error, 'lector comentó');
});
await prueba('portería no puede comentar', async () => {
  const r = await porteria.from('evento_comentarios').insert({ evento_id: evId, obra_id: OBRA, texto: 'x' }).select();
  esperar(r.error, 'portería comentó');
});
await prueba('nadie modifica un comentario; el editor no lo borra', async () => {
  const u = await editor.from('evento_comentarios').update({ texto: 'cambiado' }).eq('evento_id', evId).select();
  esperar(filas(u) === 0, 'editor lo modificó');
  const d = await editor.from('evento_comentarios').delete().eq('evento_id', evId).select();
  esperar(filas(d) === 0, 'editor lo borró');
});
await prueba('el comentario queda en el historial', async () => {
  const r = await admin.from('auditoria').select('accion, tabla').eq('tabla', 'evento_comentarios').eq('obra_id', OBRA).limit(5);
  esperar(!r.error, r.error?.message);
  esperar(filas(r) > 0, 'no hay entradas de comentarios');
});

console.log('Portería');
await prueba('no puede modificar camiones directamente', async () => {
  const r = await porteria.from('eventos').update({ material: 'cambiado' }).eq('id', evId).select();
  esperar(filas(r) === 0, 'portería modificó el camión');
});
await prueba('no lee el historial', async () => {
  const r = await porteria.from('auditoria').select('id').limit(1);
  esperar(filas(r) === 0, 'portería ve el historial');
});

console.log('Camión cerrado');
let hoyId;
await prueba('portería registra llegada, inicio y término', async () => {
  const c = await editor.from('eventos').insert(camion({ fecha: hoy, hora_inicio: '23:40' })).select().single();
  esperar(!c.error, c.error?.message);
  hoyId = c.data.id;
  creados.push(hoyId);
  for (const paso of ['llego', 'inicio', 'termino']) {
    const r = await porteria.rpc('marcar_porteria', { p_evento: hoyId, p_paso: paso });
    esperar(!r.error, `${paso}: ${r.error?.message}`);
  }
  const r = await porteria.from('eventos').select('estado, salida_real').eq('id', hoyId).single();
  esperar(r.data.estado === 'completado' && r.data.salida_real, `estado ${r.data.estado}`);
});
await prueba('editor no modifica ni borra un completado', async () => {
  const u = await editor.from('eventos').update({ material: 'cambiado' }).eq('id', hoyId).select();
  esperar(u.error || filas(u) === 0, 'editor modificó un completado');
  const d = await editor.from('eventos').delete().eq('id', hoyId).select();
  esperar(d.error || filas(d) === 0, 'editor borró un completado');
});
await prueba('editor sí puede comentar un completado', async () => {
  const r = await editor.from('evento_comentarios').insert({ evento_id: hoyId, obra_id: OBRA, texto: 'llegó todo' }).select();
  esperar(!r.error, r.error?.message);
});
await prueba('incompleto y no recibido no bloquean', async () => {
  const c = await editor.from('eventos').insert(camion({ hora_inicio: '06:30' })).select().single();
  esperar(!c.error, c.error?.message);
  creados.push(c.data.id);
  for (const estado of ['incompleto', 'no_recibido', 'programado']) {
    const r = await editor.from('eventos').update({ estado }).eq('id', c.data.id).select();
    esperar(!r.error && filas(r) === 1, `${estado}: ${r.error?.message || '0 filas'}`);
  }
});

console.log('Admin de obra');
await prueba('borra un comentario de su obra', async () => {
  const d = await admin.from('evento_comentarios').delete().eq('evento_id', evId).select();
  esperar(filas(d) === 1, `borró ${filas(d)}`);
  const r = await admin.from('eventos').select('ultimo_comentario').eq('id', evId).single();
  esperar(r.data.ultimo_comentario === '', `último quedó "${r.data.ultimo_comentario}"`);
});
await prueba('limpia: borra los camiones de prueba (también el completado)', async () => {
  const d = await admin.from('eventos').delete().in('id', creados).select();
  esperar(!d.error && filas(d) === creados.length, d.error?.message || `borró ${filas(d)} de ${creados.length}`);
});

console.log(`\n${ok} pasaron, ${mal} fallaron.`);
process.exit(mal ? 1 : 0);
