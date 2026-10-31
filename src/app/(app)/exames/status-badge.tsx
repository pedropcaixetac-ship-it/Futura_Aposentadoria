import type { ExamPriority, ExamStatus } from "@prisma/client";
import { examStatusLabel } from "@/lib/exames";

const tone: Record<ExamStatus, string> = {
  SOLICITADO: "bg-marinho-100 text-marinho-800",
  AGENDADO: "bg-marinho-100 text-marinho-800",
  COLETADO: "bg-amber-100 text-amber-900",
  LAUDADO: "bg-emerald-100 text-emerald-800",
  CANCELADO: "bg-slate-200 text-slate-600",
};

export function ExamBadge({ status, priority }: { status: ExamStatus; priority?: ExamPriority }) {
  return (
    <>
      <span className={`rounded-full px-2 py-0.5 text-xs ${tone[status]}`}>{examStatusLabel[status]}</span>
      {priority === "URGENTE" && status !== "LAUDADO" && status !== "CANCELADO" && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">Urgente</span>}
    </>
  );
}
