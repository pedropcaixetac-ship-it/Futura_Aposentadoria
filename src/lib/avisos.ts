// Avisos que a empresa escreve no Painel do dono e aparecem no alto do sistema das clínicas.
// Sem acesso ao banco, para poder ser testado sozinho.

export const NOTICE_KINDS = {
  info: { label: "Informação", style: "border-marinho-100 bg-marinho-50 text-marinho-800" },
  novidade: { label: "Novidade", style: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  manutencao: { label: "Manutenção", style: "border-dourado-300 bg-dourado-100 text-dourado-700" },
  importante: { label: "Importante", style: "border-red-200 bg-red-50 text-red-800" },
} as const;

export type NoticeKind = keyof typeof NOTICE_KINDS;

export const NOTICE_AUDIENCES = {
  todos: "Todos da clínica",
  gerentes: "Só os gerentes do sistema",
} as const;

export type NoticeAudience = keyof typeof NOTICE_AUDIENCES;

export function noticeKind(kind: string) {
  return NOTICE_KINDS[kind as NoticeKind] ?? NOTICE_KINDS.info;
}

export type NoticeInput = {
  title: string;
  body: string;
  kind: NoticeKind;
  audience: NoticeAudience;
  clinicId: string | null;
  startsAt: Date;
  endsAt: Date | null;
};

// Datas do formulário (dia, no horário de Brasília): "a partir de" começa às 00:00 e "até" vale o dia inteiro.
function brDay(value: string, endOfDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseNotice(formData: FormData, now = new Date()): NoticeInput | string {
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const title = text("title");
  const body = text("body");
  const kind = text("kind");
  const audience = text("audience");
  if (!title) return "Escreva o título do aviso.";
  if (title.length > 120) return "O título pode ter no máximo 120 caracteres.";
  if (!body) return "Escreva o texto do aviso.";
  if (body.length > 1000) return "O texto pode ter no máximo 1000 caracteres.";
  if (!(kind in NOTICE_KINDS)) return "Escolha o tipo do aviso.";
  if (!(audience in NOTICE_AUDIENCES)) return "Escolha quem vê o aviso.";
  const startsAt = text("startsAt") ? brDay(text("startsAt"), false) : now;
  const endsAt = text("endsAt") ? brDay(text("endsAt"), true) : null;
  if (!startsAt) return "Confira a data de início.";
  if (text("endsAt") && !endsAt) return "Confira a data de fim.";
  if (endsAt && endsAt <= now) return "A data de fim já passou.";
  if (endsAt && endsAt <= startsAt) return "A data de fim precisa ser depois do início.";
  return { title, body, kind: kind as NoticeKind, audience: audience as NoticeAudience, clinicId: text("clinicId") || null, startsAt, endsAt };
}

export function noticeState(n: { startsAt: Date; endsAt: Date | null }, now = new Date()) {
  if (n.startsAt > now) return "agendado" as const;
  if (n.endsAt && n.endsAt <= now) return "encerrado" as const;
  return "no-ar" as const;
}

// Filtro dos avisos que a pessoa deve ver agora: no ar, para a clínica dela (ou para todas),
// para o perfil dela e que ela ainda não fechou.
export function visibleNoticesWhere(user: { id: string; clinicId: string; role: string }, now = new Date()) {
  return {
    startsAt: { lte: now },
    AND: [
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      { OR: [{ clinicId: null }, { clinicId: user.clinicId }] },
    ],
    audience: { in: user.role === "ADMIN" ? ["todos", "gerentes"] : ["todos"] },
    dismissals: { none: { userId: user.id } },
  };
}
