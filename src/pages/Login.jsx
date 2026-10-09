import { useState } from 'react';
import { Button, Card, Field, Input } from '../components/ui.jsx';

export default function Login({ login }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [aviso] = useState(() => {
    try {
      const m = sessionStorage.getItem('rvc_motivo_salida');
      sessionStorage.removeItem('rvc_motivo_salida');
      return m || '';
    } catch {
      return '';
    }
  });
  const [enviando, setEnviando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!usuario.trim() || !clave) return;
    setEnviando(true);
    setError('');
    const fallo = await login(usuario, clave);
    setEnviando(false);
    if (fallo) {
      setError(fallo);
      setClave('');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-papel px-4">
      <Card className="w-full max-w-sm border-t-4 border-t-rvc p-6">
        <div className="mb-5 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}rvc.jpg`} alt="RVC" className="h-14 w-14 object-contain" />
          <div>
            <h1 className="text-lg font-bold text-[#D13038]">Calendario de Camiones</h1>
            <p className="text-xs text-gray-500">RVC Constructora — acceso restringido</p>
          </div>
        </div>
        {aviso && <p className="mb-3 border border-[#B07A1E] bg-[#F6EBD4] px-3 py-2 text-sm text-[#5C3D06]">{aviso}</p>}
        <form onSubmit={submit} className="space-y-3">
          <Field label="Usuario" required>
            <Input
              value={usuario}
              onChange={(e) => {
                setUsuario(e.target.value);
                setError('');
              }}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
            />
          </Field>
          <Field label="Clave" required>
            <Input
              type="password"
              value={clave}
              onChange={(e) => {
                setClave(e.target.value);
                setError('');
              }}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full justify-center" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-gray-400">¿No tenés acceso? Pedíselo a un administrador.</p>
      </Card>
    </div>
  );
}
