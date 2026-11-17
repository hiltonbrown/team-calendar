import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MembersClient } from "./members-client";

vi.mock("@/app/actions/settings/invite-member", () => ({
  inviteMember: vi.fn(),
}));
vi.mock("@/app/actions/settings/remove-member", () => ({
  removeMember: vi.fn(),
}));
vi.mock("@/app/actions/settings/update-member-role", () => ({
  updateMemberRole: vi.fn(),
}));

describe("MembersClient", () => {
  it("renders a neutral full name with both initials", () => {
    render(
      <MembersClient
        getCurrentUserId="user_viewer"
        getCurrentUserRole="viewer"
        members={[
          {
            email: "alex@example.com",
            image: null,
            membershipId: "membership_alex",
            name: "Alex Smith",
            role: "viewer",
            userId: "user_alex",
          },
        ]}
        pendingInvitations={[]}
      />
    );
    expect(screen.getByText("Alex Smith")).toBeDefined();
    expect(screen.getByText("AS")).toBeDefined();
    expect(screen.getByText("alex@example.com")).toBeDefined();
  });
});
