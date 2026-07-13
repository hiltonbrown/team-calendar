import { Toggle } from "@repo/design-system/components/ui/toggle";
import { PinIcon, StarIcon } from "lucide-react";

export const PinnedFeed = () => (
  <Toggle aria-label="Pin this feed" defaultPressed>
    <PinIcon />
    Pinned
  </Toggle>
);

export const PressedStateSweep = () => (
  <div className="flex items-center gap-3">
    <Toggle aria-label="Star this person">
      <StarIcon />
      Unpressed
    </Toggle>
    <Toggle aria-label="Star this person" defaultPressed>
      <StarIcon />
      Pressed
    </Toggle>
    <Toggle aria-label="Star this person" disabled>
      <StarIcon />
      Disabled
    </Toggle>
  </div>
);

export const OutlineVariant = () => (
  <div className="flex items-center gap-3">
    <Toggle aria-label="Pin this feed" variant="outline">
      <PinIcon />
      Pin feed
    </Toggle>
    <Toggle aria-label="Pin this feed" defaultPressed variant="outline">
      <PinIcon />
      Pin feed
    </Toggle>
  </div>
);
