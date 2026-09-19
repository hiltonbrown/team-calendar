import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ClerkOrgId, OrganisationId } from "@repo/core";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  type ClerkOrganizationsApi,
  inviteClerkAccessCandidates,
  loadClerkAccessReview,
  reconcileClerkAccessLinks,
} from "./clerk-access-service";

const fixture = allocateLiveTestFixture(
  "packages/availability/src/people/clerk-access-service.integration.test.ts"
);
const { database } = await import("@repo/database");
const tenantA = {
  clerkOrgId: fixture.tenants[0]?.clerkOrgId as ClerkOrgId,
  organisationId: fixture.tenants[0]?.organisationId as OrganisationId,
};

const tenantB = {
  clerkOrgId: fixture.tenants[1]?.clerkOrgId as ClerkOrgId,
  organisationId: fixture.tenants[1]?.organisationId as OrganisationId,
};
if (!(tenantA.clerkOrgId && tenantB.clerkOrgId)) {
  throw new Error("Clerk-access live fixture tenants were not allocated");
}

const testOrgIds = [tenantA.organisationId, tenantB.organisationId];
const testClerkOrgIds = [tenantA.clerkOrgId, tenantB.clerkOrgId];

async function cleanDatabase() {
  await database.auditEvent.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.availabilityRecord.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.person.deleteMany({
    where: { clerk_org_id: { in: testClerkOrgIds } },
  });
  await database.organisation.deleteMany({
    where: { id: { in: testOrgIds } },
  });
}

