import type { AccountDirectory } from "@repo/auth/accounts";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AccountId, OrganisationId } from "@repo/core";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  inviteAccountAccessCandidates,
  loadAccountAccessReview,
  reconcileAccountAccessLinks,
} from "./account-access-service";

const fixture = allocateLiveTestFixture(
  "packages/availability/src/people/account-access-service.integration.test.ts"
);
const { systemDatabase: database } = await import("@repo/database");
const tenantA = {
  accountId: fixture.tenants[0]?.accountId as AccountId,
  organisationId: fixture.tenants[0]?.organisationId as OrganisationId,
};

const tenantB = {
  accountId: fixture.tenants[1]?.accountId as AccountId,
  organisationId: fixture.tenants[1]?.organisationId as OrganisationId,
};
if (!(tenantA.accountId && tenantB.accountId)) {
  throw new Error("Account-access live fixture tenants were not allocated");
}

const testOrgIds = [tenantA.organisationId, tenantB.organisationId];
const testAccountIds = [tenantA.accountId, tenantB.accountId];

async function cleanDatabase() {
  await database.auditEvent.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.availabilityRecord.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.person.deleteMany({
    where: { account_id: { in: testAccountIds } },
  });
  await database.organisation.deleteMany({
    where: { id: { in: testOrgIds } },
  });
}

