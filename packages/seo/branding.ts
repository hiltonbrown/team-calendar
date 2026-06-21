// Single source of truth for the public brand. Do not hardcode the brand
// name or primary domain elsewhere; import from here, the same principle as
// the no-hardcoded-colour rule in DESIGN.md.

// Display form: two words, sentence case. Use in prose, headings, button
// text, alt text, OG titles, and structured data.
export const brandNameDisplay = "Team Calendar";

// Slug form: no space, lowercase. Use in identifiers, file names, URL slugs,
// and CSS class names.
export const brandNameSlug = "teamcalendar";

// Canonical primary domain. Secondary domains 301 redirect here at the
// DNS/Vercel level.
export const primaryDomain = "https://teamcalendar.online";
