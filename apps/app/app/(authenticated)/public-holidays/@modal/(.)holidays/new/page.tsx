import { loadNewHolidayFormData } from "../../../holidays/new/form-data";
import { NewHolidayModal } from "../../../holidays/new/new-holiday-modal";

export default async function NewHolidayInterceptPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const data = await loadNewHolidayFormData(org);
  return <NewHolidayModal {...data} />;
}
