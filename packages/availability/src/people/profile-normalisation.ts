const WHITESPACE_PATTERN = /\s+/;

export interface CurrentUserProfileInput {
  avatarUrl?: string | null;
  clerkUserId: string;
  displayName?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface NormalisedCurrentUserProfile {
  avatarUrl: string | null;
  displayName: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

export function normaliseCurrentUserProfile(
  input: CurrentUserProfileInput
): NormalisedCurrentUserProfile {
  const email = normaliseEmail(input.email);
  const displayName =
    cleanString(input.displayName) ??
    cleanString(
      [cleanString(input.firstName), cleanString(input.lastName)]
        .filter(Boolean)
        .join(" ")
    ) ??
    email ??
    input.clerkUserId;
  const nameParts = displayName.split(WHITESPACE_PATTERN);
  const firstName = cleanString(input.firstName) ?? nameParts[0] ?? "User";
  const lastName =
    cleanString(input.lastName) ??
    cleanString(nameParts.slice(1).join(" ")) ??
    input.clerkUserId;

  return {
    avatarUrl: cleanString(input.avatarUrl) ?? null,
    displayName,
    email,
    firstName,
    lastName,
  };
}

export function safeCurrentUserProfilePatch(
  profile: NormalisedCurrentUserProfile
): {
  avatar_url?: string | null;
  display_name?: string;
} {
  return {
    ...(profile.avatarUrl ? { avatar_url: profile.avatarUrl } : {}),
    ...(profile.displayName ? { display_name: profile.displayName } : {}),
  };
}

export function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normaliseEmail(
  value: string | null | undefined
): string | null {
  const trimmed = cleanString(value);
  return trimmed ? trimmed.toLowerCase() : null;
}
