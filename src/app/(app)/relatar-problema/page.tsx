import { requireUser } from "@/lib/auth";
import { cleanPage } from "@/lib/problems";
import { ReportForm } from "./report-form";

// Qualquer pessoa da clínica pode relatar um problema. "de" é a tela em que ela estava
// e "codigo" é o código mostrado na tela de erro, quando houver.
export default async function ReportProblemPage({ searchParams }: { searchParams: Promise<{ de?: string; codigo?: string }> }) {
  await requireUser();
  const { de, codigo } = await searchParams;
  const page = cleanPage(de) ?? "";
  const digest = (codigo ?? "").replace(/[^\w-]/g, "").slice(0, 64);
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Relatar problema</h1>
        <p className="text-sm text-slate-500">Algo não funcionou como deveria? Conte aqui. O relato chega direto para o suporte do sistema.</p>
      </div>
      <ReportForm page={page === "/relatar-problema" ? "" : page} digest={digest} />
    </div>
  );
}
