import "server-only";

import type { AccountDirectory } from "./account-types";
import {
  getAccount as betterGetAccount,
  inviteAccountMember as betterInviteAccountMember,
  inviteAccountMembers as betterInviteAccountMembers,
  listAccountInvitations as betterListAccountInvitations,
  listAccountMembers as betterListAccountMembers,
  listAccountMembersForJob as betterListAccountMembersForJob,
  removeAccountMember as betterRemoveAccountMember,
  updateAccount as betterUpdateAccount,
  updateAccountMemberRole as betterUpdateAccountMemberRole,
} from "./adapters/better-auth-accounts";
import {
  getAccount as clerkGetAccount,
  inviteAccountMember as clerkInviteAccountMember,
  inviteAccountMembers as clerkInviteAccountMembers,
  listAccountInvitations as clerkListAccountInvitations,
  listAccountMembers as clerkListAccountMembers,
  removeAccountMember as clerkRemoveAccountMember,
  updateAccount as clerkUpdateAccount,
  updateAccountMemberRole as clerkUpdateAccountMemberRole,
} from "./adapters/clerk-accounts";
import { authProvider } from "./selection";

const betterAuthAccounts = {
  getAccount: betterGetAccount,
  inviteAccountMember: betterInviteAccountMember,
  inviteAccountMembers: betterInviteAccountMembers,
  listAccountInvitations: betterListAccountInvitations,
  listAccountMembers: betterListAccountMembers,
  removeAccountMember: betterRemoveAccountMember,
  updateAccount: betterUpdateAccount,
  updateAccountMemberRole: betterUpdateAccountMemberRole,
};

const clerk = {
  getAccount: clerkGetAccount,
  inviteAccountMember: clerkInviteAccountMember,
  inviteAccountMembers: clerkInviteAccountMembers,
  listAccountInvitations: clerkListAccountInvitations,
  listAccountMembers: clerkListAccountMembers,
  removeAccountMember: clerkRemoveAccountMember,
  updateAccount: clerkUpdateAccount,
  updateAccountMemberRole: clerkUpdateAccountMemberRole,
};

function directory() {
  return authProvider() === "clerk" ? clerk : betterAuthAccounts;
}

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
export const getAccount: typeof clerk.getAccount = (...args) =>
  directory().getAccount(...args);
export const inviteAccountMember: typeof clerk.inviteAccountMember = (
  ...args
) => directory().inviteAccountMember(...args);
export const inviteAccountMembers: typeof clerk.inviteAccountMembers = (
  ...args
) => directory().inviteAccountMembers(...args);
export const listAccountInvitations: typeof clerk.listAccountInvitations = (
  ...args
) => directory().listAccountInvitations(...args);
export const listAccountMembers: typeof clerk.listAccountMembers = (...args) =>
  directory().listAccountMembers(...args);
export const removeAccountMember: typeof clerk.removeAccountMember = (
  ...args
) => directory().removeAccountMember(...args);
export const updateAccount: typeof clerk.updateAccount = (...args) =>
  directory().updateAccount(...args);
export const updateAccountMemberRole: typeof clerk.updateAccountMemberRole = (
  ...args
) => directory().updateAccountMemberRole(...args);

/** Scheduled identity lookups use explicit Account IDs and never read a session. */
export const listAccountMembersForJob: typeof clerkListAccountMembers = (
  ...args
) =>
  (authProvider() === "clerk"
    ? clerkListAccountMembers
    : betterListAccountMembersForJob)(...args);

export const accountDirectory: AccountDirectory = {
  inviteMembers: inviteAccountMembers,
  listInvitations: listAccountInvitations,
  listMembers: listAccountMembers,
};
