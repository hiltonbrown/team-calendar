import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@repo/auth/helpers", () => ({
  auth: vi.fn(),
  requireOrg: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("@repo/availability", () => ({
  createManualAvailability: vi.fn(),
  archiveManualAvailability: vi.fn(),
  updateManualAvailability: vi.fn(),
}));

vi.mock("@repo/database/src/queries/organisations", () => ({
  getOrganisationById: vi.fn(),
}));

vi.mock("@repo/database/src/queries/people", () => ({
  listPeopleForOrganisation: vi.fn(),
}));

vi.mock("@repo/database/src/queries/availability-records", () => ({
  getAvailabilityRecordById: vi.fn(),
}));

vi.mock("@repo/observability/log", () => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const { auth, requireOrg, currentUser } = await import("@repo/auth/helpers");
const {
  createManualAvailability,
  archiveManualAvailability,
  updateManualAvailability,
} = await import("@repo/availability");
const { getOrganisationById } = await import(
  "@repo/database/src/queries/organisations"
);
const { listPeopleForOrganisation } = await import(
  "@repo/database/src/queries/people"
);
const { getAvailabilityRecordById } = await import(
  "@repo/database/src/queries/availability-records"
);

const { POST } = await import("../app/api/availability/route");
const { PATCH, DELETE } = await import(
  "../app/api/availability/[recordId]/route"
);

const validPostPayload = {
  personId: "11111111-1111-4111-a111-111111111111",
  recordType: "wfh",
  startsAt: "2026-07-01T09:00:00.000Z",
  endsAt: "2026-07-01T17:00:00.000Z",
  allDay: false,
  title: "WFH Day",
  organisationId: "22222222-2222-4222-a222-222222222222",
};

const validPatchPayload = {
  organisationId: "22222222-2222-4222-a222-222222222222",
  recordType: "travel",
  startsAt: "2026-07-02T09:00:00.000Z",
};

describe("Availability Collection Route (POST)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(auth).mockResolvedValue({ orgRole: "org:viewer" } as any);
  });

  it("returns 401 when requireOrg throws", async () => {
    vi.mocked(requireOrg).mockRejectedValue(new Error("Not authenticated"));

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(validPostPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("unauthorised");
  });

  it("returns 401 when currentUser is null", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(validPostPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("unauthorised");
  });

  it("returns 400 when body does not match validation schema (missing personId)", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);

    const invalidPayload = { ...validPostPayload, personId: undefined };

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(invalidPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid");
    expect(body.error.details).toBeDefined();
  });

  it("returns 400 when organisationId is missing in body", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);

    const invalidPayload = { ...validPostPayload, organisationId: undefined };

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(invalidPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid");
    expect(body.error.message).toBe("organisationId is required");
  });

  it("returns 404 when getOrganisationById returns not_found", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "Org not found" } as any,
    });

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(validPostPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("not_found");
  });

  it("returns 500 when listPeopleForOrganisation fails", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(listPeopleForOrganisation).mockResolvedValue({
      ok: false,
      error: { code: "internal", message: "DB Error" } as any,
    });

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(validPostPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(500);
  });

  it("returns 404 when the person is not in the organisation", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(listPeopleForOrganisation).mockResolvedValue({
      ok: true,
      value: [{ id: "other-person-id" }] as any,
    });

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(validPostPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.message).toBe("Person not found");
  });

  it("returns 201 and creates availability when happy path, verifying tenant isolation", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(listPeopleForOrganisation).mockResolvedValue({
      ok: true,
      value: [{ id: validPostPayload.personId }] as any,
    });
    vi.mocked(createManualAvailability).mockResolvedValue({
      ok: true,
      value: { id: "rec_123" } as any,
    });

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(validPostPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.value.id).toBe("rec_123");

    // Tenant isolation verification: getOrganisationById called with authenticated clerkOrgId
    expect(getOrganisationById).toHaveBeenCalledWith(
      "org_clerk_123",
      validPostPayload.organisationId
    );
    expect(createManualAvailability).toHaveBeenCalledWith(
      {
        clerkOrgId: "org_clerk_123",
        organisationId: validPostPayload.organisationId,
      },
      expect.objectContaining({
        personId: validPostPayload.personId,
        recordType: validPostPayload.recordType,
      }),
      { orgRole: "org:viewer", userId: "user_123" }
    );
  });

  it("returns 403 when createManualAvailability returns not_authorised", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(listPeopleForOrganisation).mockResolvedValue({
      ok: true,
      value: [{ id: validPostPayload.personId }] as any,
    });
    vi.mocked(createManualAvailability).mockResolvedValue({
      ok: false,
      error: {
        code: "not_authorised",
        message:
          "You do not have permission to manage this availability record.",
      } as any,
    });

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(validPostPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(403);
  });

  it("returns mapped error code on createManualAvailability failure", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(listPeopleForOrganisation).mockResolvedValue({
      ok: true,
      value: [{ id: validPostPayload.personId }] as any,
    });
    vi.mocked(createManualAvailability).mockResolvedValue({
      ok: false,
      error: { code: "conflict", message: "Overlap detected" } as any,
    });

    const response = await POST(
      new Request("http://localhost/api/availability", {
        method: "POST",
        body: JSON.stringify(validPostPayload),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(409);
  });
});

