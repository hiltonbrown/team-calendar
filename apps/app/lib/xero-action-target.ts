import { z } from "zod";

/** Targets use validated form values, with absent object fields omitted. Dates must be explicit ISO strings. */
export function xeroActionTarget(
  input: unknown
): z.infer<ReturnType<typeof z.json>> {
  return z.json().parse(omitAbsentFields(input));
}

function omitAbsentFields(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(omitAbsentFields);
  }
  if (
    input &&
    typeof input === "object" &&
    Object.getPrototypeOf(input) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(input)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, omitAbsentFields(value)])
    );
  }
  return input;
}
