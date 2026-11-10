import { Input } from './ui.jsx';

export function lineaVacia(descripcion = '') {
  return { descripcion, cantidad: '' };
}

// Filas «qué falta + cantidad» para anotar uno o varios pendientes de una vez.
export default function PendienteLineas({ lineas, onChange, autoFocus }) {
  function cambiar(i, campo, valor) {
    onChange(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }
  return (
    <div className="space-y-2">
      {lineas.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label="Qué falta"
            autoFocus={autoFocus && i === 0}
            maxLength={300}
            value={l.descripcion}
            onChange={(e) => cambiar(i, 'descripcion', e.target.value)}
            placeholder="Qué falta (ej: tinas de 1,40 m)"
          />
          <Input
            aria-label="Cantidad"
            maxLength={60}
            value={l.cantidad}
            onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
            placeholder="Cantidad"
            className="!w-28 shrink-0"
          />
          {lineas.length > 1 && (
            <button
              type="button"
              aria-label="Quitar línea"
              onClick={() => onChange(lineas.filter((_, j) => j !== i))}
              className="flex h-10 w-10 shrink-0 items-center justify-center text-gray-500 hover:text-[#A8232A]"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lineas, lineaVacia()])} className="text-sm font-medium text-tinta underline-offset-4 hover:underline">
        + Otra línea
      </button>
    </div>
  );
}
