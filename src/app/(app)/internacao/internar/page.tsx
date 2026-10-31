import Link from "next/link";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAdmit } from "@/lib/hospital-roles";
import { displayName } from "@/lib/staff";
import { canViewClinical } from "@/lib/permissions";
import { compareBedCodes } from "@/lib/internacao";
import { AdmitForm } from "./admit-form";

export default async function AdmitPage({ searchParams }: { searchParams: Promise<{ leito?: string; paciente?: string; origem?: string }> }) {
  const user = await requireUser("internacao");
  if (!canAdmit(user)) redirect("/internacao");
  const params = await searchParams;

  const [wards, professionals, patient] = await Promise.all([
    prisma.ward.findMany({
      where: { clinicId: user.clinicId, active: true },
      include: { beds: { where: { active: true, status: "LIVRE", admissions: { none: { dischargedAt: null } } } } },
      orderBy: { name: "asc" },
    }),
    // Médico responsável: só médicos (CRM), com a especialidade, que passa a ser a da internação.
    prisma.user
      .findMany({
        where: { clinicId: user.clinicId, active: true, role: { in: ["PROFISSIONAL", "ADMIN"] }, councilType: "CRM", councilNumber: { not: null } },
        select: { id: true, name: true, sex: true, jobTitle: true, specialty: true },
        orderBy: { name: "asc" },
      })
      .then((list) => list.map((p) => ({ id: p.id, name: `${displayName(p)}${p.specialty ? ` · ${p.specialty}` : ""}` }))),
    params.paciente
      ? prisma.patient.findFirst({ where: { id: params.paciente, clinicId: user.clinicId }, select: { id: true, name: true, phone: true, insurance: true } })
      : null,
  ]);
  const freeBeds = wards
    .filter((w) => w.beds.length)
    .map((w) => ({ ward: w.name, beds: [...w.beds].sort((a, b) => compareBedCodes(a.code, b.code)).map((b) => ({ id: b.id, code: b.code })) }));
  const defaultBed = freeBeds.some((g) => g.beds.some((b) => b.id === params.leito)) ? params.leito! : "";

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/internacao" className="text-sm text-marinho-700 hover:underline">← Mapa de leitos</Link>
        <h1 className="mt-1 text-2xl font-semibold">Internar paciente</h1>
      </div>
      {freeBeds.length === 0 ? (
        <p className="card text-sm text-slate-600">Nenhum leito livre agora. Libere um leito em limpeza no mapa ou cadastre mais leitos.</p>
      ) : (
        <AdmitForm
          freeBeds={freeBeds}
          defaultBed={defaultBed}
          professionals={professionals}
          defaultAttending={professionals.some((p) => p.id === user.id) ? user.id : ""}
          patient={patient}
          showCid={canViewClinical(user)}
          defaultOrigin={params.origem === "ps" ? "Pronto-socorro" : ""}
        />
      )}
    </div>
  );
}
