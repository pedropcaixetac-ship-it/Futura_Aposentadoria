import Link from "next/link";

// Listas grandes (hospital cheio): mostra uma página de cada vez em vez de montar milhares de linhas.
export function pageNumber(raw: string | undefined) {
  return Math.max(1, Math.floor(Number(raw)) || 1);
}

export function Pager({ page, size, count, href }: { page: number; size: number; count: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(count / size));
  if (pages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
      {page > 1 && <Link href={href(page - 1)} className="btn-secondary">‹ Anteriores</Link>}
      <span className="text-slate-500">
        Mostrando {(page - 1) * size + 1} a {Math.min(page * size, count)} de {count}
      </span>
      {page < pages && <Link href={href(page + 1)} className="btn-secondary">Próximos ›</Link>}
    </div>
  );
}
