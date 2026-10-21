const XERO_ERROR_COPY: Record<string, string> = {
  changed:
    "The Xero connection changed while you were signing in. Try connecting again.",
  expired:
    "The Xero sign-in took too long or was interrupted. Try connecting again.",
  failed:
    "Xero could not be connected. Try again, or set up without Xero for now.",
  organisation:
    "That Xero file could not be connected. Choose an Australian payroll organisation and try again.",
  unavailable: "Xero could not be reached. Try again in a few minutes.",
};

export function xeroReturnMessage(input: {
  cancelled: boolean;
  errorCode: string | null;
}): string | null {
  if (input.errorCode) {
    return XERO_ERROR_COPY[input.errorCode] ?? XERO_ERROR_COPY.failed ?? null;
  }
  return input.cancelled
    ? "You cancelled the Xero connection. Connect again, or set up without Xero."
    : null;
}