describe("Availability Single Record Route (PATCH)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(auth).mockResolvedValue({ orgRole: "org:viewer" } as any);
  });

  it("returns 401 when requireOrg throws", async () => {
    vi.mocked(requireOrg).mockRejectedValue(new Error("Not authenticated"));

    const response = await PATCH(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "PATCH",
          body: JSON.stringify(validPatchPayload),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when organisationId is missing in body", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);

    const response = await PATCH(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "PATCH",
          body: JSON.stringify({}),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when organisation not found", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "Not found" } as any,
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "PATCH",
          body: JSON.stringify(validPatchPayload),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when availability record not found", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(getAvailabilityRecordById).mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "Record not found" } as any,
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "PATCH",
          body: JSON.stringify(validPatchPayload),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when record is not manual (e.g. xero-sourced)", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(getAvailabilityRecordById).mockResolvedValue({
      ok: true,
      value: {
        id: "33333333-3333-4333-a333-333333333333",
        sourceType: "xero",
      } as any,
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "PATCH",
          body: JSON.stringify(validPatchPayload),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.message).toBe("Xero-sourced records cannot be edited");
  });

  it("returns 200 on happy path PATCH, verifying tenant isolation", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(getAvailabilityRecordById).mockResolvedValue({
      ok: true,
      value: {
        id: "33333333-3333-4333-a333-333333333333",
        sourceType: "manual",
      } as any,
    });
    vi.mocked(updateManualAvailability).mockResolvedValue({
      ok: true,
      value: {
        id: "33333333-3333-4333-a333-333333333333",
        title: "Updated",
      } as any,
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "PATCH",
          body: JSON.stringify(validPatchPayload),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.value.title).toBe("Updated");

    // Tenant isolation verification
    expect(getAvailabilityRecordById).toHaveBeenCalledWith(
      "org_clerk_123",
      validPatchPayload.organisationId,
      "33333333-3333-4333-a333-333333333333"
    );
    expect(updateManualAvailability).toHaveBeenCalledWith(
      {
        clerkOrgId: "org_clerk_123",
        organisationId: validPatchPayload.organisationId,
      },
      "33333333-3333-4333-a333-333333333333",
      expect.objectContaining({
        recordType: validPatchPayload.recordType,
      }),
      { orgRole: "org:viewer", userId: "user_123" }
    );
  });

  it("returns 403 when updateManualAvailability returns not_authorised", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(getAvailabilityRecordById).mockResolvedValue({
      ok: true,
      value: {
        id: "33333333-3333-4333-a333-333333333333",
        sourceType: "manual",
      } as any,
    });
    vi.mocked(updateManualAvailability).mockResolvedValue({
      ok: false,
      error: {
        code: "not_authorised",
        message:
          "You do not have permission to manage this availability record.",
      } as any,
    });

    const response = await PATCH(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "PATCH",
          body: JSON.stringify(validPatchPayload),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(403);
  });
});

