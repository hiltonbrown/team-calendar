import "server-only";

import { database, scopedTo as scoped } from "@repo/database";
import type {
  availability_approval_status,
  availability_failed_action,
} from "@repo/database/generated/enums";

export const XERO_WRITE_CLAIM_LEASE_MS = 5 * 60 * 1000;

interface ClaimScope {
  clerkOrgId: string;
  organisationId: string;
  recordId: string;
}

export interface AcquireXeroWriteClaimInput extends ClaimScope {
  claimedAt?: Date;
  expectedFailedAction?: availability_failed_action | null;
  expectedSequence: number;
  expectedStatus: availability_approval_status;
  now?: Date;
}

export async function acquireXeroWriteClaim(
  input: AcquireXeroWriteClaimInput
): Promise<Date | null> {
  const now = input.now ?? new Date();
  const claimedAt = input.claimedAt ?? now;
  const staleBefore = new Date(now.getTime() - XERO_WRITE_CLAIM_LEASE_MS);
  const result = await database.availabilityRecord.updateMany({
    data: { xero_write_claimed_at: claimedAt },
    where: {
      ...scoped(input),
      approval_status: input.expectedStatus,
      archived_at: null,
      derived_sequence: input.expectedSequence,
      ...(input.expectedFailedAction !== undefined && {
        failed_action: input.expectedFailedAction,
      }),
      id: input.recordId,
      OR: [
        { xero_write_claimed_at: null },
        { xero_write_claimed_at: { lt: staleBefore } },
      ],
    },
  });
  return result.count === 1 ? claimedAt : null;
}

export async function releaseXeroWriteClaim(
  input: ClaimScope & { claimedAt: Date }
): Promise<boolean> {
  const result = await database.availabilityRecord.updateMany({
    data: { xero_write_claimed_at: null },
    where: {
      ...scoped(input),
      id: input.recordId,
      xero_write_claimed_at: input.claimedAt,
    },
  });
  return result.count === 1;
}

export function unclaimedOrExpiredXeroWriteWhere(now = new Date()) {
  return {
    OR: [
      { xero_write_claimed_at: null },
      {
        xero_write_claimed_at: {
          lt: new Date(now.getTime() - XERO_WRITE_CLAIM_LEASE_MS),
        },
      },
    ],
  };
}
