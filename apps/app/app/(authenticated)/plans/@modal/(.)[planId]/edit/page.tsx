import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { RecordForm } from "../../../record-form";
import { loadPlanFormData } from "../../../record-form-data";

interface EditRecordModalPageProps {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ org?: string }>;
}

const EditRecordModalPage = async ({
  params,
  searchParams,
}: EditRecordModalPageProps) => {
  const { planId } = await params;
  const { org } = await searchParams;
  const data = await loadPlanFormData({ org, recordId: planId });

  return (
    <InterceptingModalShell size="default" title="Edit plan">
      <RecordForm mode="edit" {...data} />
    </InterceptingModalShell>
  );
};

export default EditRecordModalPage;
