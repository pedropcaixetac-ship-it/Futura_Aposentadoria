import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { hasTab, type TabKey } from "./tabs";
import { clinicBlocked } from "./plans";

const COOKIE = "sessao";
const SESSION_HOURS = 12;
// Computador esquecido aberto: depois deste tempo sem uso, pede o login de novo.
const IDLE_MINUTES = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  // Guardamos só a impressão digital do token: quem ler o banco não consegue entrar.
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

// Senha trocada: quem estava conectado em outro aparelho sai (menos a sessão atual, se houver).
export async function endOtherSessions(userId: string) {
  const token = (await cookies()).get(COOKIE)?.value;
  await prisma.session.deleteMany({ where: { userId, ...(token && { id: { not: hashToken(token) } }) } });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(COOKIE);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { clinic: { include: { plan: true } } }, omit: { photo: true, passwordHash: true, totpSecret: true, totpRecoveryCodes: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active || !session.user.systemAccess) return null;
  // Clínica suspensa no Painel do dono (ou com a mensalidade muito atrasada): ninguém dela continua conectado.
  if (clinicBlocked(session.user.clinic)) return null;
  const now = Date.now();
  if (now - session.lastSeenAt.getTime() > IDLE_MINUTES * 60_000) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  // Grava o último uso no máximo uma vez por minuto, para não escrever no banco a cada clique.
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }
  // Módulos do plano da clínica; sem plano, tudo liberado (ver src/lib/plans.ts). O tipo da instituição liga os setores hospitalares.
  return {
    ...session.user,
    modules: session.user.clinic.plan?.modules ?? null,
    institution: session.user.clinic.kind,
  };
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Com uma aba, também confere se a pessoa tem acesso a ela (ver "Editar permissões").
// Sem acesso, volta para o início, que leva à primeira aba liberada.
export async function requireUser(tab?: TabKey) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Senha criada pelo gerente: antes de qualquer tela, a pessoa cria a própria.
  if (user.mustChangePassword) redirect("/nova-senha");
  if (tab && !hasTab(user, tab)) redirect("/");
  return user;
}