describe("account-access-service integration", () => {
  beforeEach(async () => {
    await cleanDatabase();

    await database.organisation.createMany({
      data: [
        {
          account_id: tenantA.accountId,
          country_code: "AU",
          id: tenantA.organisationId,
          name: "Tenant A",
          timezone: "Australia/Sydney",
        },
        {
          account_id: tenantB.accountId,
          country_code: "AU",
          id: tenantB.organisationId,
          name: "Tenant B",
          timezone: "Australia/Sydney",
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await expect(
      database.organisation.count({ where: { id: { in: testOrgIds } } })
    ).resolves.toBe(0);
  });

  it("links unique one-to-one matches and isolates by tenant keys", async () => {
    // Person in Tenant A with matching account member
    const personA1 = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "alice@example.com",
        employment_type: "employee",
        first_name: "Alice",
        is_active: true,
        last_name: "Smith",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_alice_1",
        source_system: "XERO",
      },
    });

    // Person in Tenant B with same email (should be isolated to tenant B)
    const personB1 = await database.person.create({
      data: {
        account_id: tenantB.accountId,
        email: "alice@example.com",
        employment_type: "employee",
        first_name: "Alice",
        is_active: true,
        last_name: "Smith",
        organisation_id: tenantB.organisationId,
        source_person_key: "xero_alice_b",
        source_system: "XERO",
      },
    });

    const mockDirectory: AccountDirectory = {
      inviteMembers: vi.fn(),
      listInvitations: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
      listMembers: vi.fn().mockResolvedValue({
        data: [
          {
            accountId: tenantA.accountId,
            email: "alice@example.com",
            id: "mem_1",
            image: null,
            name: "Alice Smith",
            role: "viewer",
            userId: "user_alice_a",
          },
        ],
        totalCount: 1,
      }),
    };

    const reviewResult = await loadAccountAccessReview({
      accountDirectory: mockDirectory,
      accountId: tenantA.accountId,
      organisationId: tenantA.organisationId,
    });

    expect(reviewResult.ok).toBe(true);
    if (!reviewResult.ok) {
      return;
    }

    expect(reviewResult.value.linkableCount).toBe(1);
    expect(reviewResult.value.candidates[0]).toMatchObject({
      conflictReason: null,
      email: "alice@example.com",
      id: personA1.id,
      state: "linkable",
    });

    const linkResult = await reconcileAccountAccessLinks({
      accountDirectory: mockDirectory,
      accountId: tenantA.accountId,
      organisationId: tenantA.organisationId,
    });

    expect(linkResult.ok).toBe(true);
    if (!linkResult.ok) {
      return;
    }
    expect(linkResult.value.linkedCount).toBe(1);

    const updatedA = await database.person.findUnique({
      where: { id: personA1.id },
    });
    expect(updatedA?.user_id).toBe("user_alice_a");

    // Tenant B person should NOT have been linked
    const unchangedB = await database.person.findUnique({
      where: { id: personB1.id },
    });
    expect(unchangedB?.user_id).toBeNull();
  });

  it("excludes fallback emails, duplicate local emails, and pending invitations from invitable candidates", async () => {
    // 1. Invitable Xero employee
    const validPerson = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "valid@example.com",
        employment_type: "employee",
        first_name: "Valid",
        is_active: true,
        last_name: "User",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_valid_1",
        source_system: "XERO",
      },
    });

    // 2. Fallback email employee
    const fallbackPerson = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "fallback.user@noemail.teamcalendar.online",
        employment_type: "employee",
        first_name: "Fallback",
        is_active: true,
        last_name: "User",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_fallback_1",
        source_system: "XERO",
      },
    });

    // 3. Duplicate email local people (one XERO, one MANUAL)
    const dup1 = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "dup@example.com",
        employment_type: "employee",
        first_name: "Dup",
        is_active: true,
        last_name: "One",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_dup_1",
        source_system: "XERO",
      },
    });
    const dup2 = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "dup@example.com",
        employment_type: "employee",
        first_name: "Dup",
        is_active: true,
        last_name: "Two",
        organisation_id: tenantA.organisationId,
        source_person_key: "manual_dup_2",
        source_system: "MANUAL",
      },
    });

    // 4. Pending invitation person
    const pendingPerson = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "pending@example.com",
        employment_type: "employee",
        first_name: "Pending",
        is_active: true,
        last_name: "User",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_pending_1",
        source_system: "XERO",
      },
    });

    const mockDirectory: AccountDirectory = {
      inviteMembers: vi.fn().mockResolvedValue({
        data: [{ email: "valid@example.com", id: "inv_1", status: "pending" }],
        totalCount: 1,
      }),
      listInvitations: vi.fn().mockResolvedValue({
        data: [
          {
            email: "pending@example.com",
            id: "inv_pending_1",
            status: "pending",
          },
        ],
        totalCount: 1,
      }),
      listMembers: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
    };

    const review = await loadAccountAccessReview({
      accountDirectory: mockDirectory,
      accountId: tenantA.accountId,
      organisationId: tenantA.organisationId,
    });

    expect(review.ok).toBe(true);
    if (!review.ok) {
      return;
    }

    expect(review.value.invitableCount).toBe(1);
    expect(review.value.alreadyInvitedCount).toBe(1);
    expect(review.value.conflictCount).toBe(3); // fallback + 2 duplicates

    const candidateMap = new Map(review.value.candidates.map((c) => [c.id, c]));

    expect(candidateMap.get(validPerson.id)?.state).toBe("invitable");
    expect(candidateMap.get(fallbackPerson.id)).toMatchObject({
      conflictReason: "fallback_email",
      state: "conflict",
    });
    expect(candidateMap.get(dup1.id)).toMatchObject({
      conflictReason: "duplicate_email",
      state: "conflict",
    });
    expect(candidateMap.get(dup2.id)).toMatchObject({
      conflictReason: "duplicate_email",
      state: "conflict",
    });
    expect(candidateMap.get(pendingPerson.id)).toMatchObject({
      conflictReason: null,
      state: "already_invited",
    });

    // Now dispatch invitations
    const inviteResult = await inviteAccountAccessCandidates({
      accountDirectory: mockDirectory,
      accountId: tenantA.accountId,
      inviterUserId: "user_inviter_admin",
      organisationId: tenantA.organisationId,
    });

    expect(inviteResult.ok).toBe(true);
    if (!inviteResult.ok) {
      return;
    }

    expect(inviteResult.value.succeededCount).toBe(1);
    expect(mockDirectory.inviteMembers).toHaveBeenCalledWith({
      accountId: tenantA.accountId,
      invitations: [
        {
          email: "valid@example.com",
          inviterUserId: "user_inviter_admin",
          role: "viewer",
        },
      ],
    });
  });

  it("handles batch limits (<= 10) and retries on transient errors", async () => {
    // Create 12 invitable candidates to test batching
    for (let i = 1; i <= 12; i += 1) {
      await database.person.create({
        data: {
          account_id: tenantA.accountId,
          email: `employee${i}@example.com`,
          employment_type: "employee",
          first_name: `Emp${i}`,
          is_active: true,
          last_name: "Test",
          organisation_id: tenantA.organisationId,
          source_person_key: `xero_emp_${i}`,
          source_system: "XERO",
        },
      });
    }

    let bulkCallCount = 0;
    const mockDirectory: AccountDirectory = {
      inviteMembers: vi.fn().mockImplementation(({ invitations: batch }) => {
        bulkCallCount += 1;
        if (bulkCallCount === 1) {
          // First attempt of batch 1 fails with transient 429
          const err = new Error("Rate limit exceeded");
          (err as unknown as { status: number }).status = 429;
          return Promise.reject(err);
        }
        return Promise.resolve({
          data: batch.map((b: { email: string }, idx: number) => ({
            email: b.email,
            id: `inv_${bulkCallCount}_${idx}`,
            status: "pending",
          })),
          totalCount: batch.length,
        });
      }),
      listInvitations: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
      listMembers: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
    };

    const inviteResult = await inviteAccountAccessCandidates({
      accountDirectory: mockDirectory,
      accountId: tenantA.accountId,
      inviterUserId: "user_inviter_admin",
      organisationId: tenantA.organisationId,
    });

    expect(inviteResult.ok).toBe(true);
    if (!inviteResult.ok) {
      return;
    }

    // Batch 1 (10 items): failed once with 429, succeeded on retry
    // Batch 2 (2 items): succeeded on first attempt
    // Total succeeded: 12
    expect(inviteResult.value.succeededCount).toBe(12);
    expect(inviteResult.value.failedCount).toBe(0);
    expect(mockDirectory.inviteMembers).toHaveBeenCalledTimes(3);
  });

  it("handles no-email, invalid-email, user conflicts and non-transient errors without rollback", async () => {
    // 1. Person with no email
    const noEmailPerson = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "",
        employment_type: "employee",
        first_name: "NoEmail",
        is_active: true,
        last_name: "User",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_noemail_1",
        source_system: "XERO",
      },
    });

    // 2. Person with invalid email
    const invalidEmailPerson = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "not-a-valid-email",
        employment_type: "employee",
        first_name: "Invalid",
        is_active: true,
        last_name: "Email",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_invalid_1",
        source_system: "XERO",
      },
    });

    // 3. Person with multiple users for the same email
    const userConflictPerson = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "shared@example.com",
        employment_type: "employee",
        first_name: "Shared",
        is_active: true,
        last_name: "User",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_shared_1",
        source_system: "XERO",
      },
    });

    // 4. Linkable person that should succeed linking even if bulk invitations fail
    const linkablePerson = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "linkable@example.com",
        employment_type: "employee",
        first_name: "Linkable",
        is_active: true,
        last_name: "User",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_linkable_1",
        source_system: "XERO",
      },
    });

    // 5. Invitable candidate whose bulk invitation throws a non-transient error
    const invitablePerson = await database.person.create({
      data: {
        account_id: tenantA.accountId,
        email: "invitable@example.com",
        employment_type: "employee",
        first_name: "Invitable",
        is_active: true,
        last_name: "User",
        organisation_id: tenantA.organisationId,
        source_person_key: "xero_invitable_1",
        source_system: "XERO",
      },
    });

    const mockDirectory: AccountDirectory = {
      inviteMembers: vi
        .fn()
        .mockRejectedValue(
          new Error("Permanent failure (e.g. 400 Bad Request)")
        ),
      listInvitations: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
      listMembers: vi.fn().mockResolvedValue({
        data: [
          // 2 members for shared@example.com -> conflict!
          {
            accountId: tenantA.accountId,
            email: "shared@example.com",
            id: "mem_shared_1",
            image: null,
            name: null,
            userId: "user_shared_1",
          },
          {
            accountId: tenantA.accountId,
            email: "shared@example.com",
            id: "mem_shared_2",
            image: null,
            name: null,
            userId: "user_shared_2",
          },
          // 1 member for linkable@example.com -> linkable!
          {
            accountId: tenantA.accountId,
            email: "linkable@example.com",
            id: "mem_linkable",
            image: null,
            name: null,
            userId: "user_linkable_1",
          },
        ],
        totalCount: 3,
      }),
    };

    const review = await loadAccountAccessReview({
      accountDirectory: mockDirectory,
      accountId: tenantA.accountId,
      organisationId: tenantA.organisationId,
    });

    expect(review.ok).toBe(true);
    if (!review.ok) {
      return;
    }

    const candidateMap = new Map(review.value.candidates.map((c) => [c.id, c]));

    expect(candidateMap.get(noEmailPerson.id)).toMatchObject({
      conflictReason: "no_email",
      state: "conflict",
    });
    expect(candidateMap.get(invalidEmailPerson.id)).toMatchObject({
      conflictReason: "invalid_email",
      state: "conflict",
    });
    expect(candidateMap.get(userConflictPerson.id)).toMatchObject({
      conflictReason: "user_conflict",
      state: "conflict",
    });
    expect(candidateMap.get(linkablePerson.id)).toMatchObject({
      conflictReason: null,
      state: "linkable",
    });
    expect(candidateMap.get(invitablePerson.id)).toMatchObject({
      conflictReason: null,
      state: "invitable",
    });

    // Now invite candidates - bulk invitation will fail with 400
    const inviteResult = await inviteAccountAccessCandidates({
      accountDirectory: mockDirectory,
      accountId: tenantA.accountId,
      inviterUserId: "user_admin",
      organisationId: tenantA.organisationId,
    });

    expect(inviteResult.ok).toBe(true);
    if (!inviteResult.ok) {
      return;
    }

    // Linkable person was linked successfully!
    expect(inviteResult.value.linkedCount).toBe(1);
    expect(inviteResult.value.failedCount).toBe(1);
    expect(inviteResult.value.succeededCount).toBe(0);

    const linkedInDb = await database.person.findUnique({
      where: { id: linkablePerson.id },
    });
    expect(linkedInDb?.user_id).toBe("user_linkable_1");
  });
});
