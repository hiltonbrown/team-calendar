import { Toggle } from "@repo/design-system";
import { Eye, EyeOff, Star } from "lucide-react";

export const Variants = () => (
  <div className="flex items-center gap-3">
    <Toggle aria-label="Show weekends">
      <Eye />
      Show weekends
    </Toggle>
    <Toggle aria-label="Show public holidays" variant="outline">
      <Star />
      Public holidays
    </Toggle>
  </div>
);

export const Pressed = () => (
  <div className="flex items-center gap-3">
    <Toggle aria-label="Hide declined" defaultPressed>
      <EyeOff />
      Hide declined
    </Toggle>
    <Toggle aria-label="My team only" defaultPressed variant="outline">
      My team only
    </Toggle>
  </div>
);

export const Sizes = () => (
  <div className="flex items-center gap-3">
    <Toggle aria-label="Show weekends" defaultPressed size="sm" variant="outline">
      <Eye />
      Small
    </Toggle>
    <Toggle aria-label="Show weekends" defaultPressed variant="outline">
      <Eye />
      Default
    </Toggle>
    <Toggle aria-label="Show weekends" defaultPressed size="lg" variant="outline">
      <Eye />
      Large
    </Toggle>
  </div>
);

export const Disabled = () => (
  <div className="flex items-center gap-3">
    <Toggle aria-label="Show weekends" disabled>
      Show weekends
    </Toggle>
    <Toggle aria-label="My team only" defaultPressed disabled variant="outline">
      My team only
    </Toggle>
  </div>
);
