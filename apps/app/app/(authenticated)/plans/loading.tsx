import { Header } from "../components/header";

const PLAN_ROWS = ["plan-one", "plan-two", "plan-three"];

export default function PlansLoading() {
  return (
    <>
      <Header page="Plans" />
      <div
        aria-label="Loading plans"
        aria-live="polite"
        className="flex flex-1 flex-col gap-6 p-6 pt-0"
        role="status"
      >
        <div className="h-40 animate-pulse rounded-[20px] bg-muted" />
        <div className="h-28 animate-pulse rounded-[20px] bg-muted" />
        <div className="space-y-3 rounded-[20px] bg-muted p-3">
          {PLAN_ROWS.map((row) => (
            <div
              className="h-36 animate-pulse rounded-[20px] bg-background xl:h-16"
              key={row}
            />
          ))}
        </div>
        <span className="sr-only">Loading plans</span>
      </div>
    </>
  );
}
