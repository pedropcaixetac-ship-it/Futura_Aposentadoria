import { requireUser } from "@/lib/auth";
import { PrescriptionPanel } from "../../../prescricao/panel";
import { CareHeader, CareNav } from "../care-nav";
import { loadAdmissionForCare } from "../care-data";

export default async function AdmissionPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("internacao");
  const { id } = await params;
  const admission = await loadAdmissionForCare(user, id);
  return (
    <div className="max-w-6xl space-y-6">
      <CareHeader admission={admission} />
      <CareNav admissionId={admission.id} current="prescricao" />
      <PrescriptionPanel ctx={{ kind: "internacao", id: admission.id }} user={user} open={!admission.dischargedAt} />
    </div>
  );
}
