# Plan 006: Decision Report — Public Pricing Surface

This report inventories the pricing/billing rails in the Team Calendar codebase, specifies options for the public pricing page, recommends a course of action, and lists open questions for the maintainer.

## Inventory

We have inventoried the codebase to map how pricing information is handled and how billing is enforced:

1. **Clerk Billing marketing page:**
   - The file [pricing-plans.tsx](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-plans.tsx#L3-L10) imports `PricingTable` and other Clerk billing components.
   - A scoped `ClerkProvider` is mounted at [pricing-plans.tsx:L12-L15](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-plans.tsx#L12-L15) because the marketing site's root layout disables authentication by default.
   - The `PlansFallback` component at [pricing-plans.tsx:L47-L58](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-plans.tsx#L47-L58) renders the "Plans are being finalised" card.
   - If no plans are configured, the component measures the table height using a `ResizeObserver` after an 1800 ms timeout at [pricing-plans.tsx:L60-L99](file:///home/hilton/Documents/teamcalendar/apps/web/app/pricing/components/pricing-plans.tsx#L60-L99) and swaps in the fallback card if the table is empty.

2. **Direct Stripe capabilities:**
   - The file [stripe.ts](file:///home/hilton/Documents/teamcalendar/packages/billing/src/stripe.ts#L49-L89) handles checkout session creation (`createCheckoutSession`) and portal session creation (`createPortalSession` at lines 91-114).
   - Stripe price IDs are mapped to internal plan keys using `resolvePlanKey` at [stripe.ts:L27-L36](file:///home/hilton/Documents/teamcalendar/packages/billing/src/stripe.ts#L27-L36).

3. **Plan Catalogue:**
   - The repository plan specifications live in [plans.ts](file:///home/hilton/Documents/teamcalendar/packages/database/src/seed/plans.ts#L12-L37).
   - This catalogue defines the features, limits, custom status, and Stripe price IDs (`STRIPE_PRICE_BASIC` and `STRIPE_PRICE_PREMIUM` env vars) for the Basic, Premium, and Enterprise plans.
   - Dollar amounts, currencies, and billing intervals are not defined in the code; they are owned solely by Stripe.
   - Syncing the database with these definitions is handled by `syncPlansFromCatalogue` at [plan-sync.ts:L9-L40](file:///home/hilton/Documents/teamcalendar/packages/database/src/seed/plan-sync.ts#L9-L40).

4. **In-app Upgrade Journey:**
   - The `getBillingSummary` service at [billing-service.ts:L56-L89](file:///home/hilton/Documents/teamcalendar/packages/availability/src/settings/billing-service.ts#L56-L89) checks credentials and sets `hasUpgradeFlow: true` for the settings page.
   - The dashboard-level summary gates upgrade visibility to the organisation owner at [billing-service.ts:L91-L125](file:///home/hilton/Documents/teamcalendar/packages/availability/src/settings/billing-service.ts#L91-L125) (using `parsed.data.actingRole === "owner"` at line 121).
   - The UI wrapper at [page.tsx:L36-L37](file:///home/hilton/Documents/teamcalendar/apps/app/app/%28authenticated%29/settings/billing/page.tsx#L36-L37) checks if the role is `"org:owner"` and sets `actingRole` to `"owner"` or `"admin"`.
   - The client component [billing-client.tsx:L114-L121](file:///home/hilton/Documents/teamcalendar/apps/app/app/%28authenticated%29/settings/billing/billing-client.tsx#L114-L121) triggers checkout sessions using actions linked to `startCheckout` or `startPortal` from [actions.ts](file:///home/hilton/Documents/teamcalendar/apps/app/app/%28authenticated%29/settings/billing/actions.ts).
   - Subscriptions are mirrored to the database at [route.ts:L46-L92](file:///home/hilton/Documents/teamcalendar/apps/api/app/webhooks/payments/route.ts#L46-L92) via Stripe webhooks.

## Options

Here are the three options for handling the public pricing page:

### Option A: Configure Clerk Billing
- **Description:** Keep Clerk's `<PricingTable />` on the marketing page. Configure matching plans inside the Clerk Billing dashboard, linking them to Stripe.
- **Effort:** Small. It requires configuring Clerk Billing dashboard settings, with minimal changes to the existing marketing code.
- **Risks:**
  - **Forked subscription source of truth:** The product app integrates directly with Stripe and maps subscriptions to `clerk_org_subscriptions` via webhook mirroring. Incorporating Clerk Billing introduces a second billing rail. Subscriptions started through Clerk's pricing table would rely on Clerk's subscription state, creating reconciliation hazards.
  - **Extra client-side bloat:** Mounts `ClerkProvider` on the marketing site, increasing JS bundle size and bundle dependencies on public pages.
  - Clerk Billing is not as mature or customizable as our direct Stripe integration.

### Option B: Static Catalogue-Driven Pricing Cards
- **Description:** Replace `<PricingTable />` with server-rendered React cards built from `PLAN_CATALOGUE` names, limits, and features. Public dollar amounts are stored in a new constants file in `apps/web` (since amounts do not live in the repository plan catalogue). The CTA buttons link users to the onboarding/sign-up flow (`/sign-up`). Once logged in, users upgrade via the existing owner-gated settings journey.
- **Effort:** Small to Medium. Requires writing a custom design-system compliant pricing cards component and removing the Clerk-specific fallbacks on the marketing pages.
- **Risks:**
  - **Plan information duplication:** Pricing amounts must be manually co-ordinated between Stripe and the marketing constants file. This risk can be mitigated by placing explicit cross-reference comments in `packages/database/src/seed/plans.ts` and the new constants file.

### Option C: Fetch Prices from the Stripe API
- **Description:** Retrieve price amounts directly from the Stripe API at build time (static site generation) or request time (server-side rendering) in `apps/web`. Render these amounts dynamically in custom cards.
- **Effort:** Medium. Requires integrating the Stripe SDK in `apps/web` and writing API fetch logic with robust error fallbacks.
- **Risks:**
  - **Secret configuration leakage:** Requires setting a `STRIPE_SECRET_KEY` in the marketing site build environment.
  - **API dependency failures:** If the Stripe API experiences downtime or rate limits, the pricing page could render empty or outdated values unless caching and fallback UI are implemented.

## Recommendation

We recommend **Option B: Static Catalogue-Driven Pricing Cards**.

### Rationale:
1. **Subscription Integrity:** Direct Stripe integration is already fully implemented, tested, and operational in the product app. Introducing Clerk Billing (Option A) would fork the subscription state, creating unnecessary synchronization complexity.
2. **Performance and Security:** Unlike Option C, Option B does not require configuring Stripe secrets on the marketing build or making external API calls at render time, ensuring the public marketing pages remain fast, secure, and resilient to third-party API downtime.
3. **Clean UX Funnel:** Visitors select a plan, sign up, and complete the secure payment flow inside the authenticated portal, which uses the existing owner-gated settings billing stack.

## Open Questions

We request the maintainer to clarify the following:

1. **Chosen Option:** Do you approve proceeding with Option B? (Default recommendation: Yes).
2. **Pricing Details:** What are the public dollar amounts and billing intervals (e.g. monthly, annual) for the Basic and Premium plans to be configured in the marketing constants? (Default suggestion: basic is $19/mo, premium is $49/mo).
3. **Enterprise Funnel:** Should the Enterprise CTA redirect to the contact form `#contact`? (Default suggestion: Yes, keeping `is_custom: true`).
4. **Code Cleanup:** Should the settle window height-measurement fallback hack in `pricing-plans.tsx` be completely deleted? (Default suggestion: Yes, once the Clerk `<PricingTable />` component is replaced by native React elements).
