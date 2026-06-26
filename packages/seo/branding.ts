// Single source of truth for the public brand. Do not hardcode the brand
// name or primary domain elsewhere; import from here, the same principle as
// the no-hardcoded-colour rule in DESIGN.md.

// Display form: two words, title case. Use in prose, headings, button
// text, alt text, OG titles, and structured data.
export const brandNameDisplay = "Team Calendar";

// Package and internal slug form: hyphenated. Use in package names, npm-style
// names, repo-internal identifiers, and directory-safe slugs.
export const brandNameSlug = "team-calendar";

// Compact slug form: no separator. Use only where a separator is invalid:
// domains and the ICS UID host.
export const brandNameSlugCompact = "teamcalendar";

// Primary domain host name
export const primaryDomain = "teamcalendar.online";

// Canonical primary domain URL
export const primaryDomainUrl = `https://${primaryDomain}`;

// ICS feed UID host name
export const icsUidHost = `ical.${primaryDomain}`;

// ICS feed UID suffix (with prepended @ symbol)
export const icsUidSuffix = `@${icsUidHost}`;

// Fallback email domain for Xero contacts without emails
export const noemailFallbackDomain = `noemail.${primaryDomain}`;
