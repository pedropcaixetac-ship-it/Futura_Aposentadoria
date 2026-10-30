import type { Patient } from "@prisma/client";
import { formatCep, formatCpf, formatDate, formatPhone, masks } from "@/lib/format";

const sexLabel: Record<string, string> = { F: "Feminino", M: "Masculino", O: "Outro" };

function Group({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  const filled = rows.filter(([, v]) => v);
  if (filled.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-dourado-700">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {filled.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Ficha cadastral completa, aberta ao clicar (fica fechada para não ocupar o topo do prontuário).
export function PatientDetails({ patient: p }: { patient: Patient }) {
  const address = [
    [p.street, p.number].filter(Boolean).join(", "),
    p.complement,
    p.district,
    [p.city, p.state].filter(Boolean).join("/"),
    p.cep && `CEP ${formatCep(p.cep)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold text-marinho-800">Ficha cadastral</summary>
      <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Group
          title="Identificação"
          rows={[
            ["Nome", p.name],
            ["Nome social", p.socialName],
            ["Nascimento", formatDate(p.birthDate)],
            ["Sexo", p.sex && sexLabel[p.sex]],
            ["CPF", formatCpf(p.cpf)],
            ["RG", p.rg],
            ["Cartão SUS", p.cns && masks.cns(p.cns)],
            ["Mãe", p.motherName],
            ["Estado civil", p.maritalStatus],
            ["Profissão", p.occupation],
          ]}
        />
        <Group
          title="Contato"
          rows={[
            ["Celular", p.phone && `${formatPhone(p.phone)}${p.phoneWhatsapp ? " (WhatsApp)" : ""}`],
            ["Fixo", formatPhone(p.landline)],
            ["E-mail", p.email],
            ["Emergência", [p.emergencyContactName, formatPhone(p.emergencyContactPhone)].filter(Boolean).join(" · ")],
            ["Endereço", address],
          ]}
        />
        <Group
          title="Convênio e outros"
          rows={[
            ["Convênio", p.insurance],
            ["Carteirinha", p.insuranceNumber],
            ["Validade", formatDate(p.insuranceValidUntil)],
            ["Responsável", [p.guardianName, p.guardianRelationship, formatCpf(p.guardianCpf), formatPhone(p.guardianPhone)].filter(Boolean).join(" · ")],
            ["Como conheceu", p.referralSource],
            ["LGPD", p.lgpdConsentAt ? `Autorizado em ${formatDate(p.lgpdConsentAt)}` : "Sem autorização registrada"],
            ["Observações", p.notes],
          ]}
        />
      </div>
    </details>
  );
}
