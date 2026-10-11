import { Avatar, AvatarFallback, AvatarImage } from "@repo/design-system";

const portrait =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#46734A"/><circle cx="32" cy="25" r="11" fill="#dfe8dc"/><path d="M12 60c2-12 10-18 20-18s18 6 20 18z" fill="#dfe8dc"/></svg>'
  );

export const Fallback = () => (
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarFallback>PS</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>TN</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>GW</AvatarFallback>
    </Avatar>
  </div>
);

export const WithImage = () => (
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarImage alt="Priya Shah" src={portrait} />
      <AvatarFallback>PS</AvatarFallback>
    </Avatar>
    <Avatar className="size-10">
      <AvatarImage alt="Priya Shah" src={portrait} />
      <AvatarFallback>PS</AvatarFallback>
    </Avatar>
    <Avatar style={{ width: 48, height: 48 }}>
      <AvatarImage alt="Priya Shah" src={portrait} />
      <AvatarFallback>PS</AvatarFallback>
    </Avatar>
  </div>
);

export const Stacked = () => (
  <div className="flex items-center gap-3">
    <div className="flex">
      {["PS", "TN", "GW", "LO"].map((initials, i) => (
        <Avatar
          className="ring-background ring-2"
          key={initials}
          style={{ marginLeft: i === 0 ? 0 : -6 }}
        >
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      ))}
    </div>
    <span className="text-muted-foreground text-sm">4 people away this week</span>
  </div>
);

export const WithName = () => (
  <div className="flex items-center gap-3">
    <Avatar className="size-10">
      <AvatarFallback>GW</AvatarFallback>
    </Avatar>
    <div className="flex flex-col">
      <span className="text-sm font-medium">Grace Walker</span>
      <span className="text-muted-foreground text-xs">Operations, Melbourne</span>
    </div>
  </div>
);
