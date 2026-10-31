import type { SurgeryStatus } from "@prisma/client";
import { surgeryStatusLabel } from "@/lib/centro-cirurgico";

const tone: Record<SurgeryStatus, string> = {
  AGENDADA: "bg-marinho-100 text-marinho-800",
  EM_SALA: "bg-amber-100 text-amber-900",
  REALIZADA: "bg-emerald-100 text-emerald-800",
  CANCELADA: "bg-slate-200 text-slate-600",
};

export function SurgeryBadge({ status }: { status: SurgeryStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone[status]}`}>{status === "CANCELADA" ? "Suspensa" : surgeryStatusLabel[status]}</span>;
}
