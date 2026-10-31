// Filtro por ala das filas do laboratório e da imagem (hospital cheio: a coleta anda ala por ala).
export function QueueFilter({ path, ala, wards }: { path: string; ala: string; wards: { id: string; name: string }[] }) {
  return (
    <form className="flex flex-wrap items-end gap-2" action={path}>
      <div>
        <label className="label" htmlFor="ala">Onde o paciente está</label>
        <select id="ala" name="ala" defaultValue={ala} className="input w-auto! min-w-56">
          <option value="">Todo o hospital</option>
          <option value="ps">Pronto-socorro</option>
          <option value="externo">Ambulatorial (agendados)</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <button className="btn-secondary">Filtrar</button>
    </form>
  );
}

// "Mostrando os 60 primeiros de 3.000": a fila continua aparecendo conforme anda.
export function QueueMore({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return <p className="text-xs text-slate-500">Mostrando os {shown} primeiros da fila (urgentes e mais antigos antes) de {total.toLocaleString("pt-BR")}. Os próximos aparecem conforme a fila anda, ou filtre pela ala.</p>;
}
