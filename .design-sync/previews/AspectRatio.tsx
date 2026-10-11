import { AspectRatio } from "@repo/design-system";

export const Widescreen = () => (
  <div style={{ width: 400 }}>
    <AspectRatio ratio={16 / 9}>
      <div
        className="flex size-full flex-col justify-end rounded-xl p-5 text-white"
        style={{
          background:
            "linear-gradient(135deg, #46734A 0%, #2f5233 60%, #1f3a22 100%)",
        }}
      >
        <span className="font-semibold text-title-md">Team Calendar</span>
        <span className="text-sm" style={{ opacity: 0.85 }}>
          Leave and availability, published everywhere
        </span>
      </div>
    </AspectRatio>
  </div>
);

export const Square = () => (
  <div style={{ width: 200 }}>
    <AspectRatio ratio={1}>
      <div className="flex size-full flex-col items-center justify-center gap-1 rounded-xl bg-surface-container-high">
        <span className="font-semibold text-headline-md">14</span>
        <span className="text-muted-foreground text-sm">people away today</span>
      </div>
    </AspectRatio>
  </div>
);
