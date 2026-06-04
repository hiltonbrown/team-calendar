import { InterceptingModalShell } from "@/components/modals/intercepting-modal-shell";
import { RecordForm } from "../../record-form";
import { loadPlanFormData } from "../../record-form-data";

interface NewRecordModalPageProps {
  searchParams: Promise<{ org?: string; personId?: string; startsAt?: string }>;
}

const NewRecordModalPage = async ({
  searchParams,
}: NewRecordModalPageProps) => {
  const { org, personId, startsAt } = await searchParams;
  const data = await loadPlanFormData({ org, personId, startsAt });

  return (
    <InterceptingModalShell size="default" title="New plan">
      <RecordForm mode="create" {...data} />
    </InterceptingModalShell>
  );
};

export default NewRecordModalPage;
