import "server-only";
import type { AccountDirectory } from "./account-types";
import {
  inviteAccountMembers,
  listAccountInvitations,
  listAccountMembers,
} from "./adapters/better-auth-accounts";

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
  acceptAccountInvitation,
  getAccount,
  inviteAccountMember,
  inviteAccountMembers,
  leaveAccount,
  listAccountInvitations,
  listAccountMembers,
  listAccountMembersForJob,
  removeAccountMember,
  updateAccount,
  updateAccountMemberRole,
} from "./adapters/better-auth-accounts";
export const accountDirectory: AccountDirectory = {
  inviteMembers: inviteAccountMembers,
  listInvitations: listAccountInvitations,
  listMembers: listAccountMembers,
};
