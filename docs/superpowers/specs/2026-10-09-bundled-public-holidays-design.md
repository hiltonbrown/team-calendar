# Bundled Public Holidays Design

**Status:** Approved for planning, 9 October 2026.
**Implementation plan:** [Bundled public holidays plan](../plans/2026-10-09-bundled-public-holidays.md).

## Problem

Public holidays come from the Nager.Date API (`packages/availability/src/holidays/nager-client.ts`, `apps/app/app/actions/holidays/get-countries.ts`). The current process has these faults:

1. **Runtime third-party dependency.** Holidays are fetched at organisation provisioning (`people/current-user-service.ts:155`), when General settings change the organisation's country or state (`settings/general/_actions.ts:198`) and on manual import (`public-holidays/_actions.ts:52`). Provisioning ignores failures, so an outage at sign-up leaves an organisation with no holidays and nothing retries.
2. **No rollover.** `ensureDefaultPublicHolidaysForOrganisation` imports the current and next year once. Nothing imports later years, so holidays silently disappear as time passes.
3. **Stale and duplicate rows.** Imports only upsert, keyed on a lower-cased holiday name. A renamed or moved holiday leaves the old row in place and adds a new one; nothing is ever removed.
4. **Per-tenant copies.** Every organisation stores its own copy of the same official dates, plus a manually managed jurisdiction list.
5. **Wrong country list.** The country picker lists every Nager country although only Australia is supported (NZ and UK are planned).

## Decisions (from the requirements interview)

