import Link from "next/link";

const tabs = [
  { key: "resumo", label: "Internação e evoluções", path: "" },
  { key: "sinais", label: "Sinais vitais", path: "/sinais" },
  { key: "balanco", label: "Balanço hídrico", path: "/balanco" },
] as const;

// Abas da internação para quem cuida do paciente.
export function CareNav({ admissionId, current }: { admissionId: string; current: (typeof tabs)[number]["key"] }) {
  return (
    <nav className="no-print flex flex-wrap gap-1 border-b border-slate-200 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/internacao/${admissionId}${t.path}`}
          className={`-mb-px border-b-2 px-3 py-2 ${t.key === current ? "border-dourado-500 font-medium text-marinho-800" : "border-transparent text-slate-500 hover:text-marinho-700"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// Cabeçalho curto das abas de sinais e balanço.
export function CareHeader({ admission }: { admission: { id: string; dischargedAt: Date | null; patient: { name: string; socialName: string | null; allergies: string | null }; bed: { code: string; ward: { name: string } } } }) {
  return (
    <div className="space-y-2">
      <Link href="/internacao" className="text-sm text-marinho-700 hover:underline">← Mapa de leitos</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{admission.patient.socialName || admission.patient.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs ${admission.dischargedAt ? "bg-slate-200 text-slate-700" : "bg-marinho-700 text-white"}`}>
          {admission.dischargedAt ? "Alta dada" : `${admission.bed.ward.name} · ${admission.bed.code}`}
        </span>
      </div>
      {admission.patient.allergies && (
        <p className="inline-block rounded-md bg-red-50 px-2 py-1 text-sm font-medium text-red-700">Alergias: {admission.patient.allergies}</p>
      )}
    </div>
  );
}
