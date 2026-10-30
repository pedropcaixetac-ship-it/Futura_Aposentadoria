import { createHash } from "node:crypto";
import { prisma } from "./db";

// Problemas do sistema (ver o modelo ProblemReport): erros que acontecem sozinhos e relatos
// feitos pelo botão "Relatar problema". A empresa acompanha tudo no Painel do dono.

export type ProblemKind = "ERRO" | "RELATO";

export const problemKindLabel: Record<ProblemKind, string> = {
  ERRO: "Erro automático",
  RELATO: "Relato",
};

// O mesmo erro repetido dentro desta janela soma na linha que já existe.
const REPEAT_HOURS = 24;

const MESSAGE_MAX = 1000;
const DETAILS_MAX = 4000;
const PAGE_MAX = 300;

function cut(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Endereço sem os parâmetros (?busca=..., ?cpf=...), que podem trazer dados de paciente.
export function cleanPage(value: string | null | undefined) {
  const path = (value ?? "").trim().split(/[?#]/)[0];
  if (!path.startsWith("/")) return null;
  return cut(path, PAGE_MAX);
}

// Identificadores do banco variam a cada registro; tirá-los deixa os endereços parecidos iguais
// (/pacientes/abc123/atendimentos/xyz → /pacientes/:id/atendimentos/:id).
export function pageGroup(page: string | null) {
  return page ? page.replace(/\/c[a-z0-9]{20,}/g, "/:id").replace(/\/\d+(?=\/|$)/g, "/:n") : "";
}

export function errorFingerprint(message: string, page: string | null) {
  return createHash("sha256").update(`${message}\n${pageGroup(page)}`).digest("hex").slice(0, 32);
}

export type ErrorEntry = {
  message: string;
  page?: string | null;
  digest?: string | null;
  details?: string | null;
  clinicId?: string | null;
  userId?: string | null;
};

// Registra um erro sem nunca derrubar quem chamou: se o próprio registro falhar (ex.: banco fora
// do ar), só aparece no log da Vercel.
export async function recordError(entry: ErrorEntry) {
  try {
    const message = cut(entry.message.trim() || "Erro sem mensagem", MESSAGE_MAX);
    const page = cleanPage(entry.page);
    const fingerprint = errorFingerprint(message, page);
    const since = new Date(Date.now() - REPEAT_HOURS * 3600 * 1000);
    const existing = await prisma.problemReport.findFirst({
      where: { kind: "ERRO", fingerprint, resolvedAt: null, lastSeenAt: { gte: since } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });
    if (existing) {
      await prisma.problemReport.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, lastSeenAt: new Date(), ...(entry.digest && { digest: entry.digest }) },
      });
      return;
    }
    await prisma.problemReport.create({
      data: {
        kind: "ERRO",
        message,
        page,
        fingerprint,
        digest: entry.digest ?? null,
        details: entry.details ? cut(entry.details, DETAILS_MAX) : null,
        clinicId: entry.clinicId ?? null,
        userId: entry.userId ?? null,
      },
    });
  } catch (e) {
    console.error("Não foi possível registrar o erro", e);
  }
}

export type ReportInput = { message: string; page: string | null; digest: string | null };

export function parseReport(formData: FormData): ReportInput {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    message: text("message"),
    page: cleanPage(text("page")),
    digest: text("digest").slice(0, 64) || null,
  };
}

export function validateReport(report: ReportInput) {
  if (report.message.length < 5) return "Conte com algumas palavras o que aconteceu.";
  if (report.message.length > MESSAGE_MAX) return `Escreva no máximo ${MESSAGE_MAX} letras.`;
  return null;
}

// Quem estava usando o sistema quando o erro aconteceu, pelo cookie da sessão
// (o registro automático não passa pelo login das telas).
export async function sessionOwner(cookieHeader: string | null | undefined) {
  const token = cookieHeader?.match(/(?:^|;\s*)sessao=([^;]+)/)?.[1];
  if (!token) return { userId: null, clinicId: null };
  try {
    const session = await prisma.session.findUnique({
      where: { id: createHash("sha256").update(decodeURIComponent(token)).digest("hex") },
      select: { user: { select: { id: true, clinicId: true } } },
    });
    return { userId: session?.user.id ?? null, clinicId: session?.user.clinicId ?? null };
  } catch {
    return { userId: null, clinicId: null };
  }
}
