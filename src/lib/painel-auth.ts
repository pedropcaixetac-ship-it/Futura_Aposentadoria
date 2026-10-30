import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

// Login do Painel do dono, separado do login das clínicas: outro cookie, outra tabela
// e sessão mais curta, porque quem entra aqui pode suspender clínicas.
const COOKIE = "sessao_painel";
const SESSION_HOURS = 8;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPlatformSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await prisma.platformSession.create({ data: { id: hashToken(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/painel",
  });
}

export async function destroyPlatformSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.platformSession.deleteMany({ where: { id: hashToken(token) } });
  jar.delete({ name: COOKIE, path: "/painel" });
}

export async function getPlatformUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.platformSession.findUnique({
    where: { id: hashToken(token) },
    include: { user: { omit: { passwordHash: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session.user;
}

export async function requirePlatformUser() {
  const user = await getPlatformUser();
  if (!user) redirect("/painel/login");
  return user;
}

export async function platformAudit(entry: { userId?: string | null; action: string; clinicId?: string | null; details?: Prisma.InputJsonValue }) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
  await prisma.platformAuditLog.create({ data: { ...entry, ip } });
}
