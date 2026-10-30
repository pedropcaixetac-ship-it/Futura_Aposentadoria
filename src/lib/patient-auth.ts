import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { PATIENT_SESSION_DAYS } from "./patient-app";

// Sessão do paciente no aplicativo, separada da sessão da equipe (outro cookie, outra tabela).
const COOKIE = "sessao_paciente";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPatientSession(patientId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PATIENT_SESSION_DAYS * 24 * 3600 * 1000);
  await prisma.patientSession.create({ data: { id: hashToken(token), patientId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/paciente",
  });
}

export async function destroyPatientSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.patientSession.deleteMany({ where: { id: hashToken(token) } });
  jar.delete({ name: COOKIE, path: "/paciente" });
}

export async function getCurrentPatient() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.patientSession.findUnique({
    where: { id: hashToken(token) },
    include: { patient: { select: { id: true, name: true, socialName: true, clinicId: true, clinic: { select: { name: true } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.patient;
}

export async function requirePatient() {
  const patient = await getCurrentPatient();
  if (!patient) redirect("/paciente/entrar");
  return patient;
}
