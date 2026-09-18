import { Header } from "../components/header";

const SKELETON_DAYS = Array.from(
  { length: 21 },
  (_, index) => `calendar-loading-day-${index + 1}`
);

export default function CalendarLoading() {
  return (
    <>
      <Header page="Calendar" />
      <div
        aria-label="Loading calendar"
        aria-live="polite"
        className="flex flex-1 flex-col gap-6 p-6 pt-0"
        role="status"
      >
        <div className="h-28 animate-pulse rounded-[20px] bg-muted" />
        <div className="grid grid-cols-1 gap-2 rounded-[20px] bg-muted p-4 sm:grid-cols-7">
          {SKELETON_DAYS.map((day) => (
            <div
              className="h-20 animate-pulse rounded-xl bg-background"
              key={day}
            />
          ))}
        </div>
        <span className="sr-only">Loading calendar</span>
      </div>
    </>
  );
}
