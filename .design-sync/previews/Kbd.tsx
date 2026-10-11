import { Button, Kbd, KbdGroup } from "@repo/design-system";
import { Search } from "lucide-react";

export const Keys = () => (
  <div className="flex items-center gap-3">
    <Kbd>A</Kbd>
    <Kbd>D</Kbd>
    <Kbd>Enter</Kbd>
    <Kbd>Esc</Kbd>
  </div>
);

export const Combination = () => (
  <p className="flex items-center gap-2 text-sm text-muted-foreground">
    <span>Open the command menu with</span>
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
    <span>or</span>
    <KbdGroup>
      <Kbd>Ctrl</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  </p>
);

export const ApprovalHints = () => (
  <p className="flex items-center gap-2 text-sm text-muted-foreground">
    <Kbd>A</Kbd>
    <span>approve</span>
    <Kbd>D</Kbd>
    <span>decline</span>
    <Kbd>Enter</Kbd>
    <span>expand</span>
  </p>
);

export const InButton = () => (
  <Button className="w-72" variant="outline">
    <Search />
    <span>Search</span>
    <KbdGroup className="ml-auto">
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  </Button>
);
