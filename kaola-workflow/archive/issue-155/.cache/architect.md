# Code Architect — issue-155: fail-closed remote validation

## Design Decisions

- **D1** — Add `probeIssueState(issueNumber)` → `{ state: 'closed'|'open'|'unavailable', reason }` to each forge's `*-active-folders.js` (exported). `claimProject` consumes it. Do NOT change `issueIsClosed`.
- **D2** — Fix all leak points: classifier catch, claim-wrapper catches, AND `cmdClaim→claimProject` bypass path.
- **D3** — Every new refusal sits below the existing `if (OFFLINE)` early return.
- **D4** — 4 forge trees: `scripts/` + `plugins/kaola-workflow/scripts/` (byte-synced) + GitLab + Gitea. `validate-script-sync.js` enforces byte identity of the first two.
- **D5** — `cmdStartup` maps any `result.status → verdict` automatically; no mapper change needed.

## Per-Forge Symmetry (verified)

| Forge | `cmdClassify` fail-open | in-process `classifyIssue` fail-open | claim-wrapper fail-open | `claimProject` calls closure check? |
|---|---|---|---|---|
| GitHub (`scripts/` + vendored) | `classifier.js:356-359` (subprocess stdout) | N/A (subprocess model) | `claim.js:299,307,310` (3 leak points) | Yes — `issueIsClosed` at `claim.js:326` |
| GitLab | `classifier.js:297-300` | `:255-257` | `claim.js:252-254` (1 leak) | Yes — `issueIsClosed` at `claim.js:299` |
| Gitea | `classifier.js:302-303` | `:260-261` | `claim.js:255-256` (1 leak) | Yes — `issueIsClosed` at `claim.js:302` |

## Files to Modify

| # | File | Change | Priority |
|---|---|---|---|
| F1 | `scripts/kaola-workflow-classifier.js` | `cmdClassify` catch (`:356-359`): `green` → `target_unavailable` | P0 |
| F2 | `scripts/kaola-workflow-claim.js` | 3 wrapper leaks → `target_unavailable`; `claimExplicitTarget` sibling; `claimProject` probe | P0 |
| F3 | `scripts/kaola-workflow-active-folders.js` | Add/export `probeIssueState` (ghExec variant) | P0 (blocks F2) |
| F4 | `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Byte-identical copy of F1 | P0 |
| F5 | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy of F2 | P0 |
| F6 | `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` | Byte-identical copy of F3 | P0 |
| F7 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | `cmdClassify` catch (`:297-300`) + in-process `classifyIssue` catch (`:255-257`) → `target_unavailable` | P0 |
| F8 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Wrapper catch + `claimExplicitTarget` sibling + `claimProject` probe | P0 |
| F9 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` | Add/export `probeIssueState` (forge.viewIssue variant) | P0 (blocks F8) |
| F10 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | `cmdClassify` catch (`:302-303`) + in-process catch (`:260-261`) → `target_unavailable` | P0 |
| F11 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same as F8, Gitea | P0 |
| F12 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` | Add/export `probeIssueState` (forge.viewIssue variant) | P0 (blocks F11) |
| F13 | `commands/workflow-next.md` | Line `:334` add `target_unavailable` to "Parallel decision" brace | P1 |
| F14 | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | Line `:335` same | P1 |
| F15 | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | Line `:335` same | P1 |
| F16 | `scripts/simulate-workflow-walkthrough.js` | GitHub tests (3 new test cases) | P1 |
| F17 | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | GitLab `withForge` tests | P1 |
| F18 | `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Gitea tests | P1 |
| F19 | `CHANGELOG.md` | Entry under `[Unreleased]` | P2 |

## Files to Create
None. `probeIssueState` lives inside existing `*-active-folders.js` modules.

## `probeIssueState` Helper Contract

GitHub (`ghExec` model):
```js
function probeIssueState(issueNumber) {
  if (OFFLINE || issueNumber == null) return { state: 'open', reason: 'offline-or-null' };
  try {
    const raw = ghExec(['issue', 'view', String(issueNumber), '--json', 'state']);
    if (!raw) return { state: 'unavailable', reason: 'empty gh response' };
    return { state: String(JSON.parse(raw).state || '').toLowerCase() === 'closed' ? 'closed' : 'open', reason: 'ok' };
  } catch (_) {
    return { state: 'unavailable', reason: 'gh issue fetch failed' };
  }
}
```
GitLab/Gitea: same shape, uses `forge.viewIssue(issueIid).state === 'closed'`.

`claimProject` consumption (replaces `issueIsClosed` block):
```js
if (issueNumber != null) {
  const probe = probeIssueState(issueNumber);
  if (probe.state === 'closed') return { status: 'user_target_closed', ... };
  if (!OFFLINE && probe.state === 'unavailable')
    return { status: 'target_unavailable', claim: 'none', issue: issueNumber, project, reasoning: '<forge> issue #N state probe failed; refusing outside KAOLA_WORKFLOW_OFFLINE=1' };
}
```

## Build Sequence

1. **G-helpers** (T1 GitHub, T2 GitLab, T3 Gitea) — parallel, disjoint files
2. **G-core** (T4 GitHub, T5 GitLab, T6 Gitea) — parallel within group; depends on respective helper
3. **G-docs** (T7), **G-tests** (T8/T9/T10) — parallel after core; T11 CHANGELOG parallel
4. **T12 Verify** — after all

## Task List

| Task | Write Set | Depends-on | Parallel Group | Action |
|---|---|---|---|---|
| T1 GitHub helper | F3, F6 | — | G-helpers | Add/export `probeIssueState` (ghExec); cp to vendored |
| T2 GitLab helper | F9 | — | G-helpers | Add/export `probeIssueState` (forge.viewIssue) |
| T3 Gitea helper | F12 | — | G-helpers | Same as T2 |
| T4 GitHub core | F1, F2, F4, F5 | T1 | serial | Classifier catch; 3 wrapper leaks; `claimExplicitTarget` sibling; `claimProject` probe; cp to vendored |
| T5 GitLab core | F7, F8 | T2 | G-core | 2 classifier catches + wrapper + sibling + probe |
| T6 Gitea core | F10, F11 | T3 | G-core | Same as T5, Gitea |
| T7 Docs | F13, F14, F15 | — | G-docs | Add `target_unavailable` to "Parallel decision" line |
| T8 GitHub tests | F16 | T4 | G-tests | 3 test cases: failing shim, missing CLI, OFFLINE regression |
| T9 GitLab tests | F17 | T5 | G-tests | 3 `withForge` test cases |
| T10 Gitea tests | F18 | T6 | G-tests | 3 test cases |
| T11 CHANGELOG | F19 | — | G-docs | `[Unreleased]` entry |
| T12 Verify | — | all | final | Full verification commands |

## Verification Commands (T12)

```bash
node scripts/simulate-workflow-walkthrough.js
node scripts/validate-script-sync.js
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
npm test
```

## Explicit Out-of-Scope

- `issueIsClosed` signature/body and its 4 safe callers
- `cmdStartup` status→verdict mapping
- `commands/workflow-next.md:152` typed-refusal enumeration (already includes `target_unavailable`)
- OFFLINE early-return blocks in all classifiers and `claimProject`
- GitHub Codex plugin `commands/` dir (does not exist)
- `e.status === 2 → owned` branch in GitHub `classifyIssue`
- `validate-script-sync.js` COMMON_SCRIPTS list
