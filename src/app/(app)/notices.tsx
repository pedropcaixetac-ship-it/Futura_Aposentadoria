import { prisma } from "@/lib/db";
import { noticeKind, visibleNoticesWhere } from "@/lib/avisos";
import { dismissNotice } from "./notice-actions";

// Avisos da empresa que vende o sistema (manutenção, novidades), escritos no Painel do dono.
export async function PlatformNotices({ user }: { user: { id: string; clinicId: string; role: string } }) {
  const notices = await prisma.platformNotice.findMany({ where: visibleNoticesWhere(user), orderBy: { startsAt: "desc" }, take: 3 });
  if (notices.length === 0) return null;
  return (
    <div className="no-print mb-4 space-y-2">
      {notices.map((n) => (
        <div key={n.id} className={`flex flex-wrap items-start gap-3 rounded-md border px-3 py-2 text-sm ${noticeKind(n.kind).style}`}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{n.title}</p>
            <p className="whitespace-pre-line">{n.body}</p>
          </div>
          <form action={dismissNotice.bind(null, n.id)}>
            <button className="rounded-md border border-current px-2 py-1 text-xs font-medium hover:bg-white/60">Entendi</button>
          </form>
        </div>
      ))}
    </div>
  );
}
