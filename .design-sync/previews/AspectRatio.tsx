import { AspectRatio } from "@repo/design-system/components/ui/aspect-ratio";

export const Widescreen = () => (
  <div className="w-80">
    <AspectRatio ratio={16 / 9}>
      <div className="flex size-full items-center justify-center rounded-md bg-primary font-medium text-primary-foreground text-sm">
        Team calendar preview
      </div>
    </AspectRatio>
  </div>
);

export const Square = () => (
  <div className="w-48">
    <AspectRatio ratio={1}>
      <div className="flex size-full items-center justify-center rounded-md bg-muted font-medium text-muted-foreground text-sm">
        Company logo
      </div>
    </AspectRatio>
  </div>
);
