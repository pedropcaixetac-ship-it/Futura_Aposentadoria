import Link from "next/link";
import { ActionForm } from "../../../financeiro/action-form";
import { saveEmployee } from "../../actions";
import { EmployeeFields } from "../employee-fields";

export default function NewEmployeePage() {
  return (
    <div className="space-y-4">
      <Link href="/contabilidade/funcionarios" className="text-sm text-marinho-700 hover:underline">← Funcionários</Link>
      <ActionForm action={saveEmployee.bind(null, null)} submitLabel="Cadastrar funcionário" className="card space-y-6">
        <EmployeeFields />
      </ActionForm>
    </div>
  );
}
