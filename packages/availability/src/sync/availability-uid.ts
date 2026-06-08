import { createHash } from "node:crypto";
import type {
  availability_record_type,
  availability_source_type,
} from "@repo/database/generated/enums";

const ICAL_UID_SUFFIX = "@ical.leavesync.app";

export function deriveAvailabilityUidKey(input: {
  clerkOrgId: string;
  endsAt: Date;
  organisationId: string;
  personId: string;
  recordType: availability_record_type;
  sourceType: availability_source_type;
  stableSourceKey: string;
  startsAt: Date;
}): string {
  const digest = createHash("sha256")
    .update(
      [
        input.clerkOrgId,
        input.organisationId,
        input.personId,
        input.sourceType,
        input.stableSourceKey,
        input.startsAt.toISOString(),
        input.endsAt.toISOString(),
        input.recordType,
      ].join("|")
    )
    .digest("hex");
  return `${digest}${ICAL_UID_SUFFIX}`;
}
