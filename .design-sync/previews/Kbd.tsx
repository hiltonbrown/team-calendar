import { Kbd, KbdGroup } from "@repo/design-system/components/ui/kbd";

export const Default = () => (
  <div className="flex flex-wrap items-center gap-4">
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
    <span className="text-muted-foreground text-sm">
      Open the command palette
    </span>
  </div>
);

export const SingleKeys = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Kbd>Esc</Kbd>
    <Kbd>Enter</Kbd>
    <Kbd>Tab</Kbd>
  </div>
);

export const Shortcuts = () => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center justify-between gap-6">
      <span className="text-sm">New leave request</span>
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <Kbd>N</Kbd>
      </KbdGroup>
    </div>
    <div className="flex items-center justify-between gap-6">
      <span className="text-sm">Approve selected</span>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>&crarr;</Kbd>
      </KbdGroup>
    </div>
  </div>
);
