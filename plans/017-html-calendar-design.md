# Plan 017: HTML Calendar View Design

## Spike outcome

The current feed projection is sufficient for a read-only HTML availability view. No STOP condition was reached. One nuance: the live `PreviewEvent` shape does not carry the raw `source_type`, so a richer future provenance chip that distinguishes Xero-synced leave from LeaveSync-created leave would need a projection addition. The thin month/list HTML view does not require that field.

Drift check:

```bash
git diff --stat 400eb53..HEAD -- packages/feeds/src/projection packages/feeds/src/render packages/feeds/src/preview
```

The command produced no stat output in this session, so there was no observed drift in the checked feed projection, render, or preview paths.

## Projection reuse

`projectFeedEvents` returns `PreviewEvent[]`, which is already render-ready for both ICS and HTML. The shared event shape carries:

| Field | HTML use |
|---|---|
| `summary` | Primary event title. Already privacy-applied. |
| `displayName` | Person or masked/private label. Already privacy-applied. |
| `description` | Optional supporting detail. Already removed unless privacy permits it. |
| `location` | Optional location. Already removed for private feeds. |
| `recordType` | Availability event type labelling, including leave, manual availability categories, and public holidays. |
| `contactabilityStatus` | Status chip such as contactable, limited contact, or unavailable. |
| `isPublicHoliday` | Public holiday styling and labelling. |
| `startsAt`, `endsAt`, `allDay` | Month grouping, date range, and time display. |
| `publishedUid`, `publishedSequence` | Stable identity and versioning for parity with the ICS path. |
| `sourceRecordId` | Debug or future DOM identity if needed. |

The important invariant is that the HTML renderer must consume these projected fields as-is. It must not re-query people, inspect raw availability records, or re-derive privacy visibility.

The thin prototype in `packages/feeds/src/render/render-html.ts` follows that boundary: it accepts `PreviewEvent[]` and a feed name, sorts and groups events for display, escapes projected text, and returns a complete HTML string. It does not call `projectFeedEvents`, touch auth, or access storage.

## Surface decision

The preferred production surface is a token-gated public route in `apps/api`, parallel to:

```text
GET /ical/:token.ics
```

Recommended route shape:

```text
GET /calendar/:token
```

Rationale:

- It matches the subscription feed model: the feed token is the shareable capability.
- It avoids adding an authenticated app-only surface that would have different reach from the ICS feed.
- It can reuse the same token lookup, revocation, expiry, and feed status checks as `renderFeedForToken`.
- It keeps the HTML view read-only and outside app navigation, which fits a shareable availability page.

Privacy story:

- The route must render using the feed's configured `privacy_mode`.
- The projection already applies privacy before rendering, including masked names, private summaries, hidden descriptions, and hidden private locations.
- The HTML renderer must never special-case privacy modes. It should render only the projected `PreviewEvent` fields.
- Revoked or expired tokens should mirror the ICS route behaviour and return `410 Gone`.

Authenticated app pages still have value for feed preview and configuration, but they should remain management surfaces. The public HTML route is the canonical shareable view.

## Caching and ETag reuse

The ICS path caches rendered feed bodies through `feedCacheKey`, currently based on feed id, feed `updated_at`, and privacy mode, then stores the rendered body plus ETag in Vercel KV.

The HTML renderer should reuse the same invalidation concept but not the exact same body key namespace, because ICS and HTML are different representations. Recommended production pattern:

```text
feed:{feed_id}:{feed_updated_at}:{privacy_mode}:html
feed:{feed_id}:{feed_updated_at}:{privacy_mode}:ics
```

The HTML ETag should be a SHA-256 hash of the final HTML body, just as the ICS body ETag is derived from the serialised calendar body. The API route can then:

1. Look up the active feed token.
2. Build the HTML cache key from feed id, feed `updated_at`, privacy mode, and representation.
3. Return `304 Not Modified` when `If-None-Match` matches the cached or freshly rendered ETag.
4. Cache successful HTML responses with the same TTL strategy as ICS.
5. Update `last_rendered_at` and `last_etag` only if the existing fields are intended to track all feed representations. Otherwise, add representation-specific tracking in a follow-up schema plan.

Open caching decision: whether `last_etag` remains ICS-specific or becomes "latest rendered representation". The current schema has one `last_etag`, so a production HTML route should avoid overwriting it until that ownership is settled.

## Layout

The first HTML view should be a compact month/list layout, not a full interactive grid. It suits a token-gated read-only page because it is scannable, responsive, printable, and does not need client JavaScript.

Recommended structure:

- Contextual header using `surface-container-low`, with feed name and a concise generated timestamp.
- Main content grouped by month.
- Each month uses a tonal container, not borders or shadows.
- Each event row shows date/time first, summary second, then small chips for record type, location, and contactability where projected.
- Leave-like record types use sage chip treatment. Manual availability categories and public holidays use the accent container treatment, consistent with `DESIGN.md`.
- Empty state uses a tonal container with direct copy: "No published availability events in this feed."

Design constraints from `DESIGN.md`:

- Use Plus Jakarta Sans.
- Use surface tokens and tonal layering for persistent content.
- Use 16px radius for containers and 12px radius for chips.
- Do not use borders or shadows for persistent calendar rows.
- Keep green as signal, not decoration.
- Keep accent purple for manual availability provenance and informational states.
- Support light and dark mode through CSS custom properties.

The prototype includes these decisions inline so the follow-up route can inspect a complete HTML body, but production wiring should decide whether the CSS remains inline for cacheable standalone pages or moves to a shared static asset.

## Open questions

- Should the public HTML route expose only token-gated feed pages, or should authenticated app previews get an identical HTML body for admin review?
- Should HTML and ICS share one `last_etag` field, or should feed render metadata become representation-specific?
- Should public holiday rows include jurisdiction or location labels if future projection fields add them?
- Should feed timezone be added to the projection or feed model before production HTML, so timed events can display in the feed owner's local timezone rather than UTC?
- Should `source_type` be added to `PreviewEvent` before production HTML, so provenance chips can distinguish Xero-synced leave from LeaveSync-created leave?
- Should the production HTML page expose a print stylesheet and a downloadable ICS link, or should it remain a single-purpose read-only page?
