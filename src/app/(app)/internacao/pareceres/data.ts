import { prisma } from "@/lib/db";

// Especialidades que a instituição tem: as do cadastro dos profissionais ativos com conselho.
export async function loadSpecialties(clinicId: string) {
  const rows = await prisma.user.findMany({
    where: { clinicId, active: true, councilNumber: { not: null }, specialty: { not: null } },
    select: { specialty: true },
    distinct: ["specialty"],
  });
  const seen = new Map<string, string>();
  for (const r of rows) {
    const name = r.specialty!.trim();
    const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (name && !seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Profissionais com especialidade, para escolher quem responde o parecer ou quem assume o paciente.
export async function loadSpecialists(clinicId: string) {
  return prisma.user.findMany({
    where: { clinicId, active: true, councilNumber: { not: null }, specialty: { not: null } },
    select: { id: true, name: true, sex: true, jobTitle: true, specialty: true, councilType: true, role: true, councilNumber: true },
    orderBy: { name: "asc" },
  });
}
