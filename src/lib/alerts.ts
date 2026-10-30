import { prisma } from "./db";

// Aviso por e-mail para a empresa quando surge um problema novo (erro ou relato), pelo Resend (resend.com).
// Só funciona com RESEND_API_KEY e ALERTA_EMAIL nas variáveis da Vercel; sem elas, não faz nada.
// Na conta gratuita, sem domínio próprio, o Resend só entrega para o e-mail de quem criou a conta.
const API = "https://api.resend.com/emails";
const DEFAULT_FROM = "Futura <onboarding@resend.dev>";
// Se muita coisa quebrar de uma vez, avisa no máximo isto por hora (o resto fica só no painel).
const MAX_PER_HOUR = 10;

export type AlertProblem = { kind: string; message: string; page: string | null; clinicName?: string | null; userName?: string | null };

export function alertEnabled() {
  return !!process.env.RESEND_API_KEY && !!process.env.ALERTA_EMAIL;
}

export function alertEmail(problem: AlertProblem, panelUrl: string | null) {
  const what = problem.kind === "RELATO" ? "Relato de problema" : "Erro no sistema";
  const where = problem.clinicName ? ` · ${problem.clinicName}` : "";
  const subject = `${what}${where}: ${problem.message.replace(/\s+/g, " ").slice(0, 80)}`;
  const lines = [
    `${what}${where}`,
    "",
    problem.message,
    "",
    ...(problem.page ? [`Tela: ${problem.page}`] : []),
    ...(problem.userName ? [`Quem estava usando: ${problem.userName}`] : []),
    "",
    panelUrl ? `Ver no Painel do dono: ${panelUrl}` : "Veja em Painel do dono → Problemas.",
    "",
    "Se o mesmo erro se repetir nas próximas 24 horas, ele só soma no painel e não manda outro e-mail.",
  ];
  return { subject, text: lines.join("\n") };
}

function panelUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}/painel/problemas` : null;
}

// Nunca derruba quem chamou: se o e-mail falhar, fica só no log da Vercel.
export async function sendProblemAlert(problem: AlertProblem) {
  if (!alertEnabled()) return;
  try {
    const recent = await prisma.problemReport.count({ where: { createdAt: { gte: new Date(Date.now() - 3600 * 1000) } } });
    if (recent > MAX_PER_HOUR) return;
    const { subject, text } = alertEmail(problem, panelUrl());
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERTA_REMETENTE || DEFAULT_FROM,
        to: process.env.ALERTA_EMAIL!.split(",").map((e) => e.trim()).filter(Boolean),
        subject,
        text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("Aviso por e-mail recusado pelo Resend", res.status, await res.text());
  } catch (e) {
    console.error("Não foi possível mandar o aviso por e-mail", e);
  }
}
