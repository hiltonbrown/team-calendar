import { Header } from "../../../components/header";
import { RecordForm } from "../../record-form";
import { loadPlanFormData } from "../../record-form-data";

interface EditRecordPageProps {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ org?: string }>;
}

const EditRecordPage = async ({
  params,
  searchParams,
}: EditRecordPageProps) => {
  const { planId } = await params;
  const { org } = await searchParams;
  const data = await loadPlanFormData({ org, recordId: planId });

  return (
    <>
      <Header page="Edit plan" />
      <main className="flex flex-1 flex-col p-6 pt-0">
        <div className="max-w-2xl rounded-2xl bg-muted p-6">
          <RecordForm mode="edit" {...data} />
        </div>
      </main>
    </>
  );
};

export default EditRecordPage;
