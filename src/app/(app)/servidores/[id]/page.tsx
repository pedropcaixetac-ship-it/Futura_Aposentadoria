import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { saveStaff } from "../actions";
import { StaffForm } from "../staff-form";

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("servidores");
  const { id } = await params;
  const staff = await prisma.user.findFirst({ where: { id, clinicId: user.clinicId }, omit: { passwordHash: true } });
  if (!staff) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/servidores" className="text-sm text-marinho-700 hover:underline">← Cadastro de servidores</Link>
        <h1 className="text-2xl font-semibold">{staff.name}</h1>
      </div>
      {!staff.active && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Desligado{staff.terminatedAt && ` em ${formatDate(staff.terminatedAt)}`}
          {staff.terminationReason && ` (${staff.terminationReason})`}. Sem acesso ao sistema.
        </p>
      )}
      <StaffForm action={saveStaff.bind(null, staff.id)} staff={staff} isSelf={staff.id === user.id} />
    </div>
  );
}
