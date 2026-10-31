import type { RiskLevel } from "@prisma/client";
import { riskInfo } from "@/lib/pronto-socorro";

// Etiqueta com a cor da classificação de risco.
export function RiskBadge({ risk }: { risk: RiskLevel | null }) {
  if (!risk) return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Sem triagem</span>;
  const r = riskInfo(risk);
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.className}`}>{r.label}</span>;
}
