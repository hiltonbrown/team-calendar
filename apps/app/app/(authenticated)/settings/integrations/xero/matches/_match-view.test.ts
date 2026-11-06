import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toXeroPersonMatchView, xeroPersonMatchSelect } from "./_match-view";

const forbiddenMatchFields = [
  "account_id",
  "created_at",
  "match_reason",
  "organisation_id",
  "resolution_note",
  "resolved_at",
  "resolved_by_user_id",
  "resolved_user_id",
  "resolved_person_id",
  "source_payload_json",
  "status",
  "updated_at",
];

describe("xeroPersonMatchSelect", () => {
  it("excludes match persistence and audit fields", () => {
    for (const field of forbiddenMatchFields) {
      expect(xeroPersonMatchSelect).not.toHaveProperty(field);
    }
  });

  it("selects only id and nested relations with explicit allowlists", () => {
    expect(xeroPersonMatchSelect.id).toBe(true);
    expect(xeroPersonMatchSelect.candidate_person).toEqual({
      select: {
        email: true,
        first_name: true,
        last_name: true,
        user_id: true,
      },
    });
    expect(xeroPersonMatchSelect.xero_person).toEqual({
      select: {
        email: true,
        first_name: true,
        last_name: true,
      },
    });
  });
});

describe("toXeroPersonMatchView", () => {
  it("maps a match with candidate person present", () => {
    const matchId = "00000000-0000-4000-8000-000000000001";
    const view = toXeroPersonMatchView({
      candidate_person: {
        email: "sarah@example.com",
        first_name: "Sarah",
        last_name: "Connor",
        user_id: "user_123",
      },
      id: matchId,
      xero_person: {
        email: "sarah.connor@work.com",
        first_name: "Sarah",
        last_name: "Connor",
      },
    });

    expect(view).toEqual({
      candidate_person: {
        email: "sarah@example.com",
        first_name: "Sarah",
        last_name: "Connor",
        user_id: "user_123",
      },
      id: matchId,
      xero_person: {
        email: "sarah.connor@work.com",
        first_name: "Sarah",
        last_name: "Connor",
      },
    });
    expect(Object.keys(view).sort()).toEqual(
      ["candidate_person", "id", "xero_person"].sort()
    );
  });

  it("maps a match when candidate person is null", () => {
    const matchId = "00000000-0000-4000-8000-000000000002";
    const view = toXeroPersonMatchView({
      candidate_person: null,
      id: matchId,
      xero_person: {
        email: "john@example.com",
        first_name: "John",
        last_name: "Doe",
      },
    });

    expect(view).toEqual({
      candidate_person: null,
      id: matchId,
      xero_person: {
        email: "john@example.com",
        first_name: "John",
        last_name: "Doe",
      },
    });
  });

  it("handles empty email and preserves stable string IDs", () => {
    const matchId = "00000000-0000-4000-8000-000000000003";
    const view = toXeroPersonMatchView({
      candidate_person: {
        email: "",
        first_name: "Alex",
        last_name: "Smith",
        user_id: null,
      },
      id: matchId,
      xero_person: {
        email: "",
        first_name: "Alex",
        last_name: "Smith",
      },
    });

    expect(view.id).toBe(matchId);
    expect(view.xero_person.email).toBe("");
    expect(view.candidate_person?.email).toBe("");
    expect(view.candidate_person?.user_id).toBeNull();
  });
});
