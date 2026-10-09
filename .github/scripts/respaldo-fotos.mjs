// Descarga todas las fotos de guías (bucket privado "guias") a ./fotos/<obra>/<camión>/<archivo>.
// Usa la llave secreta de Supabase, que solo existe como secreto de GitHub Actions.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const URL_BASE = process.env.SUPABASE_URL;
const LLAVE = process.env.SUPABASE_SECRET_KEY;
const cabeceras = { apikey: LLAVE, ...(LLAVE.startsWith('eyJ') ? { Authorization: `Bearer ${LLAVE}` } : {}) };

const r = await fetch(`${URL_BASE}/rest/v1/evento_fotos?select=ruta&order=subido_en`, { headers: cabeceras });
if (r.status === 401 || r.status === 403) {
  throw new Error(
    'La llave SUPABASE_SECRET_KEY no tiene permisos de servidor: hay que usar la "secret key" (sb_secret_...) o la "service_role", no la publishable/anon.',
  );
}
if (!r.ok) throw new Error(`No se pudo leer la lista de fotos: HTTP ${r.status} ${await r.text()}`);
const fotos = await r.json();

let ok = 0;
const fallidas = [];
for (const { ruta } of fotos) {
  if (ruta.includes('..')) continue;
  const resp = await fetch(`${URL_BASE}/storage/v1/object/guias/${ruta.split('/').map(encodeURIComponent).join('/')}`, { headers: cabeceras });
  if (!resp.ok) {
    fallidas.push(`${ruta} (HTTP ${resp.status})`);
    continue;
  }
  const destino = join('fotos', ruta);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, Buffer.from(await resp.arrayBuffer()));
  ok++;
}
console.log(`Fotos respaldadas: ${ok} de ${fotos.length}`);
if (fallidas.length) console.log(`::warning::No se pudieron descargar ${fallidas.length}: ${fallidas.slice(0, 5).join(', ')}`);
