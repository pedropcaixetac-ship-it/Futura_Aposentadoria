import { prisma } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatDateTime } from "@/lib/format";
import { NOTICE_AUDIENCES, NOTICE_KINDS, noticeKind, noticeState, type NoticeAudience } from "@/lib/avisos";
import { ActionForm } from "@/app/(app)/financeiro/action-form";
import { createNotice, endNotice } from "./actions";

const stateLabel = {
  "no-ar": { text: "No ar", style: "bg-emerald-100 text-emerald-700" },
  agendado: { text: "Agendado", style: "bg-dourado-100 text-dourado-700" },
  encerrado: { text: "Encerrado", style: "bg-slate-100 text-slate-600" },
};

// Avisos para as clínicas: aparecem no alto do sistema até a pessoa clicar em "Entendi" ou o aviso sair do ar.
export default async function PlatformNoticesPage() {
  await requirePlatformUser();
  const [notices, clinics] = await Promise.all([
    prisma.platformNotice.findMany({
      include: { clinic: { select: { name: true } }, createdBy: { select: { name: true } }, _count: { select: { dismissals: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.clinic.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-marinho-800">Avisos para as instituições</h1>
        <p className="text-sm text-slate-600">
          O aviso aparece no alto do sistema de cada pessoa da instituição até ela clicar em &quot;Entendi&quot; ou até a data de fim.
          Use para manutenção programada, novidades do sistema ou recados importantes.
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">Novo aviso</h2>
        <ActionForm action={createNotice} submitLabel="Publicar aviso" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <div>
              <label className="label" htmlFor="title">Título</label>
              <input className="input" id="title" name="title" required maxLength={120} placeholder="Ex.: Manutenção no domingo às 22h" />
            </div>
            <div>
              <label className="label" htmlFor="kind">Tipo</label>
              <select className="input" id="kind" name="kind" defaultValue="info">
                {Object.entries(NOTICE_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="body">Texto</label>
            <textarea className="input min-h-24" id="body" name="body" required maxLength={1000} placeholder="O sistema ficará fora do ar das 22h às 23h para melhorias." />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="clinicId">Para qual instituição</label>
              <select className="input" id="clinicId" name="clinicId" defaultValue="">
                <option value="">Todas as instituições</option>
                {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="audience">Quem vê</label>
              <select className="input" id="audience" name="audience" defaultValue="todos">
                {Object.entries(NOTICE_AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="startsAt">A partir de</label>
              <input className="input" id="startsAt" name="startsAt" type="date" />
              <p className="mt-1 text-xs text-slate-500">Vazio = agora</p>
            </div>
            <div>
              <label className="label" htmlFor="endsAt">Até</label>
              <input className="input" id="endsAt" name="endsAt" type="date" />
              <p className="mt-1 text-xs text-slate-500">Vazio = até cada um fechar</p>
            </div>
          </div>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-marinho-800">Avisos publicados</h2>
        {notices.length === 0 && <p className="text-sm text-slate-500">Nenhum aviso ainda.</p>}
        {notices.map((n) => {
          const state = noticeState(n);
          return (
            <article key={n.id} className="card space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs ${noticeKind(n.kind).style}`}>{noticeKind(n.kind).label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${stateLabel[state].style}`}>{stateLabel[state].text}</span>
                <h3 className="font-semibold text-marinho-800">{n.title}</h3>
              </div>
              <p className="whitespace-pre-line text-sm text-slate-700">{n.body}</p>
              <p className="text-xs text-slate-500">
                {n.clinic?.name ?? "Todas as instituições"} · {NOTICE_AUDIENCES[n.audience as NoticeAudience] ?? n.audience} ·
                de {formatDateTime(n.startsAt)} {n.endsAt ? `até ${formatDateTime(n.endsAt)}` : "sem data de fim"} ·
                por {n.createdBy.name} · {n._count.dismissals} pessoa{n._count.dismissals === 1 ? "" : "s"} já leu
              </p>
              {state !== "encerrado" && (
                <form action={endNotice.bind(null, n.id)}>
                  <button className="text-sm text-red-700 hover:underline">Tirar do ar agora</button>
                </form>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
