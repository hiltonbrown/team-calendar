import { AsyncLocalStorage } from "node:async_hooks";

const deliveries = new AsyncLocalStorage<Array<() => Promise<void>>>();

export async function deliverInvitationEmail(
  send: () => Promise<void>
): Promise<void> {
  const pending = deliveries.getStore();
  if (pending) {
    pending.push(send);
  } else {
    await send();
  }
}

export function collectInvitationEmails<T>(
  pending: Array<() => Promise<void>>,
  operation: () => Promise<T>
): Promise<T> {
  return deliveries.run(pending, operation);
}

export function isControlledAccountMutation(): boolean {
  return deliveries.getStore() !== undefined;
}
