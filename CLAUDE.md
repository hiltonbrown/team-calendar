# CLAUDE.md

All agent instructions for this repository live in `AGENTS.md`. Edit that file, not this one. Keep this file to the import below plus anything that applies only to Claude Code.

@AGENTS.md

<!-- Plan 161h: lifecycle controls and job/environment inventory are authoritative in AGENTS.md. -->
Xero lifecycle job: `reconcile-xero-connections`. Production configuration and existing enablement controls: `XERO_APP_TIER`, `XERO_RATE_NAMESPACE_EPOCH`, `XERO_CREDENTIAL_DOMAIN_ID`, `XERO_REDIRECT_URI`, `XERO_REMOTE_CLEANUP_MODE` (default `report_only`), `XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` and `XERO_TOKEN_ENCRYPTION_KEYS_JSON`. Follow the environment table in `AGENTS.md`. The binding guard and shared limiter are mandatory; per-binding owner cutover retains legacy fallback for unbackfilled bindings.
