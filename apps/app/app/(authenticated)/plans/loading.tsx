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
        <div className="h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-28 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="space-y-3 rounded-xl bg-muted p-3">
          {PLAN_ROWS.map((row) => (
            <div
              className="h-36 animate-pulse rounded-xl bg-background motion-reduce:animate-none xl:h-16"
              key={row}
            />
          ))}
        </div>
        <span className="sr-only">Loading plans</span>
      </div>
    </>
  );
}