| Topic | Decision |
| --- | --- |
| Source | A bundled data file in the repository, built from official government sources. No runtime network calls. |
| Coverage | Australia (national plus ACT, NSW, NT, QLD, SA, TAS, VIC, WA), New Zealand (national plus provincial anniversary days) and the United Kingdom (England and Wales, Scotland, Northern Ireland). |
| Local days | Common local days ship in the file (for example Brisbane Royal Queensland Show, Melbourne Cup Day, Royal Hobart Show, NZ anniversary days). They are off by default; an admin switches each one on per location. |
| Storage | Official holidays are shared reference data read from the file. Organisations store only their own changes: custom holidays, hidden holidays, per-location working or non-working overrides and local-day opt-ins. |
| Horizon | Current year plus two (2026 to 2028 at release). |
| Part days | Stored with a start time (SA and NT Christmas Eve and New Year's Eve from 19:00). The day stays a working day; the calendar and feeds show "Public holiday from 19:00". |
| Existing data | Delete everything imported from Nager.Date, including its suppressions and location overrides. Custom holidays and their location overrides are kept. |
| Upkeep | Manual, by the team, once a year in September. No tests run on the data files. |
| Jurisdictions | Automatic: each location's country and region, falling back to the organisation's country and region, then to national holidays only. The manual jurisdiction list and import controls are removed. |

## Reference data

### Files

There is exactly one file per country, and each file holds only that country's entries: `au.json` (Australia), `nz.json` (New Zealand) and `uk.json` (United Kingdom). No combined or shared holiday file exists. Each file's top-level `country` must match its file name and every entry in it; adding a country later means adding one new file.

`packages/availability/src/holidays/reference/data/au.json`, `nz.json` and `uk.json`. JSON so non-developers can edit them; parsed once at module load with Zod; an invalid entry stops the app starting with an error naming the file and entry. No tests run on the data files.

```json
{
  "country": "AU",
  "entries": [
    {
      "id": "au-qld-2026-10-05-kings-birthday",
      "date": "2026-10-05",
      "name": "King's Birthday",
      "region": "QLD",
      "kind": "public"
    },
    {
      "id": "au-sa-2026-12-24-christmas-eve",
      "date": "2026-12-24",
      "name": "Christmas Eve",
      "region": "SA",
      "kind": "part_day",
      "startsAt": "19:00"
    },
    {
      "id": "au-qld-2026-08-12-royal-queensland-show",
      "date": "2026-08-12",
      "name": "Royal Queensland Show",
      "region": "QLD",
      "kind": "local",
      "area": "Brisbane"
    }
  ]
}
```

Field rules:

- `id`: `<country>-<region or "national">-<date>-<slug>`, lower case, unique across all files, never reused for a different holiday. It is the stable key for organisation preferences and feed UIDs.
- `date`: ISO date. Substitute and additional days are separate entries named as the official source names them (for example "Boxing Day (additional day)").
- `region`: `null` for national, otherwise a code from the region registry below.
- `kind`: `public` (full day, non-working by default), `part_day` (requires `startsAt` as `HH:mm`, working day by default), `local` (requires `area`; hidden until opted in).

### Region registry

`packages/core/src/regions.ts` (shared by holidays, location forms and settings):

- AU: `ACT`, `NSW`, `NT`, `QLD`, `SA`, `TAS`, `VIC`, `WA`.
- NZ: `AUK` (Auckland), `BOP` (Bay of Plenty), `CAN` (Canterbury), `CIT` (Chatham Islands), `GIS` (Gisborne), `HKB` (Hawke's Bay), `MBH` (Marlborough), `MWT` (Manawatū-Whanganui), `NSN` (Nelson), `NTL` (Northland), `OTA` (Otago), `STL` (Southland), `TAS` (Tasman), `TKI` (Taranaki), `WGN` (Wellington), `WKO` (Waikato), `WTC` (West Coast).
- UK: `EAW` (England and Wales), `SCT` (Scotland), `NIR` (Northern Ireland).

Countries use the product's existing codes (`AU`, `NZ`, `UK`).

### Years kept

Each file holds the current year plus two. Years older than last year may be removed.

## Organisation data

- `public_holidays` keeps only custom holidays (`source = manual`). The `nager` enum value, `public_holiday_jurisdictions`, `public_holiday_assignments`, `jurisdiction_id` and `source_payload_json` are removed.
- New table `public_holiday_preferences`:
  - `id`, `clerk_org_id` (indexed), `organisation_id`, `holiday_key` (reference `id`, or `custom:<public_holidays.id>`), `location_id` (nullable; null means organisation-wide), `setting` enum `hidden | working | non_working`, `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`.
  - Unique on `(organisation_id, holiday_key, location_id)`. An organisation-wide row is only ever `hidden`.
- Region codes on `organisations.region_code` and `locations.region_code` are normalised to registry codes. Unrecognised values become null (the location then falls back to the organisation).

## Resolution

One function decides what applies: `resolvePublicHolidays({ clerkOrgId, organisationId, from, to })`.

1. Load the organisation's country and region, active locations (id, name, country, region, timezone), custom holidays in range and preferences.
2. For each location (and an organisation-level pseudo-location used for people without a location), take its country and region (fallbacks: organisation's, then national only).
3. Select reference entries in range for that country where `region` is null or equals the location's region.
4. Apply preferences, most specific first: a location row wins over an organisation row.
   - `public`: shown non-working unless hidden or set to working.
   - `part_day`: shown as working with its start time unless hidden or set to non-working.
   - `local`: shown only when the location has a `working` or `non_working` row for it.
5. Add custom holidays with their existing country, region and "all jurisdictions" semantics, then apply the same preferences.
6. Return `ResolvedPublicHoliday[]`: `{ key, date, name, kind, startsAt, area, classification, origin: "official" | "custom", locationId }`.

All readers use this function: calendar cells, current status, feed projection, dashboard next holiday, onboarding state, organisation settings, the Public holidays page and Settings, Holidays. No reader queries holiday tables directly.

## Feeds

- Holiday event UID: `<organisationId>-<holidayKey><existing suffix>`. The one-time UID change when this ships is accepted (imported data is being replaced).
- `publishedAt` for official holidays is the reference data version (`PUBLIC_HOLIDAY_DATA_VERSION`, an ISO date bumped with every data edit); custom holidays keep `updated_at`.
- Part-day holidays publish as all-day events titled `Public holiday from 19:00: Christmas Eve`, avoiding per-feed timezone handling.
- No cache work is needed: the representation hash already covers event content, so a data release changes affected feeds on their next authoritative projection.

## User interface

- **Public holidays page:** a year selector and a list grouped by location, each holiday showing name, date, kind (Part day from 19:00, Local: Brisbane), classification and origin ("Official" or "Custom"). Actions per holiday and location: Hide, Mark as working day, Mark as non-working day, Restore. Import controls and the country fetch are removed. Empty state for a year beyond the data: "Official holidays for 2029 are not available yet. They are added each October." with an Add custom holiday action.
- **Settings, Holidays:** per location, a "Local holidays" list for its region with a switch per local day (off by default; switching on creates a `non_working` row). Saving ends with a receipt and an audit event.
- **Location and General settings:** the region field becomes a select from the registry for the chosen country.
- Admin changes write audit events: `public_holidays.hidden`, `public_holidays.restored`, `public_holidays.classification_changed`, `public_holidays.local_day_enabled`, `public_holidays.local_day_disabled`.

## Annual upkeep (manual)

Documented in `docs/public-holidays.md`:

1. Each September (a recurring team calendar reminder, not a test), a team member adds the next year's entries from each jurisdiction's official government public holidays page and checks recently announced one-off days.
2. Bump `PUBLIC_HOLIDAY_DATA_VERSION`, start the app locally to confirm the files load, open a pull request; a second person checks the entries against the official pages.
3. One-off holidays announced mid-year (for example a national day of mourning): admins can add a custom holiday immediately; the team adds the official entry in the next release.

## Out of scope

- Calculating holidays by rule; one-off gazetted days make rules incomplete anyway.
- Per-council local holidays beyond the common local days shipped in the file (admins add these as custom holidays).
- Changing leave balance calculations (balances stay Xero-sourced).
