import type { ReactNode } from "react";

// Steps with forms keep the sign-in column width; roster steps widen to the
// full right-hand column on desktop.
export function SetupColumn({
  children,
  width = "narrow",
}: {
  children: ReactNode;
  width?: "narrow" | "wide";
}) {
  return (
    <div
      className={[
        "auth-rise mx-auto flex w-full flex-col gap-8",
        width === "wide" ? "max-w-2xl" : "max-w-[400px]",
      ].join(" ")}
      data-width={width}
    >
      {children}
    </div>
  );
}
