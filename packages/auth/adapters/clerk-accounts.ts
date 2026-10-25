import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import type {
  Account,
  AccountInvitation,
  AccountMember,
  InvitationInput,
  InviteMembersInput,
  ListInvitationsInput,
  ListMembersInput,
  Page,
} from "../account-types";
import type { AuthRole } from "../permissions";
import { fromClerkRole, toClerkRole } from "./clerk-roles";

type Client = Awaited<ReturnType<typeof clerkClient>>;
type SourceAccount = Awaited<
  ReturnType<Client["organizations"]["getOrganization"]>
>;
type SourceInvitation = Awaited<
  ReturnType<Client["organizations"]["createOrganizationInvitation"]>
>;
type SourceMember = Awaited<
  ReturnType<Client["organizations"]["getOrganizationMembershipList"]>
>["data"][number];

const mapAccount = (source: SourceAccount): Account => ({
  id: source.id,
  image: source.imageUrl || null,
  name: source.name,
  publicMetadata: { ...source.publicMetadata },
  slug: source.slug ?? "",
});
const mapInvitation = (source: SourceInvitation): AccountInvitation => ({
  createdAt: source.createdAt,
  email: source.emailAddress,
  id: source.id,
  role: fromClerkRole(source.role),
  status: source.status ?? "unknown",
});
const mapMember = (source: SourceMember, accountId: string): AccountMember => ({
  accountId,
  email: source.publicUserData?.identifier ?? null,
  id: source.id,
  image: source.publicUserData?.imageUrl || null,
  name:
    [source.publicUserData?.firstName, source.publicUserData?.lastName]
      .filter(Boolean)
      .join(" ") || null,
  role: fromClerkRole(source.role),
  userId: source.publicUserData?.userId ?? "",
});
const invitationParameters = (input: InvitationInput) => ({
  emailAddress: input.email,
  inviterUserId: input.inviterUserId,
  role: toClerkRole(input.role),
});

export async function getAccount(accountId: string): Promise<Account> {
  const client = await clerkClient();
  return mapAccount(
    await client.organizations.getOrganization({ organizationId: accountId })
  );
}
export async function updateAccount(
  accountId: string,
  input: { name?: string; publicMetadata?: Record<string, unknown> }
): Promise<Account> {
  const client = await clerkClient();
  return mapAccount(
    await client.organizations.updateOrganization(accountId, input)
  );
}
export async function listAccountMembers(
  input: ListMembersInput
): Promise<Page<AccountMember>> {
  const client = await clerkClient();
  const page = await client.organizations.getOrganizationMembershipList({
    limit: input.limit,
    offset: input.offset,
    organizationId: input.accountId,
    userId: input.userIds,
  });
  return {
    data: page.data.map((member) => mapMember(member, input.accountId)),
    totalCount: page.totalCount,
  };
}
export async function listAccountInvitations(
  input: ListInvitationsInput
): Promise<Page<AccountInvitation>> {
  const client = await clerkClient();
  const page = await client.organizations.getOrganizationInvitationList({
    limit: input.limit,
    offset: input.offset,
    organizationId: input.accountId,
    status: input.status,
  });
  return { data: page.data.map(mapInvitation), totalCount: page.totalCount };
}
export async function inviteAccountMember(
  input: InvitationInput & { accountId: string }
): Promise<AccountInvitation> {
  const client = await clerkClient();
  return mapInvitation(
    await client.organizations.createOrganizationInvitation({
      organizationId: input.accountId,
      ...invitationParameters(input),
    })
  );
}
export async function inviteAccountMembers(
  input: InviteMembersInput
): Promise<Page<AccountInvitation>> {
  const client = await clerkClient();
  const page = await client.organizations.createOrganizationInvitationBulk(
    input.accountId,
    input.invitations.map(invitationParameters)
  );
  return { data: page.data.map(mapInvitation), totalCount: page.totalCount };
}
export async function removeAccountMember(input: {
  accountId: string;
  userId: string;
}): Promise<void> {
  const client = await clerkClient();
  await client.organizations.deleteOrganizationMembership({
    organizationId: input.accountId,
    userId: input.userId,
  });
}
export async function updateAccountMemberRole(input: {
  accountId: string;
  userId: string;
  role: AuthRole;
}): Promise<void> {
  const client = await clerkClient();
  await client.organizations.updateOrganizationMembership({
    organizationId: input.accountId,
    role: toClerkRole(input.role),
    userId: input.userId,
  });
}
