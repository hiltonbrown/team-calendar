# GitHub retained-reference remediation request

Prepared 19 September 2026. Not submitted. Submit through the repository owner's
GitHub Support account after confirming credential revocation. Do not attach
credentials, raw history or unredacted scanner output.

Repository: `hiltonbrown/team-calendar`.

Please remove retained pull-request references and cached views containing the
credential previously committed in `.mcp.json`. The authorised heads and tag
were already rewritten; a fresh mirror still exposes the historical commit
`ea03db99df4e036b175e7137af9cc1a4419e1d40` through 114 GitHub-managed pull-request
head references. The current main head is
`54f8df5d3b20e569a70c31b5002b2bb8b213bdba`; no current branch or tag contains that
historical commit. Please confirm removal of the retained references and cached
commit/file views, and identify any additional repository-owner action required.

Evidence: Gitleaks 8.30.1 (published SHA256 verified), fresh mirror, all-ref scan,
1,571 commits on 19 September 2026. The scanner identified the historical
`.mcp.json:7` finding with fully redacted output. Other test/example findings are
being triaged separately and are not grounds for deleting unrelated references.

Required before closing the release security item:

- Provider evidence that the exposed credential is revoked or rotated.
- GitHub Support case reference and confirmed purge outcome.
- Fresh mirror rescan proving the historical credential is no longer reachable.

This request does not authorise another shared-history rewrite or revocation of
unrelated credentials.
