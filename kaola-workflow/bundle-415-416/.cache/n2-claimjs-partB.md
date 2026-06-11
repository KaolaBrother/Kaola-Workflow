evidence-binding: n2-claimjs-partB 986dd1a2c571

## RED→GREEN

RED: test_416_probe_classification — TypeError: computeClosePendingFinalize is not a function
(pre-impl: helper did not exist; test file imported `{ computeClosePendingFinalize }` from claim.js
and immediately threw at the first `assert` call, before any assertion could run)

GREEN: all #416 probe-classification assertions pass; 39/39 claim-hardening assertions green

## What was fixed

The bug: in `cmdFinalize`, when the online forge probe throws (e.g. forge outage), the catch block
sets `remoteIssueClosed = 'skipped_offline'` while `OFFLINE` is false. The old inline expression:

```javascript
const closePendingFinalize = !keepIssueOpen && !OFFLINE &&
  remoteIssueClosed !== 'already_closed' && remoteIssueClosed !== 'closed';
```

evaluated to `true` in that case — 'skipped_offline' is neither 'already_closed' nor 'closed',
so the probe failure silently masqueraded as close_pending, downgrading the remote-members-closed
invariant.

The fix adds two pure exported helpers:
- `isProbeDegraded(offline, remoteIssueClosed)` — true when online but got 'skipped_offline'
- `computeClosePendingFinalize(keepIssueOpen, offline, remoteIssueClosed)` — excludes
  'skipped_offline' so a probe outage is treated as unknown, not pending

`cmdFinalize` now uses both helpers and attaches `probe_degraded: true` to the receipt post-build
when a probe degradation is detected.

## All 4 claim files fixed

1. `scripts/kaola-workflow-claim.js` (canonical) — helpers added before `buildClosureReceipt`,
   `closePendingFinalize` computation replaced, `probe_degraded` attached post-build, both helpers
   exported
2. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (codex peer) — synced via
   `node scripts/edition-sync.js --write`; byte-identical to canonical (verified with diff)
3. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (gitlab twin) — same
   helpers added (forge-neutral prose, no "GitHub" brand), same fix applied, helpers exported
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (gitea twin) — same
   helpers added (forge-neutral prose), same fix applied, helpers exported

## Test added

`scripts/test-claim-hardening.js` — new `#416` block with 9 assertions covering:
- online probe failure must NOT classify as close_pending (core bug scenario)
- isProbeDegraded detects the ambiguous online+skipped_offline case
- isProbeDegraded is false in the true OFFLINE path (expected token there)
- offline path never yields close_pending
- real close_pending probe result IS close_pending
- already_closed is not close_pending
- keep-open request is not close_pending
- isProbeDegraded is false for normal non-error tokens (close_pending, already_closed)

## Test run output

```
claim-hardening tests passed (39 assertions)
```

## All four chains green

- npm run test:kaola-workflow:claude — exit 0
- npm run test:kaola-workflow:codex — exit 0 (Kaola-Workflow walkthrough simulation passed)
- npm run test:kaola-workflow:gitlab — exit 0
- npm run test:kaola-workflow:gitea — exit 0 (Gitea workflow + Gitea Codex walkthrough passed)
- node scripts/edition-sync.js --check — "12 forge aggregator ports in rename-normalized parity with canonical"
