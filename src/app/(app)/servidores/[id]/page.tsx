import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { resetTwoFactor, saveStaff } from "../actions";
import { StaffForm } from "../staff-form";
import { displayName, staffEditBlock } from "@/lib/staff";

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("servidores");
  const { id } = await params;
  const staff = await prisma.user.findFirst({ where: { id, clinicId: user.clinicId }, omit: { passwordHash: true, totpSecret: true, totpRecoveryCodes: true } });
  if (!staff) notFound();
  if (staffEditBlock(user, staff)) redirect("/servidores");

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href="/servidores" className="text-sm text-marinho-700 hover:underline">← Cadastro de servidores</Link>
        <h1 className="text-2xl font-semibold">{displayName(staff)}</h1>
      </div>
      {!staff.active && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Desligado{staff.terminatedAt && ` em ${formatDate(staff.terminatedAt)}`}
          {staff.terminationReason && ` (${staff.terminationReason})`}. Sem acesso ao sistema.
        </p>
      )}
      {staff.totpEnabledAt && user.role === "ADMIN" && staff.id !== user.id && (
        <form action={resetTwoFactor.bind(null, staff.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          <span>Verificação em duas etapas ligada. Se a pessoa perdeu o celular e os códigos de recuperação, desligue aqui.</span>
          <button className="btn-secondary">Desligar verificação em duas etapas</button>
        </form>
      )}
      <StaffForm action={saveStaff.bind(null, staff.id)} staff={staff} isSelf={staff.id === user.id} canGrantAdmin={user.role === "ADMIN"} />
    </div>
  );
}
