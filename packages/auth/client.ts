"use client";

export {
  type AccountSummary,
  type AuthActionData,
  type AuthActionResult,
  type AuthClientError,
  type AuthClientResult,
  type AuthSocialProvider,
  listAccounts,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  setActiveAccount,
  signInEmail,
  signInMagicLink,
  signInSocial,
  signOut,
  signUpEmail,
  useActiveOrganization,
  useListAccounts,
  useSession,
} from "./adapters/better-auth-client";
export {
  AccountUserMenu,
  type AccountUserMenuProperties,
  SignOutButton,
} from "./components/account-user-menu";
export { safeAuthReturnTo } from "./redirects";
export type { AuthSession, AuthUser } from "./types";
