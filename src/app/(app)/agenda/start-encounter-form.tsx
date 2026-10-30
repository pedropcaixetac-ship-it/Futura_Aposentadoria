import type { AppointmentType } from "@prisma/client";
import type { listUsableTemplates } from "@/lib/templates";
import { startFromAppointment } from "./actions";

type Templates = Awaited<ReturnType<typeof listUsableTemplates>>;

// Escolha do modelo e botão "Iniciar atendimento" de uma consulta da agenda.
// Retorno já vem com o modelo "Retorno"; senão, o único modelo do profissional, se houver só um.
export function StartEncounterForm({ appointment, templates }: { appointment: { id: string; type: AppointmentType }; templates: Templates }) {
  const preset =
    (appointment.type === "RETORNO" && [...templates.mine, ...templates.clinic].find((t) => t.name === "Retorno")?.id) ||
    (templates.mine.length === 1 ? templates.mine[0].id : "");
  return (
    <form action={startFromAppointment.bind(null, appointment.id)} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor={`templateId-${appointment.id}`}>Modelo de Atendimento</label>
        <select id={`templateId-${appointment.id}`} name="templateId" className="input w-auto!" defaultValue={preset}>
          <option value="">Evolução livre</option>
          {templates.mine.length > 0 && (
            <optgroup label="Meus modelos">
              {templates.mine.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          )}
          {templates.clinic.length > 0 && (
            <optgroup label="Modelos da clínica">
              {templates.clinic.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      <button className="btn-primary">Iniciar atendimento</button>
    </form>
  );
}
