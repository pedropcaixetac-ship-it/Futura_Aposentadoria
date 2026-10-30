import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canUseReception } from "@/lib/permissions";
import { clinicParts, formatDayLabel, today } from "@/lib/agenda";
import { formatDate, formatDateTime, formatPhone } from "@/lib/format";
import { canMessage } from "@/lib/whatsapp";
import { WhatsappLink } from "../../agenda/whatsapp-link";
import { RETURN_NOTICE_DAYS_BEFORE, returnsToNotify } from "./data";
import { displayName } from "@/lib/staff";

export default async function ReturnsPage() {
  const user = await requireUser("recepcao");
  if (!canUseReception(user)) notFound();
  const returns = await returnsToNotify(user.clinicId);
  const now = today();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/recepcao" className="text-sm text-marinho-700 hover:underline">← Recepção</Link>
        <h1 className="mt-1 text-2xl font-semibold">Retornos para avisar</h1>
        <p className="text-sm text-slate-500">
          Pacientes com retorno previsto para os próximos {RETURN_NOTICE_DAYS_BEFORE} dias (ou já passado) que ainda não marcaram.
          O retorno previsto é anotado na página de cada consulta.
        </p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Retorno previsto</th>
              <th className="px-4 py-2 font-medium">Paciente</th>
              <th className="px-4 py-2 font-medium">Profissional</th>
              <th className="px-4 py-2 font-medium">Última consulta</th>
              <th className="px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => {
              const dueDate = r.returnDueOn!.toISOString().slice(0, 10);
              return (
                <tr key={r.id} className="border-t border-slate-100 align-middle">
                  <td className="px-4 py-2">
                    <span className="font-medium">{formatDate(r.returnDueOn)}</span>
                    {dueDate < now && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">atrasado</span>}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/pacientes/${r.patient.id}`} className="font-medium text-marinho-800 hover:underline">
                      {r.patient.socialName || r.patient.name}
                    </Link>
                    <p className="text-xs text-slate-500">{formatPhone(r.patient.phone)}</p>
                  </td>
                  <td className="px-4 py-2">{displayName(r.professional)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/agenda/${r.id}`} className="text-marinho-700 hover:underline">{formatDayLabel(clinicParts(r.startsAt).date)}</Link>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {canMessage(r.patient) ? (
                        <WhatsappLink
                          small
                          href={`/agenda/${r.id}/whatsapp?modelo=retorno`}
                          label="Avisar pelo WhatsApp"
                          sentAt={r.returnNoticeSentAt && formatDateTime(r.returnNoticeSentAt)}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Sem autorização para WhatsApp</span>
                      )}
                      <Link
                        href={`/agenda/novo?paciente=${r.patient.id}&profissional=${r.professional.id}&data=${dueDate < now ? now : dueDate}&tipo=retorno`}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                      >
                        Marcar retorno
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {returns.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhum retorno para avisar agora.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
