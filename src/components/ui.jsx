// Componentes base con el estilo "Plano técnico": papel, tinta azul marino, líneas finas y esquinas rectas.

export function Card({ children, className = '' }) {
  return <div className={`bg-white border border-gray-300 ${className}`}>{children}</div>;
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex min-h-[40px] items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta';
  const variants = {
    primary: 'bg-[#B3261E] font-bold text-white hover:bg-[#8E1E18]',
    secondary: 'border border-tinta bg-transparent text-tinta hover:bg-tinta/5',
    ghost: 'text-tinta underline-offset-4 hover:underline',
    danger: 'border border-[#B3261E] bg-transparent text-[#B3261E] hover:bg-[#B3261E]/5',
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
        {required && <span className="text-[#B3261E]"> *</span>}
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

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4 no-print">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto border border-tinta bg-white shadow-xl`}>
        <div className="flex items-center justify-between bg-tinta px-5 py-3 text-papel">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center text-papel/80 hover:bg-white/10 hover:text-papel">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
