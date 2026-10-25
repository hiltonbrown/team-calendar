import {
  listAccountInvitations,
  listAccountMembers,
} from "@repo/auth/accounts";
import { getSession } from "@repo/auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MembersClient } from "./members-client";

export const metadata: Metadata = {
  description: "Manage team members and their roles in your organisation.",
  title: "Members - Settings - Team Calendar",
};

const MembersPage = async () => {
  const {
    accountId: sessionAccountId,
    role: sessionRole,
    userId,
  } = (await getSession()) ?? {
    accountId: null,
    role: null,
    sessionId: null,
    userId: null,
  };

  if (!(sessionAccountId && userId)) {
    redirect("/");
  }

  const [membershipsResult, invitationsResult] = await Promise.all([
    listAccountMembers({
      accountId: sessionAccountId,
      limit: 100,
    }),
    listAccountInvitations({
      accountId: sessionAccountId,
      status: ["pending"],
    }),
  ]);

  const members = membershipsResult.data.map((m) => ({
    email: m.email ?? "",
    image: m.image,
    membershipId: m.id,
    name: m.name,
    role: m.role ?? "unknown",
    userId: m.userId ?? "",
  }));

  const pendingInvitations = invitationsResult.data.map((inv) => ({
    createdAt: inv.createdAt,
    emailAddress: inv.email,
    id: inv.id,
    role: inv.role ?? "viewer",
  }));

  return (
    <MembersClient
      getCurrentUserId={userId}
      getCurrentUserRole={sessionRole ?? "viewer"}
      members={members}
      pendingInvitations={pendingInvitations}
    />
  );
};

export default MembersPage;
