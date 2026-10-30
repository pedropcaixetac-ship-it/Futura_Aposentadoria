import Link from "next/link";
import { requirePlatformUser } from "@/lib/painel-auth";
import { ClinicForm } from "../../clinic-form";
import { createClinic } from "../../actions";

export default async function NewClinicPage() {
  await requirePlatformUser();
  return (
    <div className="space-y-4">
      <Link href="/painel" className="text-sm text-marinho-600 hover:underline">← Clínicas</Link>
      <h1 className="text-2xl font-semibold text-marinho-800">Cadastrar clínica</h1>
      <ClinicForm action={createClinic} />
    </div>
  );
}
