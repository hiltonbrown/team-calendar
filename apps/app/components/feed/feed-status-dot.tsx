import { statusToneClasses } from "@/components/availability/availability-status";

export type FeedStatus = "active" | "archived" | "paused";

export function FeedStatusDot({ status }: { status: FeedStatus }) {
  let colour = statusToneClasses.private;
  if (status === "active") {
    colour = "bg-success text-success ring-success/30";
  } else if (status === "paused") {
    colour = "bg-warning-container text-on-warning-container ring-warning/30";
  }
  return (
    <span className="flex items-center gap-2 text-label-lg capitalize">
      <span className={`size-2 rounded-full ring-2 ${colour}`} />
      {status}
    </span>
  );
}
