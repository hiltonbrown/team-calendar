import { loadNewHolidayFormData } from "./form-data";
import { NewHolidayModal } from "./new-holiday-modal";

export default async function NewHolidayPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const data = await loadNewHolidayFormData(org);
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <NewHolidayModal {...data} />
      </div>
    </div>
  );
}
