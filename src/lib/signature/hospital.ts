// Assinatura ICP dos registros do hospital.
// Cada "registro" é o que um profissional fez e precisa assinar: a prescrição do dia, os registros
// de enfermagem do dia (checagens, sinais vitais, balanço), a triagem, a alta, a descrição da cirurgia,
// o resultado do exame, a liberação e a aplicação da quimio e a resposta do parecer.
// Evoluções e atendimentos do pronto-socorro já são assinados como atendimento (tela do atendimento).
//
// Quem assina é sempre o autor. O PDF guarda um resumo (recordHash) do conteúdo: se o registro ganha
// algo novo depois de assinado (mais um item na prescrição, mais uma checagem), volta a ficar pendente.
import { createHash } from "node:crypto";
import type { Patient, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { formatDate, formatDateTime } from "../format";
import { patientLines } from "../pdf-content";
import type { PdfInput, PdfSection } from "../pdf";
import { councilLabel, displayName } from "../staff";
import type { CurrentUser } from "../auth";
import { dayKey, frequencyLabel, kindLabel, localMidnight, prescriptionDayOf } from "../prescricao";
import { riskInfo } from "../pronto-socorro";
import { dischargeKindLabel } from "../internacao";
import { anesthesiaLabel } from "../centro-cirurgico";
import { asValues, flag, referenceLabel } from "../exames";
import { sessionDoses } from "../quimio";
import { vitalsSummary, type Vitals } from "../vitals";
import { formatTime } from "../agenda";

export const RECORD_TYPES = [
  "prescricao",
  "enfermagem",
  "triagem",
  "alta",
  "cirurgia",
  "exame",
  "quimio-liberacao",
  "quimio-aplicacao",
  "parecer",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const recordTypeLabel: Record<RecordType, string> = {
  prescricao: "Prescrição do dia",
  enfermagem: "Registros de enfermagem do dia",
  triagem: "Triagem (classificação de risco)",
  alta: "Alta hospitalar",
  cirurgia: "Descrição cirúrgica",
  exame: "Resultado de exame",
  "quimio-liberacao": "Liberação da quimioterapia",
  "quimio-aplicacao": "Aplicação da quimioterapia",
  parecer: "Parecer",
};

export function isRecordType(value: unknown): value is RecordType {
  return typeof value === "string" && (RECORD_TYPES as readonly string[]).includes(value);
}

// Um registro pronto para assinar: o PDF (sem o selo) e por onde voltar.
export type HospitalRecord = {
  type: RecordType;
  key: string;
  patientId: string;
  patientName: string;
  when: Date;
  label: string;
  href: string;
  input: PdfInput;
  hash: string;
};

type Scope = { since: Date; key?: string };
type Signer = Pick<CurrentUser, "id" | "clinicId" | "name" | "sex" | "jobTitle" | "councilType" | "councilNumber" | "councilUf" | "rqe" | "specialty"> & { clinic: { name: string } };

// Resumo do conteúdo: o que está no PDF, sem o selo. Muda quando o registro muda.
export function recordHash(input: Pick<PdfInput, "title" | "info" | "sections">) {
  return createHash("sha256").update(JSON.stringify([input.title, input.info, input.sections])).digest("hex");
}

function make(user: Signer, r: Omit<HospitalRecord, "input" | "hash">, title: string, info: string[], sections: PdfSection[], place: string, patient: Patient): HospitalRecord {
  const input: PdfInput = {
    clinicName: user.clinic.name,
    title,
    info: [...patientLines(patient), ...info],
    sections,
    professional: { name: displayName(user), council: councilLabel(user), specialty: user.specialty },
    place,
  };
  return { ...r, input, hash: recordHash(input) };
}

const name = (p: { name: string; socialName: string | null }) => p.socialName || p.name;
const day = (d: Date) => formatDate(d);
const parts = (key: string | undefined, n: number) => {
  const p = key?.split(":") ?? [];
  return p.length === n ? p : null;
};

// ---------------- Prescrição do dia ----------------
// chave: internacao|ps : id : 2026-10-31 : médico
async function prescriptions(user: Signer, scope: Scope): Promise<HospitalRecord[]> {
  const k = parts(scope.key, 4);
  if (scope.key && (!k || k[3] !== user.id)) return [];
  const ctx: Prisma.PrescriptionItemWhereInput = k ? (k[0] === "internacao" ? { admissionId: k[1] } : { emergencyVisitId: k[1] }) : {};
  const items = await prisma.prescriptionItem.findMany({
    where: { clinicId: user.clinicId, prescriberId: user.id, ...ctx, ...(k ? {} : { createdAt: { gte: scope.since } }) },
    include: { patient: true },
    orderBy: { createdAt: "asc" },
  });
  const groups = new Map<string, typeof items>();
  for (const i of items) {
    const ctxKey = i.admissionId ? `internacao:${i.admissionId}` : `ps:${i.emergencyVisitId}`;
    const key = `${ctxKey}:${dayKey(prescriptionDayOf(i))}:${user.id}`;
    if (scope.key && key !== scope.key) continue;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups].map(([key, list]) => {
    const [kind, id, dk] = key.split(":");
    const first = list[0];
    const midnight = prescriptionDayOf(first);
    const lines = list.map((i, n) => {
      const main = [i.description, i.dose, i.route, frequencyLabel(i)].filter(Boolean).join(" · ");
      const extra = [
        `${kindLabel[i.kind]} · início ${formatDateTime(i.startAt)}${i.endAt ? ` · vale até ${formatDateTime(i.endAt)}` : ""}`,
        i.note && `Obs.: ${i.note}`,
        i.suspendedAt && `SUSPENSO em ${formatDateTime(i.suspendedAt)}: ${i.suspendReason ?? ""}`,
      ].filter(Boolean);
      return `${n + 1}. ${main}\n   ${extra.join("\n   ")}`;
    });
    return make(
      user,
      {
        type: "prescricao",
        key,
        patientId: first.patientId,
        patientName: name(first.patient),
        when: midnight,
        label: `Prescrição de ${day(midnight)} (${list.length} ${list.length === 1 ? "item" : "itens"})`,
        href: kind === "internacao" ? `/internacao/${id}/prescricao?dia=${dk}` : `/pronto-socorro/${id}`,
      },
      `Prescrição médica de ${day(midnight)}`,
      [kind === "internacao" ? "Internação" : "Pronto-socorro"],
      [{ text: lines.join("\n\n") }],
      `Prescrição do dia ${day(midnight)}`,
      first.patient,
    );
  });
}

// ---------------- Enfermagem do dia ----------------
// chave: internacao|ps : id : 2026-10-31 : profissional. Checagens, sinais vitais e balanço do dia.
async function nursing(user: Signer, scope: Scope): Promise<HospitalRecord[]> {
  const k = parts(scope.key, 4);
  if (scope.key && (!k || k[3] !== user.id)) return [];
  let from = scope.since;
  let to: Date | undefined;
  if (k) {
    from = new Date(`${k[2]}T03:00:00.000Z`);
    to = new Date(from.getTime() + 24 * 3600_000);
  }
  const range = { gte: from, ...(to && { lt: to }) };
  const itemCtx: Prisma.PrescriptionItemWhereInput = k ? (k[0] === "internacao" ? { admissionId: k[1] } : { emergencyVisitId: k[1] }) : {};
  const admissionId = k?.[0] === "internacao" ? k[1] : undefined;
  const skipAdmissionRecords = k?.[0] === "ps";
  const [checks, vitals, fluids] = await Promise.all([
    prisma.medicationCheck.findMany({
      where: { clinicId: user.clinicId, recordedById: user.id, at: range, item: itemCtx },
      include: { item: { include: { patient: true } } },
      orderBy: { at: "asc" },
    }),
    // Sinais vitais e balanço só existem na internação.
    prisma.vitalRecord.findMany({
      where: { clinicId: user.clinicId, recordedById: user.id, takenAt: range, ...(admissionId && { admissionId }), ...(skipAdmissionRecords && { id: "" }) },
      include: { admission: { include: { patient: true } } },
      orderBy: { takenAt: "asc" },
    }),
    prisma.fluidEntry.findMany({
      where: { clinicId: user.clinicId, recordedById: user.id, at: range, ...(admissionId && { admissionId }), ...(skipAdmissionRecords && { id: "" }) },
      include: { admission: { include: { patient: true } } },
      orderBy: { at: "asc" },
    }),
  ]);
  type Group = { patient: Patient; ctx: string; midnight: Date; checks: typeof checks; vitals: typeof vitals; fluids: typeof fluids };
  const groups = new Map<string, Group>();
  const group = (ctx: string, at: Date, patient: Patient) => {
    const midnight = localMidnight(at);
    const key = `${ctx}:${dayKey(midnight)}:${user.id}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { patient, ctx, midnight, checks: [], vitals: [], fluids: [] }));
    return g;
  };
  for (const c of checks) group(c.item.admissionId ? `internacao:${c.item.admissionId}` : `ps:${c.item.emergencyVisitId}`, c.at, c.item.patient).checks.push(c);
  for (const v of vitals) group(`internacao:${v.admissionId}`, v.takenAt, v.admission.patient).vitals.push(v);
  for (const f of fluids) group(`internacao:${f.admissionId}`, f.at, f.admission.patient).fluids.push(f);

  return [...groups]
    .filter(([key]) => !scope.key || key === scope.key)
    .map(([key, g]) => {
      const [kind, id] = g.ctx.split(":");
      const canceled = (x: { canceledAt: Date | null; cancelReason: string | null }) => (x.canceledAt ? ` [ANULADO em ${formatDateTime(x.canceledAt)}: ${x.cancelReason ?? ""}]` : "");
      const sections: PdfSection[] = [];
      if (g.checks.length)
        sections.push({
          title: "Checagem da prescrição",
          text: g.checks
            .map((c) => `${formatTime(c.scheduledAt ?? c.at)} · ${c.item.description}${c.item.dose ? ` ${c.item.dose}` : ""} · ${c.status === "FEITO" ? "FEITO" : "NÃO FEITO"} às ${formatTime(c.at)}${c.note ? ` · ${c.note}` : ""}${canceled(c)}`)
            .join("\n"),
        });
      if (g.vitals.length)
        sections.push({
          title: "Sinais vitais",
          text: g.vitals
            .map((v) => `${formatTime(v.takenAt)} · ${vitalsSummary(v.vitals as Vitals) || "—"}${v.pain !== null ? ` · dor ${v.pain}/10` : ""}${v.note ? ` · ${v.note}` : ""}${canceled(v)}`)
            .join("\n"),
        });
      if (g.fluids.length)
        sections.push({
          title: "Balanço hídrico",
          text: g.fluids
            .map((f) => `${formatTime(f.at)} · ${f.direction === "ENTRADA" ? "Entrada" : "Saída"} · ${f.kind} · ${f.volumeMl} mL${f.note ? ` · ${f.note}` : ""}${canceled(f)}`)
            .join("\n"),
        });
      const count = g.checks.length + g.vitals.length + g.fluids.length;
      return make(
        user,
        {
          type: "enfermagem",
          key,
          patientId: g.patient.id,
          patientName: name(g.patient),
          when: g.midnight,
          label: `Enfermagem de ${day(g.midnight)} (${count} ${count === 1 ? "registro" : "registros"})`,
          href: kind === "internacao" ? `/internacao/${id}/prescricao?dia=${dayKey(g.midnight)}` : `/pronto-socorro/${id}`,
        },
        `Registros de enfermagem de ${day(g.midnight)}`,
        [kind === "internacao" ? "Internação" : "Pronto-socorro"],
        sections,
        `Registros de ${day(g.midnight)}`,
        g.patient,
      );
    });
}

// ---------------- Triagem ----------------
async function triages(user: Signer, scope: Scope): Promise<HospitalRecord[]> {
  const visits = await prisma.emergencyVisit.findMany({
    where: { clinicId: user.clinicId, triagedById: user.id, triagedAt: scope.key ? { not: null } : { gte: scope.since }, ...(scope.key && { id: scope.key }) },
    include: { patient: true },
  });
  return visits.map((v) =>
    make(
      user,
      { type: "triagem", key: v.id, patientId: v.patientId, patientName: name(v.patient), when: v.triagedAt!, label: `Triagem de ${formatDateTime(v.triagedAt)}`, href: `/pronto-socorro/${v.id}` },
      "Triagem — classificação de risco",
      [`Chegada: ${formatDateTime(v.arrivedAt)}${v.arrivalMode ? ` · ${v.arrivalMode}` : ""}`],
      [
        { title: "Classificação", text: v.risk ? `${riskInfo(v.risk).label} — ${riskInfo(v.risk).meaning}` : "—" },
        { title: "Queixa", text: v.complaint },
        { title: "Sinais vitais", text: `${vitalsSummary(v.triageVitals as Vitals) || "—"}${v.pain !== null ? ` · dor ${v.pain}/10` : ""}` },
        ...(v.triageNote ? [{ title: "Observação", text: v.triageNote }] : []),
      ],
      `Triagem em ${formatDateTime(v.triagedAt)}`,
      v.patient,
    ),
  );
}

// ---------------- Alta ----------------
async function discharges(user: Signer, scope: Scope): Promise<HospitalRecord[]> {
  const list = await prisma.admission.findMany({
    where: { clinicId: user.clinicId, dischargedById: user.id, dischargedAt: scope.key ? { not: null } : { gte: scope.since }, ...(scope.key && { id: scope.key }) },
    include: { patient: true },
  });
  return list.map((a) =>
    make(
      user,
      { type: "alta", key: a.id, patientId: a.patientId, patientName: name(a.patient), when: a.dischargedAt!, label: `Alta de ${formatDateTime(a.dischargedAt)}`, href: `/internacao/${a.id}` },
      "Alta hospitalar",
      [`Internação: ${formatDateTime(a.admittedAt)} · Alta: ${formatDateTime(a.dischargedAt)}`],
      [
        { title: "Tipo de alta", text: a.dischargeKind ? dischargeKindLabel[a.dischargeKind] : "—" },
        ...(a.reason ? [{ title: "Motivo da internação", text: a.reason }] : []),
        ...(a.cidCode ? [{ title: "CID", text: `${a.cidCode} ${a.cidDescription ?? ""}`.trim() }] : []),
        ...(a.dischargeNote ? [{ title: "Resumo e orientações", text: a.dischargeNote }] : []),
      ],
      `Alta em ${formatDateTime(a.dischargedAt)}`,
      a.patient,
    ),
  );
}

// ---------------- Cirurgia ----------------
async function surgeries(user: Signer, scope: Scope): Promise<HospitalRecord[]> {
  const list = await prisma.surgery.findMany({
    where: { clinicId: user.clinicId, surgeonId: user.id, status: "REALIZADA", ...(scope.key ? { id: scope.key } : { endAt: { gte: scope.since } }) },
    include: { patient: true, room: true, anesthetist: true },
  });
  return list.map((s) =>
    make(
      user,
      { type: "cirurgia", key: s.id, patientId: s.patientId, patientName: name(s.patient), when: s.endAt ?? s.scheduledAt, label: `${s.procedure} (${formatDate(s.scheduledAt)})`, href: `/centro-cirurgico/${s.id}` },
      "Descrição cirúrgica",
      [`Sala: ${s.room.name}${s.anesthetist ? ` · Anestesista: ${displayName(s.anesthetist)}` : ""}`],
      [
        { title: "Procedimento", text: `${s.procedure}${s.laterality ? ` · ${s.laterality}` : ""}${s.anesthesia ? ` · Anestesia: ${anesthesiaLabel[s.anesthesia]}` : ""}` },
        {
          title: "Tempos",
          text: [
            s.patientInAt && `Entrada em sala: ${formatDateTime(s.patientInAt)}`,
            s.anesthesiaAt && `Anestesia: ${formatDateTime(s.anesthesiaAt)}`,
            s.incisionAt && `Incisão: ${formatDateTime(s.incisionAt)}`,
            s.endAt && `Fim da cirurgia: ${formatDateTime(s.endAt)}`,
            s.patientOutAt && `Saída de sala: ${formatDateTime(s.patientOutAt)}`,
          ].filter(Boolean).join("\n") || "—",
        },
        { title: "Descrição", text: s.operativeNote || "—" },
      ],
      `Cirurgia em ${formatDateTime(s.endAt ?? s.scheduledAt)}`,
      s.patient,
    ),
  );
}

// ---------------- Resultado de exame ----------------
async function exams(user: Signer, scope: Scope): Promise<HospitalRecord[]> {
  const list = await prisma.examRequest.findMany({
    where: { clinicId: user.clinicId, resultById: user.id, status: "LAUDADO", ...(scope.key ? { id: scope.key } : { resultAt: { gte: scope.since } }) },
    include: { patient: true, examType: true },
  });
  return list.map((e) => {
    const values = asValues(e.values);
    return make(
      user,
      {
        type: "exame",
        key: e.id,
        patientId: e.patientId,
        patientName: name(e.patient),
        when: e.resultAt ?? e.createdAt,
        label: `${e.examType.name} (${formatDate(e.resultAt)})`,
        href: e.examType.sector === "IMAGEM" ? "/imagem" : "/laboratorio",
      },
      `Resultado: ${e.examType.name}`,
      [`Pedido em ${formatDateTime(e.createdAt)}${e.collectedAt ? ` · Coleta/realização: ${formatDateTime(e.collectedAt)}` : ""}`],
      [
        ...(values.length
          ? [{ title: "Resultado", text: values.map((v) => `${v.name}: ${v.value} ${v.unit}${referenceLabel(v) ? ` (ref. ${referenceLabel(v)})` : ""}${flag(v) ? ` ${flag(v)}` : ""}`).join("\n") }]
          : []),
        ...(e.report ? [{ title: "Laudo", text: e.report }] : []),
        ...(e.criticalNote ? [{ title: "Valor crítico comunicado", text: e.criticalNote }] : []),
      ],
      `Resultado liberado em ${formatDateTime(e.resultAt)}`,
      e.patient,
    );
  });
}

// ---------------- Quimioterapia ----------------
async function chemo(user: Signer, scope: Scope, step: "liberacao" | "aplicacao"): Promise<HospitalRecord[]> {
  const who: Prisma.ChemoSessionWhereInput =
    step === "liberacao"
      ? { releasedById: user.id, releasedAt: scope.key ? { not: null } : { gte: scope.since } }
      : { administeredById: user.id, administeredAt: scope.key ? { not: null } : { gte: scope.since } };
  const list = await prisma.chemoSession.findMany({
    where: { clinicId: user.clinicId, ...who, ...(scope.key && { id: scope.key }) },
    include: { patient: true, plan: { include: { protocol: true } } },
  });
  const type = step === "liberacao" ? "quimio-liberacao" : "quimio-aplicacao";
  return list.map((s) => {
    const at = (step === "liberacao" ? s.releasedAt : s.administeredAt)!;
    return make(
      user,
      { type, key: s.id, patientId: s.patientId, patientName: name(s.patient), when: at, label: `${s.plan.protocol.name} · ciclo ${s.cycle}, dia ${s.day}`, href: `/quimioterapia/${s.planId}` },
      step === "liberacao" ? "Liberação da quimioterapia" : "Aplicação da quimioterapia",
      [`Protocolo: ${s.plan.protocol.name} · Ciclo ${s.cycle}, dia ${s.day} · ${formatDate(s.date)}`],
      [
        { title: "Doses", text: sessionDoses(s.doses).map((d) => `${d.drug}: ${d.dose} ${d.doseUnit} (${d.prescribed}) · ${d.route}`).join("\n") || "—" },
        ...(s.note ? [{ title: "Observação", text: s.note }] : []),
      ],
      `${step === "liberacao" ? "Liberada" : "Aplicada"} em ${formatDateTime(at)}`,
      s.patient,
    );
  });
}

// ---------------- Parecer ----------------
async function consults(user: Signer, scope: Scope): Promise<HospitalRecord[]> {
  const list = await prisma.consultRequest.findMany({
    where: { clinicId: user.clinicId, answeredById: user.id, ...(scope.key ? { id: scope.key, answeredAt: { not: null } } : { answeredAt: { gte: scope.since } }) },
    include: { patient: true, requestedBy: true },
  });
  return list.map((c) =>
    make(
      user,
      { type: "parecer", key: c.id, patientId: c.patientId, patientName: name(c.patient), when: c.answeredAt!, label: `Parecer de ${c.specialty}`, href: `/internacao/${c.admissionId}/pareceres` },
      `Parecer — ${c.specialty}`,
      [`Pedido por ${displayName(c.requestedBy)} em ${formatDateTime(c.createdAt)}`],
      [
        { title: "Pergunta", text: c.question },
        { title: "Resposta", text: c.answer ?? "—" },
      ],
      `Respondido em ${formatDateTime(c.answeredAt)}`,
      c.patient,
    ),
  );
}

function collect(user: Signer, type: RecordType, scope: Scope) {
  switch (type) {
    case "prescricao": return prescriptions(user, scope);
    case "enfermagem": return nursing(user, scope);
    case "triagem": return triages(user, scope);
    case "alta": return discharges(user, scope);
    case "cirurgia": return surgeries(user, scope);
    case "exame": return exams(user, scope);
    case "quimio-liberacao": return chemo(user, scope, "liberacao");
    case "quimio-aplicacao": return chemo(user, scope, "aplicacao");
    case "parecer": return consults(user, scope);
  }
}

// Um registro, para assinar. Só acha se quem pede for o autor.
export async function loadHospitalRecord(user: Signer, type: RecordType, key: string) {
  const [record] = await collect(user, type, { since: new Date(0), key });
  return record ?? null;
}

// Já está assinado como está agora?
export async function isRecordSigned(clinicId: string, r: Pick<HospitalRecord, "type" | "key" | "hash">) {
  return !!(await prisma.signedPdf.findFirst({ where: { clinicId, recordType: r.type, recordKey: r.key, recordHash: r.hash }, select: { id: true } }));
}

// O que o profissional fez nos últimos dias e ainda não assinou (ou mudou depois de assinado).
export async function pendingHospitalRecords(user: Signer, days = 30) {
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const all = (await Promise.all(RECORD_TYPES.map((t) => collect(user, t, { since })))).flat();
  if (all.length === 0) return [];
  const signed = await prisma.signedPdf.findMany({
    where: { clinicId: user.clinicId, signerId: user.id, recordType: { not: null }, recordHash: { in: all.map((r) => r.hash) } },
    select: { recordType: true, recordKey: true, recordHash: true },
  });
  const done = new Set(signed.map((s) => `${s.recordType}|${s.recordKey}|${s.recordHash}`));
  return all.filter((r) => !done.has(`${r.type}|${r.key}|${r.hash}`)).sort((a, b) => b.when.getTime() - a.when.getTime());
}

// Quem é o autor do registro (para gerar o PDF dele mesmo quando outra pessoa pede para ver).
export async function recordAuthorId(clinicId: string, type: RecordType, key: string): Promise<string | null> {
  switch (type) {
    case "prescricao":
    case "enfermagem":
      return key.split(":")[3] ?? null;
    case "triagem": return (await prisma.emergencyVisit.findFirst({ where: { id: key, clinicId }, select: { triagedById: true } }))?.triagedById ?? null;
    case "alta": return (await prisma.admission.findFirst({ where: { id: key, clinicId }, select: { dischargedById: true } }))?.dischargedById ?? null;
    case "cirurgia": return (await prisma.surgery.findFirst({ where: { id: key, clinicId }, select: { surgeonId: true } }))?.surgeonId ?? null;
    case "exame": return (await prisma.examRequest.findFirst({ where: { id: key, clinicId }, select: { resultById: true } }))?.resultById ?? null;
    case "quimio-liberacao": return (await prisma.chemoSession.findFirst({ where: { id: key, clinicId }, select: { releasedById: true } }))?.releasedById ?? null;
    case "quimio-aplicacao": return (await prisma.chemoSession.findFirst({ where: { id: key, clinicId }, select: { administeredById: true } }))?.administeredById ?? null;
    case "parecer": return (await prisma.consultRequest.findFirst({ where: { id: key, clinicId }, select: { answeredById: true } }))?.answeredById ?? null;
  }
}

// O registro como o autor o vê, para quem tem acesso gerar o PDF.
export async function loadHospitalRecordForViewer(clinicId: string, type: RecordType, key: string) {
  const authorId = await recordAuthorId(clinicId, type, key);
  if (!authorId) return null;
  const author = await prisma.user.findFirst({ where: { id: authorId, clinicId }, include: { clinic: true } });
  return author ? loadHospitalRecord(author, type, key) : null;
}
