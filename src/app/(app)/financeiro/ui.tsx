import Link from "next/link";
import type { FinanceStatus } from "@prisma/client";
import { dateInput, paymentMethodLabel, paymentMethods, statusLabel, today } from "@/lib/finance";

// Seletor de mês: ‹ Outubro de 2026 ›
export function MonthNav({ basePath, range, params = {} }: {
  basePath: string;
  range: { month: string; prev: string; next: string; label: string };
  params?: Record<string, string | undefined>;
}) {
  const href = (month: string) => {
    const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), mes: month });
    return `${basePath}?${query}`;
  };
  return (
    <div className="flex items-center gap-2">
      <Link href={href(range.prev)} className="btn-secondary px-3!" aria-label="Mês anterior">‹</Link>
      <span className="min-w-44 text-center font-medium text-marinho-800">{range.label}</span>
      <Link href={href(range.next)} className="btn-secondary px-3!" aria-label="Próximo mês">›</Link>
    </div>
  );
}

export function StatusBadge({ status, dueDate }: { status: FinanceStatus; dueDate?: Date }) {
  if (status === "PENDENTE" && dueDate && dueDate < today()) {
    return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">Atrasado</span>;
  }
  const style = {
    PENDENTE: "bg-amber-100 text-amber-800",
    PAGO: "bg-emerald-100 text-emerald-800",
    CANCELADO: "bg-slate-100 text-slate-500",
  }[status];
  return <span className={`rounded px-2 py-0.5 text-xs ${style}`}>{statusLabel[status]}</span>;
}

// Botão que abre a forma de pagamento e a data, e registra o pagamento.
export function PayForm({ action, label }: { action: (formData: FormData) => Promise<void>; label: string }) {
  return (
    <details className="relative inline-block">
      <summary className="cursor-pointer list-none rounded-md bg-marinho-700 px-3 py-1 text-xs font-medium text-white hover:bg-marinho-800">
        {label}
      </summary>
      <form action={action} className="absolute right-0 z-10 mt-1 w-60 space-y-2 rounded-md border border-slate-200 bg-white p-3 text-left shadow-lg">
        <PaymentFields />
        <button className="btn-primary w-full">Confirmar</button>
      </form>
    </details>
  );
}

export function PaymentFields() {
  return (
    <>
      <div>
        <label className="label">Forma de pagamento</label>
        <select name="paymentMethod" className="input" required defaultValue="">
          <option value="" disabled>Escolha...</option>
          {paymentMethods.map((m) => (
            <option key={m} value={m}>{paymentMethodLabel[m]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Data do pagamento</label>
        <input type="date" name="paidAt" className="input" defaultValue={dateInput(today())} required />
      </div>
    </>
  );
}

export function SummaryCard({ label, value, tone = "default", hint }: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red" | "gold";
  hint?: string;
}) {
  const color = { default: "text-marinho-800", green: "text-emerald-700", red: "text-red-700", gold: "text-dourado-700" }[tone];
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