describe("clerk-access-service integration", () => {
  beforeEach(async () => {
    await cleanDatabase();

    await database.organisation.createMany({
      data: [
        {
          clerk_org_id: tenantA.clerkOrgId,
          country_code: "AU",
          id: tenantA.organisationId,
          name: "Tenant A",
          timezone: "Australia/Sydney",
        },
        {
          clerk_org_id: tenantB.clerkOrgId,
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
    // Person in Tenant A with matching Clerk member
    const personA1 = await database.person.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
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
        clerk_org_id: tenantB.clerkOrgId,
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

    const mockClerk: ClerkOrganizationsApi = {
      createOrganizationInvitationBulk: vi.fn(),
      getOrganizationInvitationList: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
      getOrganizationMembershipList: vi.fn().mockResolvedValue({
        data: [
          {
            id: "mem_1",
            publicUserData: {
              firstName: "Alice",
              identifier: "alice@example.com",
              lastName: "Smith",
              userId: "user_clerk_alice_a",
            },
            role: "org:member",
          },
        ],
        totalCount: 1,
      }),
    };

    const reviewResult = await loadClerkAccessReview({
      clerkOrganizations: mockClerk,
      clerkOrgId: tenantA.clerkOrgId,
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

    const linkResult = await reconcileClerkAccessLinks({
      clerkOrganizations: mockClerk,
      clerkOrgId: tenantA.clerkOrgId,
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
    expect(updatedA?.clerk_user_id).toBe("user_clerk_alice_a");

    // Tenant B person should NOT have been linked
    const unchangedB = await database.person.findUnique({
      where: { id: personB1.id },
    });
    expect(unchangedB?.clerk_user_id).toBeNull();
  });

  it("excludes fallback emails, duplicate local emails, and pending invitations from invitable candidates", async () => {
    // 1. Invitable Xero employee
    const validPerson = await database.person.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
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
        clerk_org_id: tenantA.clerkOrgId,
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
        clerk_org_id: tenantA.clerkOrgId,
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
        clerk_org_id: tenantA.clerkOrgId,
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
        clerk_org_id: tenantA.clerkOrgId,
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

    const mockClerk: ClerkOrganizationsApi = {
      createOrganizationInvitationBulk: vi.fn().mockResolvedValue({
        data: [
          { emailAddress: "valid@example.com", id: "inv_1", status: "pending" },
        ],
        totalCount: 1,
      }),
      getOrganizationInvitationList: vi.fn().mockResolvedValue({
        data: [
          {
            emailAddress: "pending@example.com",
            id: "inv_pending_1",
            status: "pending",
          },
        ],
        totalCount: 1,
      }),
      getOrganizationMembershipList: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
    };

    const review = await loadClerkAccessReview({
      clerkOrganizations: mockClerk,
      clerkOrgId: tenantA.clerkOrgId,
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
    const inviteResult = await inviteClerkAccessCandidates({
      clerkOrganizations: mockClerk,
      clerkOrgId: tenantA.clerkOrgId,
      inviterUserId: "user_inviter_admin",
      organisationId: tenantA.organisationId,
    });

    expect(inviteResult.ok).toBe(true);
    if (!inviteResult.ok) {
      return;
    }

    expect(inviteResult.value.succeededCount).toBe(1);
    expect(mockClerk.createOrganizationInvitationBulk).toHaveBeenCalledWith(
      tenantA.clerkOrgId,
      [
        {
          emailAddress: "valid@example.com",
          inviterUserId: "user_inviter_admin",
          role: "org:viewer",
        },
      ]
    );
  });

  it("handles batch limits (<= 10) and retries on transient errors", async () => {
    // Create 12 invitable candidates to test batching
    for (let i = 1; i <= 12; i += 1) {
      await database.person.create({
        data: {
          clerk_org_id: tenantA.clerkOrgId,
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
    const mockClerk: ClerkOrganizationsApi = {
      createOrganizationInvitationBulk: vi
        .fn()
        .mockImplementation((_orgId, batch) => {
          bulkCallCount += 1;
          if (bulkCallCount === 1) {
            // First attempt of batch 1 fails with transient 429
            const err = new Error("Rate limit exceeded");
            (err as unknown as { status: number }).status = 429;
            return Promise.reject(err);
          }
          return Promise.resolve({
            data: batch.map((b: { emailAddress: string }, idx: number) => ({
              emailAddress: b.emailAddress,
              id: `inv_${bulkCallCount}_${idx}`,
              status: "pending",
            })),
            totalCount: batch.length,
          });
        }),
      getOrganizationInvitationList: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
      getOrganizationMembershipList: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
    };

    const inviteResult = await inviteClerkAccessCandidates({
      clerkOrganizations: mockClerk,
      clerkOrgId: tenantA.clerkOrgId,
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
    expect(mockClerk.createOrganizationInvitationBulk).toHaveBeenCalledTimes(3);
  });

  it("handles no-email, invalid-email, clerk-user conflicts and non-transient errors without rollback", async () => {
    // 1. Person with no email
    const noEmailPerson = await database.person.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
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
        clerk_org_id: tenantA.clerkOrgId,
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

    // 3. Person with multiple Clerk users for the same email
    const clerkConflictPerson = await database.person.create({
      data: {
        clerk_org_id: tenantA.clerkOrgId,
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
        clerk_org_id: tenantA.clerkOrgId,
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
        clerk_org_id: tenantA.clerkOrgId,
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

    const mockClerk: ClerkOrganizationsApi = {
      createOrganizationInvitationBulk: vi
        .fn()
        .mockRejectedValue(
          new Error("Permanent failure (e.g. 400 Bad Request)")
        ),
      getOrganizationInvitationList: vi.fn().mockResolvedValue({
        data: [],
        totalCount: 0,
      }),
      getOrganizationMembershipList: vi.fn().mockResolvedValue({
        data: [
          // 2 members for shared@example.com -> conflict!
          {
            id: "mem_shared_1",
            publicUserData: {
              identifier: "shared@example.com",
              userId: "user_shared_1",
            },
          },
          {
            id: "mem_shared_2",
            publicUserData: {
              identifier: "shared@example.com",
              userId: "user_shared_2",
            },
          },
          // 1 member for linkable@example.com -> linkable!
          {
            id: "mem_linkable",
            publicUserData: {
              identifier: "linkable@example.com",
              userId: "user_linkable_1",
            },
          },
        ],
        totalCount: 3,
      }),
    };

    const review = await loadClerkAccessReview({
      clerkOrganizations: mockClerk,
      clerkOrgId: tenantA.clerkOrgId,
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
    expect(candidateMap.get(clerkConflictPerson.id)).toMatchObject({
      conflictReason: "clerk_user_conflict",
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
    const inviteResult = await inviteClerkAccessCandidates({
      clerkOrganizations: mockClerk,
      clerkOrgId: tenantA.clerkOrgId,
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
    expect(linkedInDb?.clerk_user_id).toBe("user_linkable_1");
  });
});
