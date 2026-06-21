export const LoadingState = () => (
  <div
    aria-label="Loading workspace"
    className="w-full space-y-4 p-2"
    role="status"
  >
    <p className="sr-only">Loading workspace</p>
    <div className="h-24 animate-pulse rounded-2xl bg-muted" />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {["one", "two", "three", "four", "five", "six"].map((item) => (
        <div className="space-y-3 rounded-2xl bg-muted p-4" key={item}>
          <div className="h-4 w-2/5 rounded-xl bg-background" />
          <div className="h-8 w-3/5 rounded-xl bg-background" />
          <div className="h-3 w-full rounded-xl bg-background" />
          <div className="h-3 w-4/5 rounded-xl bg-background" />
        </div>
      ))}
    </div>
  </div>
);
