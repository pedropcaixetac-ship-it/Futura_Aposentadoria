import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { saveStaff } from "../actions";
import { StaffForm } from "../staff-form";

export default async function NewStaffPage() {
  await requireUser("servidores");
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href="/servidores" className="text-sm text-marinho-700 hover:underline">← Cadastro de servidores</Link>
        <h1 className="text-2xl font-semibold">Novo servidor</h1>
      </div>
      <StaffForm action={saveStaff.bind(null, null)} />
    </div>
  );
}
