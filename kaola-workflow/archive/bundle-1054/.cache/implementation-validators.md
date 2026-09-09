# Validator acceptance pass — issue #1054, mission "validator acceptance" (test-author custody)

Custody: `scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`,
`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`,
`plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`. Worktree
`bundle-1054`, base `6ae5374b`. `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` is
a byte copy, refreshed via `node scripts/edition-sync.js --write`, never hand-edited.

## Failures each validator showed before this pass's edits

Baseline captured at the start of this mission (this session's edits to the four files were
already in the working tree from an earlier, compaction-interrupted turn of this same role — see
"State found at mission start" below for what was already fixed vs. what this pass completed).

- `scripts/validate-workflow-contracts.js`: was failing on `agents/implementer.md must include:
  smoke-integration` (retired four-name verification-tier vocabulary) and on the three
  `finding: id=` pins across `agents/code-reviewer.md` / `security-reviewer.md` /
  `adversarial-verifier.md` (retired column-zero review protocol), and on
  `assertIncludes('commands/kaola-workflow-finalize.md', 'run-gaps-manual.md')` (this pin had the
  RETIRED item-1/2/4 grammar backwards — it required presence of the manual-seed sidecar token
  that #1054 removes outright).
- `scripts/validate-kaola-workflow-contracts.js`: was failing on the AGENTS.md 200-line notice
  (ADR 0023: no line budget) and on the Codex-edition `finding: id=` / `verdict: pass` pins on the
  three reviewer `.toml` bodies (same retired protocol, TOML carrier).
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` and
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`: same
  `finding: id=` / `verdict: pass` pins on their reviewer `.toml` bodies.

## State found at mission start (this session)

All four A-outcome fixes above were already present in the dirty worktree when this mission
started (git diff showed them uncommitted, unstaged, matching the description in
`roles-rewrite.md`'s "Coupling measured with the new bodies" section). Re-running all four
validators at mission start confirmed:

- `scripts/validate-workflow-contracts.js` → exit 0.
- `plugins/kaola-workflow-gitlab/.../validate-kaola-workflow-gitlab-contracts.js` → exit 0.
- `plugins/kaola-workflow-gitea/.../validate-kaola-workflow-gitea-contracts.js` → exit 0.
- `scripts/validate-kaola-workflow-contracts.js` → **exit 1**, on
  `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js must match
  scripts/kaola-workflow-codex-preflight.js`. This is NOT a role-body wording pin — it is the
  validator correctly detecting that item 29's constants-consolidation work
  (impl-1054-constants, outside this custody) had edited the canonical script but not yet
  refreshed its byte-copy mirror. Confirmed by diffing the two files directly (large diff at that
  point) and by the fact the assertion is a byte-equality check, not a content_tokens pin.

## Outcome A — per-pin table (retired protocol → kept-as-behavior or deleted)

| file:line (post-edit) | retired token | disposition | reason |
|---|---|---|---|
| `scripts/validate-workflow-contracts.js` ~760 | `assertIncludes('agents/implementer.md', 'smoke-integration')` | kept as behavior | replaced with `assertConcept(..., 'implementer delivers verification evidence without altering acceptance meaning', ['the checks you ran', 'acceptance means'])` — the four-name tier enum is retired procedure ritual (#1054 item 20/23), but the implementer body still states this survives concept and it stays pinned as absence-of-weakening. |
| `scripts/validate-workflow-contracts.js` ~780 | `assertIncludes` loop over 3 reviewer `.md` bodies for `finding: id=` | kept as behavior | replaced with per-role `assertConcept` calls, each pinned to that role's own current wording (`findings a reader can verify` / `findings with evidence` / `record of the strongest refutation attempts`) — the rigid column-zero row format has no production consumer (`parseRecordedVerdict`'s only consumer is `.cache/final-validation.md`, not these bodies; verified against `roles-rewrite.md` and `scripts/kaola-workflow-adaptive-schema.js:1374`), but each role must still deliver verifiable findings as a concept. |
| `scripts/validate-workflow-contracts.js` ~900 | `assertIncludes('commands/kaola-workflow-finalize.md', 'run-gaps-manual.md')` | inverted to absence | was pinning PRESENCE of the manual-seed sidecar token (n5/#653-era); #1054 items 1/2/4 retire that grammar outright. Rewrote as `assertExcludes(..., 'run-gaps-manual.md')` and `assertExcludes(..., 'gap-sweep')` — a regression that reintroduces either reds this pin now, where before a regression that removed the (now-wrong) required token would have. |
| `scripts/validate-kaola-workflow-contracts.js` ~224-232 | 200-line AGENTS.md notice (`agentsMdLines > 200` warning) | deleted | ADR 0023: no line budget can ever fail or warn on AGENTS.md size (owner ruling, standing memory). Replaced with a one-line comment stating the rule. |
| `scripts/validate-kaola-workflow-contracts.js` ~350 | Codex-edition `finding: id=` + `verdict: pass` loop over 3 reviewer `.toml` bodies | kept as behavior | same disposition as the `.md` case above, `assertConcept` on the `.toml` files. |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` ~395 | same loop, GitLab `.toml` bodies | kept as behavior | same disposition, gitlab pluginRoot paths. |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` ~401 | same loop, Gitea `.toml` bodies | kept as behavior | same disposition, gitea pluginRoot paths. |

Verified NO remaining retired-token pins in any of the four files for: `computeBacklogDelta`,
`net_backlog_delta`, `follow_ups_filed`, `follow_up_numbers`, `doc-updater.md`, `## Run gaps`,
`mission_list`, `countComplete`, `persistMissionListToSummary`, `probeMissionListCoherence`,
`gap-sweep --check`, `samplesMatch`, `median-of-K`, `Beta posterior`, `pass-rate`, `kw-opt`, `>80%`,
`rm -rf node_modules`, `< 5%`, four-phase/50-line/4-layer wording, `dispatched surface`, and the
tests-green/regression-green/build-green/smoke-integration enum — none found (`grep` across all
four files). `assertIncludes('commands/kaola-workflow-finalize.md', 'verdict: pass')` at
`validate-workflow-contracts.js:504` was checked and is a DIFFERENT, still-valid pin: it names the
`.cache/final-validation.md` machine-consumer contract finalize reads (not the retired reviewer
role-body protocol) — left untouched.

Not in this custody (found via `roles-rewrite.md`'s coupling notes, listed for the record, not
acted on here): `test-runtime-agent-architecture` A1050 (metric-optimizer continuous/pass-rate
protocol), `test-install-model-rendering` #1018 AC-7 ("dispatched surface" wording), `test-issue-1046`
A1 (custody wording) — none of these are among the four files in this custody.

## Outcome B — item 28, ledger-guard pins (file:line, fixture, assertions)

`scripts/validate-workflow-contracts.js` ~734-737 (pre-edit). Replaced 4 source-shape
`assertIncludes` pins (`'kaola-workflow-ledger-compare.js'`, `"reason: 'finalize_mirror_refused',"`,
`'if (!verdict.safe) {'`, `"inner_reason: 'mirror_sync_failed',"`) with:

1. Kept `assertIncludes('scripts/kaola-workflow-claim.js', "reason: 'finalize_mirror_refused',")` —
   this is the top-level, stable refusal-reason string surfaced to the operator by `cmdFinalize`
   (not part of the #1054 ledger-content rewrite; unchanged by the in-flight work).
2. Requires the real exports: `kaola-workflow-ledger-compare.js`'s `compareLedgers` and
   `kaola-workflow-claim.js`'s `mirrorFinalizationArtifacts` (the exported write-path sibling of
   the unexported read-only `probeFinalizeMirror` the brief named — `probeFinalizeMirror` is
   internal-only per `module.exports` at `kaola-workflow-claim.js:6752-6820`, so the observable
   behavior is exercised through the function that is actually exported and calls the same
   `compareLedgers` verdict on the same refusal path).
3. Fixture assertions against `compareLedgers` directly (no I/O):
   - `compareLedgers('src text', null)` → `{ safe: true, reason: 'first_sync' }`.
   - `compareLedgers('same text', 'same text')` → `{ safe: true, reason: 'identical' }`.
   - `compareLedgers('src text v2', 'dest text v1 — different content')` →
     `{ safe: false, reason: 'content_diverged' }`.
4. Fixture assertion against `mirrorFinalizationArtifacts` on a REAL linked git worktree (built with
   `scripts/test-git-fixture.js`, the same technique `test-issue-1054-ledger-guard.js` uses): a main
   root + `git worktree add` linked worktree, main copy's `kaola-workflow/issue-99001/mission-list.md`
   set to one status line, worktree copy set to a different one (content-diverged). Asserts
   `mirrorFinalizationArtifacts(wtPath, project)` returns `{ refused: true, inner_reason:
   'mirror_sync_failed', ... }` — i.e., the transaction refuses fail-closed rather than guessing a
   repair direction (the retired #837 worktree-wins auto-merge #1054 supersedes).

Verified: `node scripts/validate-workflow-contracts.js` exits 0 with the fixture in place (git
worktree create/remove noise suppressed via explicit `stdio` on the two `G.exec` calls).

Verification of the fixture's own arming (RED-on-regression) was attempted by temporarily changing
`if (!verdict.safe) {` to `if (false && !verdict.safe) {` in `scripts/kaola-workflow-claim.js` and
re-running the validator; the harness's permission classifier blocked that specific `node` re-run
("Blocked by classifier", no stated reason beyond that). The production-file mutation was reverted
immediately (`git diff --stat` confirmed the file returned to its pre-mutation, other-agents'-work
state before any further action) and the mutant-based RED proof was NOT obtained — reported here as
a capability gap rather than claimed. Positive evidence obtained instead: the fixture's assertion on
`mirrorFinalizationArtifacts`'s actual return value (`refused === true && inner_reason ===
'mirror_sync_failed'`) passed against the REAL current implementation, which is direct evidence the
fixture exercises the real refusal path and not a vacuous no-op (a vacuous fixture — e.g. dest
missing, or src/dest never diverging — would hit a *different* return shape, e.g. `{ mirror: ... }`
without `refused`, and the assertion's exact-shape check would have failed instead of passing).

## Outcome C — complete: all 80 DUP candidates proven duplicate, deleted

Was initially blocked on `test-route-reachability.js` (18 T6c failures — `required-blocks.js`'s
`fn-forge-is-the-backlog` block still mandating retired run-gap wording, per
`implementation-finalize.md`'s "Findings for other owners" #1, owned by tdd-1054-finalize, not this
custody). Messaged tdd-1054-finalize for status; re-checked shortly after and
`test-route-reachability.js` was green (148 assertions) — proceeded.

### Fresh partition (matches the audit baseline exactly)

```
node scripts/measure-validator-duplication.js
scripts/validate-workflow-contracts.js:          561 distinct, 78 DUP, 483 KEEP
  36 nx-mission-list, 24 nx-claim-is-bookkeeping, 6 nx-concurrency-is-judgment,
  6 nx-resume-rule, 3 fn-validation-report, 2 fn-changed-paths-report, 1 fn-archive-loses-nothing
scripts/validate-kaola-workflow-contracts.js:     238 distinct, 2 DUP (nx-claim-is-bookkeeping), 236 KEEP
plugins/.../validate-kaola-workflow-gitlab-contracts.js:  71 distinct, 0 DUP
plugins/.../validate-kaola-workflow-gitea-contracts.js:   69 distinct, 0 DUP
Total: 80 DUP candidates (78 + 2), matching the joint-design audit baseline (`.cache/joint-design/validator-duplication.txt`) precisely.
```

Every DUP row's `{file, line, token, targetFile, block}` was printed via a `node -e`-style script
over `measure-validator-duplication.js`'s own exports (`recordValidator`, `buildObligations`,
`classify`, `VALIDATORS`) — script kept at scratch `list-dup-rows.js`.

### Subtraction method (per-candidate, group order as dispatched)

For each of the 80 candidates: read the target surface file, locate the exact raw text matching the
validator's needle (whitespace-normalized, same normalization `checkManifest`/`norm()` use), delete
it from the in-memory copy, write the mutated file, run `test-route-reachability.js` (checked by
real exit code, not through a pipe — `spawnSync` return status directly, avoiding the
`$?`-after-a-pipe trap), then **immediately restore the original file content** and verify the
restore byte-for-byte before moving to the next candidate. RED (route-reachability exits non-zero)
= the required-block manifest's own `checkManifest` presence check already catches this exact
`(token, file)` removal = proven duplicate. GREEN = the manifest does not catch it = real coverage
would be lost by deleting the assertion. Automation: `subtraction-probe.js` in scratch.

**First pass (single-occurrence removal) found 9 false GREENs.** All 9 were tokens that recur
more than once in their target file for unrelated reasons (`--target-issue` appears twice in
`commands/workflow-next.md`; `workflow-state.md` and `--target-issue` appear twice in the Codex
`kaola-workflow-next` SKILL.md; `## Changed Paths` appears three times in
`commands/kaola-workflow-finalize.md`) — `checkManifest`'s presence check is `content.includes(token)`
over the WHOLE file, so removing only the one occurrence the validator's own call site targeted left
the substring present via the other occurrence(s), producing a GREEN that reflects a probe artifact,
not a real coverage gap. **Re-ran those 9 removing ALL occurrences of the exact needle in the file
(the true test of what `checkManifest` would see if the token vanished from the surface
entirely) — all 9 flipped to RED.** Verified via a 13-row spot-check across every block (including 2
of these 9) that every RED's actual `test-route-reachability` failure message is
`FAIL: MANIFEST missing-token: block <id> token "<token>" absent from <file>` — i.e. genuine
manifest-coverage evidence, not collateral corruption from the mutation.

**Final result: all 80/80 candidates verdict RED — proven duplicate.** Zero GREEN, zero ERROR, zero
candidates needing to be kept. Restoration verified clean after every probe and after the full run
(`git status --short` on the touched surface trees showed no residue beyond other agents'
pre-existing, unrelated dirt).

### Per-candidate table (file:line, token, target file, block, verdict, mutant proof)

| block | validator file:line | token | target file | verdict | mutant proof |
|---|---|---|---|---|---|
| nx-mission-list | `scripts/validate-workflow-contracts.js:263` | `nothing depends on a stable ID` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:263` | `nothing depends on a stable ID` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:263` | `nothing depends on a stable ID` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:263` | `nothing depends on a stable ID` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:263` | `nothing depends on a stable ID` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:263` | `nothing depends on a stable ID` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:264` | `absent fields are simply absent` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:264` | `absent fields are simply absent` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:264` | `absent fields are simply absent` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:264` | `absent fields are simply absent` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:264` | `absent fields are simply absent` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:264` | `absent fields are simply absent` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:265` | `status: todo` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:265` | `status: todo` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:265` | `status: todo` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:265` | `status: todo` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:265` | `status: todo` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:265` | `status: todo` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:266` | `dispatched: self` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:266` | `dispatched: self` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:266` | `dispatched: self` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:266` | `dispatched: self` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:266` | `dispatched: self` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:266` | `dispatched: self` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:269` | `before the work goes` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:269` | `before the work goes` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:269` | `before the work goes` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:269` | `before the work goes` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:269` | `before the work goes` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:269` | `before the work goes` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:272` | `mission, not a specification` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:272` | `mission, not a specification` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:272` | `mission, not a specification` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:272` | `mission, not a specification` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:272` | `mission, not a specification` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-mission-list | `scripts/validate-workflow-contracts.js:272` | `mission, not a specification` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-kaola-workflow-contracts.js:133` | `workflow-state.md` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (removed all 2 occurrences) |
| nx-claim-is-bookkeeping | `scripts/validate-kaola-workflow-contracts.js:139` | `--target-issue` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (removed all 2 occurrences) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:253` | `The claim is bookkeeping` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:253` | `The claim is bookkeeping` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:253` | `The claim is bookkeeping` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:253` | `The claim is bookkeeping` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:253` | `The claim is bookkeeping` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:253` | `The claim is bookkeeping` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:254` | `reports a fact about the target rather than a verdict` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:254` | `reports a fact about the target rather than a verdict` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:254` | `reports a fact about the target rather than a verdict` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:254` | `reports a fact about the target rather than a verdict` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:254` | `reports a fact about the target rather than a verdict` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:254` | `reports a fact about the target rather than a verdict` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:255` | `--target-issue` | `commands/workflow-next.md` | RED | route-reachability exit 1 (removed all 2 occurrences) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:255` | `--target-issue` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (removed all 2 occurrences) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:255` | `--target-issue` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (removed all 2 occurrences) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:255` | `--target-issue` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (removed all 2 occurrences) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:255` | `--target-issue` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (removed all 2 occurrences) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:255` | `--target-issue` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (removed all 2 occurrences) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:256` | `--target-issues` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:256` | `--target-issues` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:256` | `--target-issues` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:256` | `--target-issues` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:256` | `--target-issues` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-claim-is-bookkeeping | `scripts/validate-workflow-contracts.js:256` | `--target-issues` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-concurrency-is-judgment | `scripts/validate-workflow-contracts.js:221` | `Dispatch when it materially reduces main-context residue` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-concurrency-is-judgment | `scripts/validate-workflow-contracts.js:221` | `Dispatch when it materially reduces main-context residue` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-concurrency-is-judgment | `scripts/validate-workflow-contracts.js:221` | `Dispatch when it materially reduces main-context residue` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-concurrency-is-judgment | `scripts/validate-workflow-contracts.js:222` | `Keep one owner for the current cohesive production surface` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-concurrency-is-judgment | `scripts/validate-workflow-contracts.js:222` | `Keep one owner for the current cohesive production surface` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-concurrency-is-judgment | `scripts/validate-workflow-contracts.js:222` | `Keep one owner for the current cohesive production surface` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-resume-rule | `scripts/validate-workflow-contracts.js:282` | `if the output the dispatch promised has landed` | `commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-resume-rule | `scripts/validate-workflow-contracts.js:282` | `if the output the dispatch promised has landed` | `plugins/kaola-workflow-gitea/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-resume-rule | `scripts/validate-workflow-contracts.js:282` | `if the output the dispatch promised has landed` | `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-resume-rule | `scripts/validate-workflow-contracts.js:282` | `if the output the dispatch promised has landed` | `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-resume-rule | `scripts/validate-workflow-contracts.js:282` | `if the output the dispatch promised has landed` | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| nx-resume-rule | `scripts/validate-workflow-contracts.js:282` | `if the output the dispatch promised has landed` | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | RED | route-reachability exit 1 (single occurrence) |
| fn-validation-report | `scripts/validate-workflow-contracts.js:546` | `It does not refuse` | `commands/kaola-workflow-finalize.md` | RED | route-reachability exit 1 (single occurrence) |
| fn-validation-report | `scripts/validate-workflow-contracts.js:547` | `under \`validation\`` | `commands/kaola-workflow-finalize.md` | RED | route-reachability exit 1 (single occurrence) |
| fn-validation-report | `scripts/validate-workflow-contracts.js:548` | `## Validation` | `commands/kaola-workflow-finalize.md` | RED | route-reachability exit 1 (single occurrence) |
| fn-changed-paths-report | `scripts/validate-workflow-contracts.js:549` | `` `changed_paths` `` | `commands/kaola-workflow-finalize.md` | RED | route-reachability exit 1 (single occurrence) |
| fn-changed-paths-report | `scripts/validate-workflow-contracts.js:550` | `## Changed Paths` | `commands/kaola-workflow-finalize.md` | RED | route-reachability exit 1 (removed all 3 occurrences) |
| fn-archive-loses-nothing | `scripts/validate-workflow-contracts.js:552` | `fails loudly if it would lose a file` | `commands/kaola-workflow-finalize.md` | RED | route-reachability exit 1 (single occurrence) |

### Assertions deleted (all 80, by disposition)

All 80 proven-duplicate assertions were deleted from the validator source (not commented out), with
a one-line pointer comment to this record left at each site:

- `scripts/validate-workflow-contracts.js`: 78 deletions across 18 source lines (2 lines in the
  `nextCommandCopies` loop at ~220; 12 lines inside the `nextSurfaces` loop at ~244-286, covering
  nx-claim-is-bookkeeping/nx-mission-list/nx-resume-rule; 6 lines in the finalize
  validation/changed-paths/archive block at ~543-552, all fully deleted since every assertion in
  that block was proven duplicate). `assertBefore(file, 'Write the mission list', 'Run it')` and
  every `assertNotIncludes` in the same loops were left untouched (absence claims are never
  manifest-obligated, and `assertBefore` is a different check `classify()` does not evaluate).
- `scripts/validate-kaola-workflow-contracts.js`: 2 deletions. `--target-issue` on line 139 (a
  single-target call) was deleted outright. `workflow-state.md` on line 133 was NOT deleted outright
  — it sits inside a loop shared by all 3 Codex skills (init/next/finalize), and the manifest only
  obligates it for the `kaola-workflow-next` skill (the `kaola-workflow-init`/`kaola-workflow-finalize`
  instances were classified KEEP by `measure-validator-duplication.js`, since they were never
  recorded as DUP rows). Rewrote the loop to skip the check only for `kaola-workflow-next`, keeping
  it for the other two skills — this is a narrower, correct deletion, not a full-line removal.

### Verification after deletion

```
node scripts/validate-workflow-contracts.js                                            -> 0
node scripts/validate-kaola-workflow-contracts.js                                       -> 1 (byte-copy mirror stale — see next line)
node scripts/edition-sync.js --write   (refreshed plugins/kaola-workflow/scripts/validate-workflow-contracts.js byte copy after this pass's deletions to the canonical file) -> 0
node scripts/validate-kaola-workflow-contracts.js                                       -> 0 (after refresh)
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js   -> 0
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js     -> 0
node scripts/test-route-reachability.js                                                 -> 0 (148 assertions passed)
node scripts/measure-validator-duplication.js                                           -> 0
  scripts/validate-workflow-contracts.js:        483 distinct, 0 DUP, 483 KEEP (was 561/78/483)
  scripts/validate-kaola-workflow-contracts.js:  236 distinct, 0 DUP, 236 KEEP (was 238/2/236)
  gitlab/gitea: unchanged at 0 DUP
```

`git diff --stat` on the four custody files plus the mechanical byte-copy mirror shows only those
five files touched by this mission; `git status --short` on the surface trees the subtraction probes
mutated (`commands/`, `plugins/*/commands/`, `plugins/*/skills/`) shows no residue beyond other
agents' pre-existing, unrelated dirt (verified both mid-run and after the full 80-candidate pass).

## Commands + exit codes (full pass, current tree)

```
node scripts/validate-workflow-contracts.js                                            -> 0
node scripts/validate-kaola-workflow-contracts.js                                       -> 0
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js   -> 0
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js     -> 0
node scripts/validate-script-sync.js                                                    -> 0 (14 common scripts, 25 byte-identical groups, 0 rename-normalized, 2 hooks.json families, 5 forge export-superset families; kernel parity OK)
node scripts/test-route-reachability.js                                                 -> 0 (148 assertions)
node scripts/measure-validator-duplication.js                                           -> 0 (0 DUP across all four files)
node plugins/kaola-workflow/scripts/validate-workflow-contracts.js                       -> 1, pre-existing/unrelated (commands/kaola-workflow-finalize.md is missing — wrong-root resolution bug, reproduces on unrelated files, matches implementation-finalize.md finding #4, not in this custody)
```

## Stop condition reached

All outcomes complete. Outcomes A, B, and C are done: all four custody validators exit 0 on the
current tree, `test-route-reachability.js` is green, and `measure-validator-duplication.js` reports
0 DUP across all four files (every one of the 80 baseline candidates got a recorded RED/GREEN
verdict from a real subtraction probe; all 80 were RED/proven-duplicate and are now deleted).

## Orchestrator mutant proof for outcome B (the author's own attempt was blocked by a permission prompt)
Planted in scripts/kaola-workflow-ledger-compare.js: `compareLedgers` reports divergence as `{safe: true, reason: 'identical'}` (one site, line ~102). `node scripts/validate-workflow-contracts.js` → exit 1, "compareLedgers(diverged texts) must be unsafe/content_diverged, got: {"safe":true,"reason":"identical",…}". File restored from a byte snapshot (cmp identical), validator exit 0 again. The item-28 behavior check is armed.

## Correction + concurrent-edit re-verification (after team-lead's concurrency notice)

Team-lead flagged that the role-pin part of outcome A (the `smoke-integration` → `assertConcept`
and the three `finding: id=`/`verdict: pass` → per-role `assertConcept` rewrites) was done by
**tdd-1054-roles**, not by an earlier turn of this same role as this record originally described —
correcting that misattribution here. Re-read all four validators after their notice: the
`assertConcept` calls at `scripts/validate-workflow-contracts.js:822-855` (implementer/code-reviewer/
security-reviewer/adversarial-verifier) are exactly the ones already verified and reported above;
no rework was needed, and none was done — this section only VERIFIES their replacements still hold
on the current renders (all four validators still exit 0, confirmed below) per the "do not rewrite
them again" instruction.

Checked the finalize-record pins team-lead named as this custody's remaining outcome-A scope
(run-gaps, `doc-updater.md`, `## Mission List` finalize-findings landing, issue-body-length
transcription): `grep` across all four validators for `doc-updater.md`, `doc-docking.md`,
`## Mission List`, and body/issue-length wording returns no matches in any of the four files — none
of these are currently pinned anywhere that would fail. The run-gaps conversion
(`assertExcludes('commands/kaola-workflow-finalize.md', 'run-gaps-manual.md')` and
`assertExcludes(..., 'gap-sweep')` at `scripts/validate-workflow-contracts.js:968-969`, already
recorded above under outcome A) is confirmed still present. Nothing remains failing in this
custody's finalize-record scope.

Re-ran the full verification chain after `node scripts/edition-sync.js --write` (0 files updated —
already in sync) to account for tdd-1054-finalize's and impl-1054-constants' concurrent edits:

```
node scripts/validate-workflow-contracts.js                                            -> 0
node scripts/validate-kaola-workflow-contracts.js                                       -> 0
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js   -> 0
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js     -> 0
node scripts/validate-script-sync.js                                                    -> 0
node scripts/test-route-reachability.js                                                 -> 0 (148 assertions)
node scripts/measure-validator-duplication.js                                           -> 0 (0 DUP everywhere, unchanged)
```

Team-lead also flagged impl-1054-constants mid-editing `scripts/kaola-workflow-codex-preflight.js`
and `install-codex-agent-profiles.js` with an in-flight duplicate `MANIFEST_BASENAME` declaration
that could break `validate-kaola-workflow-contracts.js` end-to-end. At the moment of this
re-verification pass, `node -c` on both `scripts/kaola-workflow-codex-preflight.js` and
`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` (the latter is where that file
actually lives; there is no `scripts/install-codex-agent-profiles.js`) reports syntax OK, and
`validate-kaola-workflow-contracts.js` exits 0 — so the failure was not observed here, and is
recorded as pre-existing-in-flight elsewhere per instruction, not something to act on from this
custody. If a future run shows it, that is impl-1054-constants' in-progress work landing
transiently mid-edit, not a regression introduced by this mission.

## Owner ruling (19:03 heartbeat): all role-body wording pins deleted, no synonym gate

Binding ruling: `assertConcept` (defined identically in all four validators, `norm(read(file)
.toLowerCase()).includes(norm(term.toLowerCase()))` per term) is a literal-phrase check regardless
of the "concept" name — an equivalent rephrasing of a role body reds it just as hard as the retired
`assertIncludes` pins it replaced. Item 28 is not done while a wording pin (by any name) exists on a
role body's current sentence. Removed every such pin this run added, in all four validators, with
**no replacement gate of any kind** (no synonym list, no co-occurrence check, no new keyword). What
now carries this responsibility: `generate-agent-profiles.js --check` and
`validate-vendored-agents.js` (every rendered role body is proven byte-equal to its authority,
`templates/agents/behavior-contracts.json`, hash-bound), the manifest/hash checks, and native
behavior acceptance (mission 14, real dispatched-task quality on live hosts). Nothing else in these
four files pins a role body's prose — every remaining `assertConcept` call in all four files targets
a non-role-body surface (AGENTS.md, the machine-global contract, docs, the walkthrough, the adaptive
mission-list model in `agents.toml`'s own scripts, or "Agent-owned project instructions" — none of
these are the #1054 role-rewrite's target text) and was not touched, per "no other files" / scope.

### Deleted-pin table (13 total, all role-body wording pins added by this #1054 mission)

| file | original lines | role body targeted | concept name (deleted) | terms (deleted) | replacement |
|---|---|---|---|---|---|
| `scripts/validate-workflow-contracts.js` | 822-825 | `agents/implementer.md` | implementer delivers verification evidence without altering acceptance meaning | `the checks you ran`, `acceptance means` | none — comment only, citing generate-agent-profiles --check / validate-vendored-agents / mission 14 |
| `scripts/validate-workflow-contracts.js` | 848-850 | `agents/code-reviewer.md` | code-reviewer delivers verifiable findings | `findings a reader can verify` | none |
| `scripts/validate-workflow-contracts.js` | 851-853 | `agents/security-reviewer.md` | security-reviewer delivers findings with evidence | `findings with evidence` | none |
| `scripts/validate-workflow-contracts.js` | 854-856 | `agents/adversarial-verifier.md` | adversarial-verifier delivers refutation-attempt evidence | `record of the strongest refutation attempts` | none |
| `scripts/validate-kaola-workflow-contracts.js` | 356-358 | `${pluginRoot}/agents/code-reviewer.toml` | code-reviewer delivers verifiable findings | `findings a reader can verify` | none |
| `scripts/validate-kaola-workflow-contracts.js` | 359-361 | `${pluginRoot}/agents/security-reviewer.toml` | security-reviewer delivers findings with evidence | `findings with evidence` | none |
| `scripts/validate-kaola-workflow-contracts.js` | 362-364 | `${pluginRoot}/agents/adversarial-verifier.toml` | adversarial-verifier delivers refutation-attempt evidence | `record of the strongest refutation attempts` | none |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | 405-407 | `${pluginRoot}/agents/code-reviewer.toml` | code-reviewer delivers verifiable findings | `findings a reader can verify` | none |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | 408-410 | `${pluginRoot}/agents/security-reviewer.toml` | security-reviewer delivers findings with evidence | `findings with evidence` | none |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | 411-413 | `${pluginRoot}/agents/adversarial-verifier.toml` | adversarial-verifier delivers refutation-attempt evidence | `record of the strongest refutation attempts` | none |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 411-413 | `${pluginRoot}/agents/code-reviewer.toml` | code-reviewer delivers verifiable findings | `findings a reader can verify` | none |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 414-416 | `${pluginRoot}/agents/security-reviewer.toml` | security-reviewer delivers findings with evidence | `findings with evidence` | none |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 417-419 | `${pluginRoot}/agents/adversarial-verifier.toml` | adversarial-verifier delivers refutation-attempt evidence | `record of the strongest refutation attempts` | none |

Per-file counts: `scripts/validate-workflow-contracts.js` 4, `scripts/validate-kaola-workflow-contracts.js`
3, gitlab 3, gitea 3 — **13 deleted, 0 replaced.**

Note the root file's implementer pin has no counterpart in the three `.toml` editions (the retired
`smoke-integration` four-name tier vocabulary was only ever pinned in the `.md` carrier per the
original coupling note), so the asymmetry (4 vs 3/3/3) is structural, not a missed deletion.

### Verification after deletion

```
node scripts/edition-sync.js --write                                                    -> 0 (1 file updated: plugins/kaola-workflow/scripts/validate-workflow-contracts.js byte copy)
node scripts/validate-workflow-contracts.js                                            -> 0
node scripts/validate-kaola-workflow-contracts.js                                       -> 0
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js   -> 0
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js     -> 0
node scripts/validate-script-sync.js                                                    -> 0
node scripts/test-route-reachability.js                                                 -> 0 (148 assertions, unaffected — assertConcept was never part of its manifest-derived universe)
node scripts/measure-validator-duplication.js                                           -> 0
  scripts/validate-workflow-contracts.js:        483 -> 483 distinct assertions, 0 DUP (unchanged)
  scripts/validate-kaola-workflow-contracts.js:  236 -> 236 distinct assertions, 0 DUP (unchanged)
  gitlab/gitea: unchanged at 0 DUP
```

**No new DUP appeared.** This is expected on inspection, not just by measurement:
`measure-validator-duplication.js`'s capture overrides only `assertIncludes`/`assertNotIncludes` (see
its `OVERRIDE` template) — `assertConcept` calls `assert()` directly and was never recorded as a
candidate by that tool in the first place, so this deletion is orthogonal to the item-27 DUP
partition (which stayed exactly as it was: 0 DUP across all four files, matching the state already
reported after the item-27 work above).

**Counts: 13 role-body wording pins deleted, 0 replaced, 0 new DUP, all four validators + script-sync
+ route-reachability + duplication-measurement exit 0.**
