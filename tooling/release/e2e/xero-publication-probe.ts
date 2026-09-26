import { z } from "zod";
import {
  fetchAndAssertXeroFeedPublication,
  type XeroFeedPublicationObservation,
  xeroFeedPublicationExpectationSchema,
} from "./xero-readonly-assertions.js";

export const xeroPublicationAssertionSchema = z.strictObject({
  baselineExpected: xeroFeedPublicationExpectationSchema.optional(),
  expected: xeroFeedPublicationExpectationSchema,
  feedId: z.uuid(),
  privateUrl: z.string().url(),
});
const transitionKinds = {
  "X24.sequence": "material-change",
  "X24.uid-stability": "unchanged",
  "X24.withdrawal": "withdrawal",
} as const;

export function createVerifiedXeroPublicationProbe(
  input: Omit<
    Parameters<typeof fetchAndAssertXeroFeedPublication>[0],
    "expected" | "previous"
  > & { observationId: string; assertion: unknown }
) {
  const observationId = z
    .enum([
      "X24.eligible-content",
      "X24.privacy",
      "X24.uid-stability",
      "X24.sequence",
      "X24.withdrawal",
    ])
    .parse(input.observationId);
  const assertion = xeroPublicationAssertionSchema.parse(input.assertion);
  if (
    assertion.privateUrl !== input.privateUrl ||
    assertion.feedId !== input.fixture.feedId
  ) {
    throw new Error("Publication assertion has foreign feed scope");
  }
  const requiredKind = Object.entries(transitionKinds).find(
    ([id]) => id === observationId
  )?.[1];
  if (
    requiredKind &&
    (!assertion.baselineExpected ||
      assertion.baselineExpected.transitions.length > 0 ||
      assertion.expected.transitions.some(
        (transition) =>
          !assertion.baselineExpected?.events.some(
            (event) => event.uid === transition.uid
          )
      ) ||
      !assertion.expected.transitions.some(
        (transition) => transition.kind === requiredKind
      ) ||
      (requiredKind === "withdrawal" &&
        !assertion.expected.transitions.some(
          (transition) =>
            transition.kind === "withdrawal" &&
            assertion.expected.absentUids.includes(transition.uid)
        )))
  ) {
    throw new Error("Named publication transition has no before-read contract");
  }
  let baseline: XeroFeedPublicationObservation | undefined;
  let beforeObserved = false;
  return {
    observeAfter: async () => {
      if (!beforeObserved || (requiredKind && !baseline)) {
        throw new Error("Actual publication baseline has not been observed");
      }
      return await fetchAndAssertXeroFeedPublication({
        ...input,
        expected: assertion.expected,
        previous: baseline,
      });
    },
    observeBefore: async () => {
      if (beforeObserved) {
        throw new Error("Publication baseline cannot be replayed");
      }
      if (requiredKind && assertion.baselineExpected) {
        baseline = await fetchAndAssertXeroFeedPublication({
          ...input,
          expected: assertion.baselineExpected,
        });
      }
      beforeObserved = true;
    },
  };
}
