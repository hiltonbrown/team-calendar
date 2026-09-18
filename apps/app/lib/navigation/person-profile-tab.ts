export type PersonProfileTab =
  | "alternative_contacts"
  | "balances"
  | "history"
  | "upcoming";

export function parsePersonProfileTab(
  value: string | string[] | undefined
): PersonProfileTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === "alternative_contacts") {
    return candidate;
  }
  if (candidate === "balances") {
    return candidate;
  }
  if (candidate === "history") {
    return candidate;
  }
  return "upcoming";
}
