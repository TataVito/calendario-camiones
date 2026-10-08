import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { Button } from './ui.jsx';

const LADO_MAX = 1600;

// Reduce la foto antes de subirla (las del celular pesan 3-8 MB; quedan en ~300 KB).
async function comprimir(archivo) {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.8));
}

// Fotos de la guía de un camión. Las guarda en el bucket privado 'guias' y las muestra
// con enlaces firmados de 1 hora (nadie sin sesión ni sin acceso a la obra las ve).
export default function FotosGuia({ evento, puedeSubir, puedeBorrar }) {
  const [fotos, setFotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [estado, setEstado] = useState('');
  const [ampliada, setAmpliada] = useState(null);
  const entrada = useRef(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('evento_fotos')
      .select('id, ruta, subido_en, subido_por_usuario')
      .eq('evento_id', evento.id)
      .order('subido_en');
    const lista = data || [];
    setFotos(lista);
    if (lista.length) {
      const { data: firmadas } = await supabase.storage.from('guias').createSignedUrls(
        lista.map((f) => f.ruta),
        3600,
      );
      setUrls(Object.fromEntries((firmadas || []).map((f) => [f.path, f.signedUrl])));
    }
  }, [evento.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function subir(e) {
    const archivos = [...e.target.files];
    e.target.value = '';
    for (const archivo of archivos) {
      setEstado('Subiendo foto…');
      try {
        const blob = await comprimir(archivo);
        const ruta = `${evento.obraId}/${evento.id}/${crypto.randomUUID()}.jpg`;
        const { error: e1 } = await supabase.storage.from('guias').upload(ruta, blob, { contentType: 'image/jpeg' });
        if (e1) throw e1;
        const { error: e2 } = await supabase.from('evento_fotos').insert({ evento_id: evento.id, obra_id: evento.obraId, ruta });
        if (e2) {
          await supabase.storage.from('guias').remove([ruta]);
          throw e2;
        }
      } catch (err) {
        setEstado(`No se pudo subir la foto: ${err.message}`);
        return;
      }
    }
    setEstado('');
    await cargar();
  }

  async function borrar(foto) {
    // Primero el registro (ahí la base aplica la regla de camiones completados), luego el archivo.
    const { data, error } = await supabase.from('evento_fotos').delete().eq('id', foto.id).select('id');
    if (error || !data?.length) return setEstado('No se pudo eliminar la foto (¿el camión está completado?).');
    await supabase.storage.from('guias').remove([foto.ruta]);
    setAmpliada(null);
    await cargar();
  }

  if (!fotos.length && !puedeSubir) return null;

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">Fotos de la guía {fotos.length > 0 && `(${fotos.length})`}</span>
        {puedeSubir && (
          <>
            <input ref={entrada} type="file" accept="image/*" capture="environment" multiple hidden onChange={subir} />
            <Button type="button" variant="secondary" onClick={() => entrada.current.click()}>
              📷 Agregar foto
            </Button>
          </>
        )}
      </div>
      {estado && <p className="mb-2 text-sm text-gray-600">{estado}</p>}
      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fotos.map((f) => (
            <button key={f.id} type="button" onClick={() => setAmpliada(f)} className="overflow-hidden rounded border border-gray-200">
              {urls[f.ruta] ? (
                <img src={urls[f.ruta]} alt="Guía" className="h-20 w-20 object-cover" />
              ) : (
                <div className="h-20 w-20 bg-gray-100" />
              )}
            </button>
          ))}
        </div>
      )}
      {ampliada && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/80 p-4" onClick={() => setAmpliada(null)}>
          <img src={urls[ampliada.ruta]} alt="Guía" className="max-h-[80vh] max-w-full rounded" />
          <div className="flex items-center gap-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
            <span>
              Subida por {ampliada.subido_por_usuario || '—'} el {new Date(ampliada.subido_en).toLocaleString('es-CL', { hour12: false })}
            </span>
            <a href={urls[ampliada.ruta]} target="_blank" rel="noreferrer" className="underline">
              Abrir original
            </a>
            {puedeBorrar && (
              <Button type="button" variant="danger" onClick={() => borrar(ampliada)}>
                Eliminar
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setAmpliada(null)}>
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