describe("Availability Single Record Route (DELETE)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(auth).mockResolvedValue({ orgRole: "org:viewer" } as any);
  });

  it("returns 401 when requireOrg throws", async () => {
    vi.mocked(requireOrg).mockRejectedValue(new Error("Not authenticated"));

    const response = await DELETE(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "DELETE",
          body: JSON.stringify({
            organisationId: "22222222-2222-4222-a222-222222222222",
          }),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when organisationId is missing in body", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);

    const response = await DELETE(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "DELETE",
          body: JSON.stringify({}),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(400);
  });

  it("returns 403 when record is not manual", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(getAvailabilityRecordById).mockResolvedValue({
      ok: true,
      value: {
        id: "33333333-3333-4333-a333-333333333333",
        sourceType: "xero",
      } as any,
    });

    const response = await DELETE(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "DELETE",
          body: JSON.stringify({
            organisationId: "22222222-2222-4222-a222-222222222222",
          }),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(403);
  });

  it("returns 204 on happy path DELETE, verifying tenant isolation", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(getAvailabilityRecordById).mockResolvedValue({
      ok: true,
      value: {
        id: "33333333-3333-4333-a333-333333333333",
        sourceType: "manual",
      } as any,
    });
    vi.mocked(archiveManualAvailability).mockResolvedValue({
      ok: true,
      value: { id: "33333333-3333-4333-a333-333333333333" } as any,
    });

    const response = await DELETE(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "DELETE",
          body: JSON.stringify({
            organisationId: "22222222-2222-4222-a222-222222222222",
          }),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(204);

    // Tenant isolation verification
    expect(getAvailabilityRecordById).toHaveBeenCalledWith(
      "org_clerk_123",
      "22222222-2222-4222-a222-222222222222",
      "33333333-3333-4333-a333-333333333333"
    );
    expect(archiveManualAvailability).toHaveBeenCalledWith(
      {
        clerkOrgId: "org_clerk_123",
        organisationId: "22222222-2222-4222-a222-222222222222",
      },
      "33333333-3333-4333-a333-333333333333",
      { orgRole: "org:viewer", userId: "user_123" }
    );
  });

  it("returns 403 when archiveManualAvailability returns not_authorised", async () => {
    vi.mocked(requireOrg).mockResolvedValue("org_clerk_123");
    vi.mocked(currentUser).mockResolvedValue({ id: "user_123" } as any);
    vi.mocked(getOrganisationById).mockResolvedValue({
      ok: true,
      value: { id: "org-1" } as any,
    });
    vi.mocked(getAvailabilityRecordById).mockResolvedValue({
      ok: true,
      value: {
        id: "33333333-3333-4333-a333-333333333333",
        sourceType: "manual",
      } as any,
    });
    vi.mocked(archiveManualAvailability).mockResolvedValue({
      ok: false,
      error: {
        code: "not_authorised",
        message:
          "You do not have permission to manage this availability record.",
      } as any,
    });

    const response = await DELETE(
      new Request(
        "http://localhost/api/availability/33333333-3333-4333-a333-333333333333",
        {
          method: "DELETE",
          body: JSON.stringify({
            organisationId: "22222222-2222-4222-a222-222222222222",
          }),
          headers: { "content-type": "application/json" },
        }
      ),
      {
        params: Promise.resolve({
          recordId: "33333333-3333-4333-a333-333333333333",
        }),
      }
    );

    expect(response.status).toBe(403);
  });
});
