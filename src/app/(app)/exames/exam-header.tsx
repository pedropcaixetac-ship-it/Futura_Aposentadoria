import { formatDateTime } from "@/lib/format";
import { displayName } from "@/lib/staff";
import { ExamBadge } from "./status-badge";
import { whereLabel, type QueueExam } from "./queue-data";

// Linha de identificação do exame nas filas do laboratório e da imagem.
export function ExamHeader({ e }: { e: QueueExam }) {
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{e.patient.socialName || e.patient.name}</strong>
        <span className="text-slate-500">· {whereLabel(e)}</span>
        <ExamBadge status={e.status} priority={e.priority} />
      </div>
      <p>
        <span className="font-medium">{e.examType.name}</span>
        {e.scheduledAt && <span className="text-slate-600"> · marcado {formatDateTime(e.scheduledAt)}</span>}
        <span className="text-xs text-slate-500"> · pedido por {e.requestedBy ? displayName(e.requestedBy) : e.externalRequester}</span>
      </p>
      {e.clinicalInfo && <p className="text-xs text-slate-600">Indicação: {e.clinicalInfo}</p>}
      {e.patient.allergies && <p className="text-xs font-medium text-red-700">Alergias: {e.patient.allergies}</p>}
    </div>
  );
}
