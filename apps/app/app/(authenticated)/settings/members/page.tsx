import { auth, clerkClient } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MembersClient } from "./members-client";

export const metadata: Metadata = {
  title: "Members - Settings - Team Calendar",
  description: "Manage team members and their roles in your organisation.",
};

const MembersPage = async () => {
  const { orgId, orgRole, userId } = await auth();

  if (!(orgId && userId)) {
    redirect("/");
  }

  const clerk = await clerkClient();

  const [membershipsResult, invitationsResult] = await Promise.all([
    clerk.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
    }),
    clerk.organizations.getOrganizationInvitationList({
      organizationId: orgId,
      status: ["pending"],
    }),
  ]);

  const members = membershipsResult.data.map((m) => ({
    membershipId: m.id,
    userId: m.publicUserData?.userId ?? "",
    firstName: m.publicUserData?.firstName ?? null,
    lastName: m.publicUserData?.lastName ?? null,
    emailAddress: m.publicUserData?.identifier ?? "",
    imageUrl: m.publicUserData?.imageUrl ?? "",
    role: m.role,
  }));

  const pendingInvitations = invitationsResult.data.map((inv) => ({
    id: inv.id,
    emailAddress: inv.emailAddress,
    role: inv.role,
    createdAt: inv.createdAt,
  }));

  return (
    <MembersClient
      currentUserId={userId}
      currentUserRole={orgRole ?? "org:viewer"}
      members={members}
      pendingInvitations={pendingInvitations}
    />
  );
};

export default MembersPage;
