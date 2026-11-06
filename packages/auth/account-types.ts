import type { AuthRole } from "./permissions";

export interface Account {
  id: string;
  image: string | null;
  name: string;
  publicMetadata: Record<string, unknown>;
  slug: string;
}
export interface AccountMember {
  accountId: string;
  email: string | null;
  id: string;
  image: string | null;
  name: string | null;
  role: AuthRole | null;
  userId: string;
}
export interface AccountInvitation {
  createdAt: number;
  email: string;
  id: string;
  role: AuthRole | null;
  status: string;
}
export interface Page<T> {
  data: T[];
  totalCount: number;
}
export interface ListMembersInput {
  accountId: string;
  limit?: number;
  offset?: number;
  userIds?: string[];
}
export interface ListInvitationsInput {
  accountId: string;
  limit?: number;
  offset?: number;
  status?: ("pending" | "accepted" | "revoked" | "expired")[];
}
export interface InvitationInput {
  email: string;
  inviterUserId?: string;
  role: AuthRole;
}
export interface InviteMembersInput {
  accountId: string;
  invitations: InvitationInput[];
}
export interface AccountDirectory {
  inviteMembers: (
    input: InviteMembersInput
  ) => Promise<Page<AccountInvitation>>;
  listInvitations: (
    input: ListInvitationsInput
  ) => Promise<Page<AccountInvitation>>;
  listMembers: (input: ListMembersInput) => Promise<Page<AccountMember>>;
}
