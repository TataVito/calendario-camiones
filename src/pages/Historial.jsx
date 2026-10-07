import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Field, Input, Select } from '../components/ui.jsx';
import { supabase } from '../lib/supabase.js';
import { ACCIONES, TABLAS, accionInfo, cambios, fechaHora, resumen } from '../lib/auditoria.js';

const POR_PAGINA = 100;

function Entrada({ h, nombreObra }) {
  const lista = cambios(h, nombreObra);
  return (
    <li className="border-b border-gray-100 px-3 py-2 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="w-32 shrink-0 text-xs text-gray-500">{fechaHora(h.fecha)}</span>
        <span className="font-medium text-gray-900">{h.usuario || '—'}</span>
        <Badge className={accionInfo(h.accion).color}>{accionInfo(h.accion).label}</Badge>
        <span className="text-gray-500">{TABLAS[h.tabla]}</span>
        <span className="text-gray-800">{resumen(h)}</span>
        {h.tabla === 'eventos' && h.obra_id && <span className="text-xs text-gray-400">({nombreObra(h.obra_id)})</span>}
      </div>
      {lista.length > 0 && (
        <ul className="ml-0 mt-1 text-xs text-gray-500">
          {lista.map((c) =>
            'valor' in c ? (
              <li key={c.campo}>
                {c.campo}: <span className="text-gray-700">{c.valor}</span>
              </li>
            ) : (
              <li key={c.campo}>
                {c.campo}: <span className="line-through">{c.antes}</span> → <span className="text-gray-800">{c.despues}</span>
              </li>
            ),
          )}
        </ul>
      )}
    </li>
  );
}

export default function Historial({ obras }) {
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', usuario: '', obraId: '', accion: '', tabla: '' });
  const [entradas, setEntradas] = useState([]);
  const [hayMas, setHayMas] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');

  const nombreObra = useCallback((id) => obras.find((o) => o.id === id)?.nombre || 'obra eliminada', [obras]);

  useEffect(() => {
    supabase
      .from('perfiles')
      .select('usuario')
      .order('usuario')
      .then(({ data }) => setUsuarios((data || []).map((p) => p.usuario)));
  }, []);

  const cargar = useCallback(
    async (desdeFila) => {
      let q = supabase.from('auditoria').select('*').order('fecha', { ascending: false });
      if (filtros.desde) q = q.gte('fecha', `${filtros.desde}T00:00:00`);
      if (filtros.hasta) q = q.lte('fecha', `${filtros.hasta}T23:59:59.999`);
      if (filtros.usuario) q = q.eq('usuario', filtros.usuario);
      if (filtros.obraId) q = q.eq('obra_id', filtros.obraId);
      if (filtros.accion) q = q.eq('accion', filtros.accion);
      if (filtros.tabla) q = q.eq('tabla', filtros.tabla);
      const { data, error } = await q.range(desdeFila, desdeFila + POR_PAGINA - 1);
      if (error) return setError(error.message);
      setError('');
      setEntradas((prev) => (desdeFila === 0 ? data : [...prev, ...data]));
      setHayMas(data.length === POR_PAGINA);
    },
    [filtros],
  );

  useEffect(() => {
    cargar(0);
  }, [cargar]);

  const set = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <Card className="p-4">
      <h2 className="mb-1 text-base font-semibold text-gray-800">Historial de cambios</h2>
      <p className="mb-3 text-xs text-gray-500">
        Lo anota la base de datos automáticamente y no se puede modificar ni borrar.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Field label="Desde">
          <Input type="date" value={filtros.desde} onChange={set('desde')} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={filtros.hasta} onChange={set('hasta')} />
        </Field>
        <Field label="Usuario">
          <Select value={filtros.usuario} onChange={set('usuario')}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Obra">
          <Select value={filtros.obraId} onChange={set('obraId')}>
            <option value="">Todas</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Acción">
          <Select value={filtros.accion} onChange={set('accion')}>
            <option value="">Todas</option>
            {ACCIONES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sobre">
          <Select value={filtros.tabla} onChange={set('tabla')}>
            <option value="">Todo</option>
            {Object.entries(TABLAS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}s
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {entradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Sin cambios registrados con estos filtros.</p>
      ) : (
        <ul className="rounded-lg border border-gray-200">
          {entradas.map((h) => (
            <Entrada key={h.id} h={h} nombreObra={nombreObra} />
          ))}
        </ul>
      )}
      {hayMas && (
        <Button variant="secondary" className="mt-3 w-full justify-center" onClick={() => cargar(entradas.length)}>
          Cargar más
        </Button>
      )}
    </Card>
  );
}
