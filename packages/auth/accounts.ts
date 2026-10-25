import "server-only";

import type { AccountDirectory } from "./account-types";
import {
  inviteAccountMembers,
  listAccountInvitations,
  listAccountMembers,
} from "./adapters/clerk-accounts";

export type {
  Account,
  AccountDirectory,
  AccountInvitation,
  AccountMember,
  InvitationInput,
  InviteMembersInput,
  ListInvitationsInput,
  ListMembersInput,
  Page,
} from "./account-types";
export {
  getAccount,
  inviteAccountMember,
  inviteAccountMembers,
  listAccountInvitations,
  listAccountMembers,
  removeAccountMember,
  updateAccount,
  updateAccountMemberRole,
} from "./adapters/clerk-accounts";

export const accountDirectory: AccountDirectory = {
  inviteMembers: inviteAccountMembers,
  listInvitations: listAccountInvitations,
  listMembers: listAccountMembers,
};

export { fromClerkRole as normalizeProviderMembershipRole } from "./adapters/clerk-roles";
