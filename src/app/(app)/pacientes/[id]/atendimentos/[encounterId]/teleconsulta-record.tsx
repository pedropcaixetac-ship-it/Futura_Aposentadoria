import type { Teleconsultation } from "@prisma/client";
import { formatDateTime } from "@/lib/format";

// Registro da teleconsulta no prontuário (Resolução CFM 2.314/2022).
export function TeleconsultaRecord({ tele }: { tele: Teleconsultation }) {
  return (
    <div className="card space-y-1 text-sm">
      <h2 className="font-semibold">Atendimento por teleconsulta</h2>
      <p className="text-slate-600">Realizado a distância, por vídeo, conforme a Resolução CFM nº 2.314/2022. A chamada não foi gravada.</p>
      <p className="text-slate-600">
        {tele.consentAt
          ? `Termo de consentimento aceito pelo paciente em ${formatDateTime(tele.consentAt)}${tele.consentIp ? ` (IP ${tele.consentIp})` : ""}.`
          : "O paciente ainda não aceitou o termo de consentimento."}
      </p>
      {(tele.professionalJoinedAt || tele.patientJoinedAt || tele.endedAt) && (
        <p className="text-slate-600">
          {[
            tele.professionalJoinedAt && `Profissional entrou: ${formatDateTime(tele.professionalJoinedAt)}`,
            tele.patientJoinedAt && `Paciente entrou: ${formatDateTime(tele.patientJoinedAt)}`,
            tele.endedAt && `Encerrada: ${formatDateTime(tele.endedAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {tele.consentText && (
        <details className="no-print">
          <summary className="cursor-pointer text-marinho-700">Ver o termo aceito</summary>
          <p className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-600">{tele.consentText}</p>
        </details>
      )}
    </div>
  );
}
