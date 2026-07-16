/**
 * Lightweight decoupling between the header trigger and the globally-mounted
 * command palette. The trigger dispatches this event; the palette listens for
 * it, so neither needs a shared context provider.
 */
export const COMMAND_MENU_OPEN_EVENT = "command-menu:open";

export function openCommandMenu(): void {
  window.dispatchEvent(new Event(COMMAND_MENU_OPEN_EVENT));
}
