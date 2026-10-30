import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { hasTab, type TabKey } from "./tabs";

const COOKIE = "sessao";
const SESSION_HOURS = 12;

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
    include: { user: { include: { clinic: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active || !session.user.systemAccess) return null;
  return session.user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Com uma aba, também confere se a pessoa tem acesso a ela (ver "Editar permissões").
// Sem acesso, volta para o início, que leva à primeira aba liberada.
export async function requireUser(tab?: TabKey) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (tab && !hasTab(user, tab)) redirect("/");
  return user;
}
