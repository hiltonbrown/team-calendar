import { Header } from "../../components/header";
import { RecordForm } from "../record-form";
import { loadPlanFormData } from "../record-form-data";

interface NewRecordPageProps {
  searchParams: Promise<{ org?: string; personId?: string; startsAt?: string }>;
}

const NewRecordPage = async ({ searchParams }: NewRecordPageProps) => {
  const { org, personId, startsAt } = await searchParams;
  const data = await loadPlanFormData({ org, personId, startsAt });

  return (
    <>
      <Header page="New record" />
      <main className="flex flex-1 flex-col p-6 pt-0">
        <div className="max-w-2xl rounded-2xl bg-muted p-6">
          <RecordForm mode="create" {...data} />
        </div>
      </main>
    </>
  );
};

export default NewRecordPage;
