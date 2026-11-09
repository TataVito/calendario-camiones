import { useRef, useState } from 'react';

// Componentes base con el estilo "Plano técnico": rojo RVC, tinta carbón, líneas finas y esquinas rectas.

export function Card({ children, className = '' }) {
  return <div className={`bg-white border border-gray-300 ${className}`}>{children}</div>;
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex min-h-[40px] items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta';
  const variants = {
    primary: 'bg-rvc font-bold text-white hover:bg-rvcosc',
    secondary: 'border border-tinta bg-transparent text-tinta hover:bg-tinta/5',
    ghost: 'text-tinta underline-offset-4 hover:underline',
    danger: 'border border-[#D13038] bg-transparent text-[#D13038] hover:bg-[#D13038]/5',
  };
  return (
    <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

export function Field({ label, children, hint, required }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-gray-500">
        {label}
        {required && <span className="text-[#D13038]"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

const CAMPO =
  'w-full min-h-[40px] border border-gray-300 bg-white px-3 py-2 text-sm text-tinta focus:border-tinta focus:outline-none focus:ring-1 focus:ring-tinta disabled:bg-gray-100 disabled:text-gray-500';

export function Input(props) {
  return <input {...props} className={`${CAMPO} ${props.className || ''}`} />;
}

export function Select(props) {
  return <select {...props} className={`${CAMPO} ${props.className || ''}`} />;
}

export function Textarea(props) {
  return <textarea {...props} className={`${CAMPO} ${props.className || ''}`} />;
}

export function Modal({ open, ...props }) {
  if (!open) return null;
  return <Ventana {...props} />;
}

// Ventana que se puede arrastrar desde la barra del título para ver lo que hay detrás.
// Al moverla, el fondo se aclara; siempre queda a la vista una parte de la barra para recuperarla.
function Ventana({ onClose, title, children, wide }) {
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 });
  const caja = useRef(null);
  const arrastre = useRef(null);

  function empezar(e) {
    if (e.button !== 0 || e.target.closest('button')) return;
    const r = caja.current.getBoundingClientRect();
    arrastre.current = { x: e.clientX, y: e.clientY, base: desplazamiento, r };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function mover(e) {
    const a = arrastre.current;
    if (!a) return;
    const visible = 80; // px de la barra que nunca salen de la pantalla
    const dx = Math.min(Math.max(e.clientX - a.x, visible - a.r.right), window.innerWidth - visible - a.r.left);
    const dy = Math.min(Math.max(e.clientY - a.y, -a.r.top), window.innerHeight - 56 - a.r.top);
    setDesplazamiento({ x: a.base.x + dx, y: a.base.y + dy });
  }

  function soltar() {
    arrastre.current = null;
  }

  const movida = desplazamiento.x !== 0 || desplazamiento.y !== 0;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 no-print ${movida ? 'bg-tinta/10' : 'bg-tinta/40'}`}>
      <div
        ref={caja}
        className={`flex w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex-col border border-tinta bg-white shadow-xl`}
        style={{ transform: `translate(${desplazamiento.x}px, ${desplazamiento.y}px)` }}
      >
        <div
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onDoubleClick={() => setDesplazamiento({ x: 0, y: 0 })}
          title="Arrastra para mover la ventana (doble clic: volver al centro)"
          className="flex shrink-0 cursor-move touch-none select-none items-center justify-between border-b-4 border-rvc bg-tinta px-5 py-3 text-white"
        >
          <h3 className="flex items-center gap-2 text-base font-bold">
            <span className="text-papel/50" aria-hidden="true">⠿</span>
            {title}
          </h3>
          <button onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center text-papel/80 hover:bg-white/10 hover:text-papel">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
