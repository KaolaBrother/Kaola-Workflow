# Workflow Plan — issue-672

<!-- plan_hash: 43d3ad6449ce6b65da9d504165b97deb8ceba9482503dff471eece80692bb8f5 -->

fix(scripts): two residual porcelain-probe fail-opens deferred from #669 — (site 1) the
`synthesizeLevel` leg-dirty-commit probe in `kaola-workflow-adaptive-node.js` reports a leg CLEAN on
any `git status --porcelain` exec error, so real committed/working leg content is silently omitted
from the octopus merge; (site 2) `worktreeDirtyState` in `kaola-workflow-claim.js` returns `'missing'`
on a probe error, conflating unprobeable-with-absent, so a mis-probed dirty legacy/stale worktree can
feed a DESTRUCTIVE removal. Harden both from fail-OPEN to fail-CLOSED.

## Meta
speculative_open_policy: auto

labels:
issue: 672
sink: merge
validation_command: npm test

## Design rationale (orientation for the executor — not part of the frozen grammar)

This is a fail-OPEN → fail-CLOSED hardening on a LIVE octopus-merge path (silent content-loss class)
plus a DESTRUCTIVE worktree-removal gate — exactly the class where an adversarial change-gate earns
its keep (cf. #669). Localization is settled at authoring time (function names below; line numbers
drift), so no probe node is needed. A single serial spine:

  n1-fix (tdd-guide) → n2-review (code-reviewer, G1) → n3-adversary (adversarial-verifier change-gate,
  post-dominates the code node) → n4-finalize (sink; discharges the #307 four-chain).

Both files are ONE coherent node, not parallel legs: they are the same porcelain-probe fail-closed
edit family (semantic coupling, not merely disjoint files), so keeping them in one node lets the same
agent converge the two sites and their cross-edition mirrors by construction. No `main-session-gate`:
acceptance is FULLY machine-checkable (RED-first unit regressions + the adversary's constructed-attack
sweep + the four npm chains discharged at finalize), matching the recent cross-edition-fix pattern
(bundle-629-637). No `security-reviewer` (no security label; no auth/secrets/network surface). No
`doc-updater` node (no public-interface change — `'unprobeable'` is an internal state; the only doc
delta is a CHANGELOG `[Unreleased]` entry, a permitted `finalize` docs/state write).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-adaptive-node.js, scripts/test-claim-hardening.js | 10 | sequence | standard |
| n2-review | code-reviewer | n1-fix | — | 1 | sequence | reasoning |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning |
| n4-finalize | finalize | n3-adversary | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix effb2a71ceaa | |

| code-reviewer | subagent-invoked | evidence-binding: n2-review 3d3267b92ce1 | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary 0a4b5b5f3379 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 03427229d7ca | |
## Node Briefs

### n1-fix

`tdd-guide`, standard. RED-first, both sites, then cross-edition mirror. Localize by FUNCTION NAME
(line numbers drift).

SITE 1 — `synthesizeLevel` leg-dirty-commit probe (`scripts/kaola-workflow-adaptive-node.js`, ~L4522,
a GENERATED_AGGREGATOR). Current: `let dirty = ''; try { dirty = execFileSync('git', ['-C',
leg.legPath, 'status', '--porcelain'], {maxBuffer: GIT_MAX_BUFFER}).trim(); } catch (_) { dirty = ''; }`
then `if (dirty) { add -A; commit }`. On ANY exec error the leg reads CLEAN → its real content is
silently omitted from the subsequent octopus merge (the `leg_omitted_from_merge` guard in
plan-validator.js is ancestry-only and does NOT cover this working-tree probe). FIX (fail-closed): on
probe error DO NOT keep `dirty=''`. PREFERRED — REFUSE the synthesis before the merge with a typed
reason (e.g. `{ ok:false, reason:'leg_probe_failed', nodeId:id, leg:id, detail:String(e&&e.message||e) }`)
so no content is silently dropped and the fault surfaces. ACCEPTABLE alternative — force the leg into
the capture path (treat as dirty → `add -A` + commit) so its content is merged; note this can
false-positive `leg_capture_failed` on a genuinely-clean-but-unprobeable leg, so prefer REFUSE. Edit
CANONICAL only; `node scripts/edition-sync.js --write` regenerates the codex twin + gitlab/gitea
@generated forge ports (declared in the write set per generated_port_split); finish with
`node scripts/edition-sync.js --check` clean.

SITE 2 — `worktreeDirtyState` (`scripts/kaola-workflow-claim.js`, ~L480, COMMON canonical↔codex byte +
DIVERGENT gitlab/gitea hand-ports). Current: top guard `if (!fs.existsSync(wtPath)) return 'missing'`
then a `status --porcelain` probe, `catch (_) { return 'missing'; }`. That catch (reached only when the
path EXISTS but the probe threw) conflates unprobeable with absent. Two DESTRUCTIVE consumers treat any
non-`'dirty'` state as removable: `cmdStaleWorktreeCleanup` (`'missing'` → `worktree prune` + push to
removed; else → `removeWorktree`) and `cmdSweepLegacyWorktrees` (~L3455, same pattern) — so a mis-probed
dirty tree is DESTROYED. FIX (fail-closed): in the catch return a NEW `'unprobeable'` state when
`fs.existsSync(wtPath)` (path present, probe failed); return `'missing'` ONLY for a genuinely-absent
path. Update BOTH destructive consumers so `'unprobeable'` is handled like `'dirty'` → KEPT/skipped,
NEVER routed into the `'missing'` prune branch nor `removeWorktree` (add a `skipped_unprobeable` bucket
or fold into `skipped_dirty`; do NOT let `--force`/`--archive`/`--export` blindly destroy an unprobeable
tree). Update the read-only reporter comment(s) (`// 'clean' | 'dirty' | 'missing'`). Apply the SAME
logical edit to CANONICAL claim.js (codex twin auto-copied byte via `edition-sync --write` COMMON) AND
HAND-APPLY to the DIVERGENT forge ports `kaola-gitlab-workflow-claim.js` + `kaola-gitea-workflow-claim.js`
(their `worktreeDirtyState` + both consumers are structurally identical — verified present; re-locate by
function name). Finish with `edition-sync --check` clean + `validate-script-sync.js` green.

RED-FIRST TESTS (both wired into the claude chain):
- `scripts/test-claim-hardening.js`: drive `worktreeDirtyState`'s probe-error path on an EXISTING path
  (path present but `git status` fails) → assert it returns `'unprobeable'`, NOT `'missing'`; assert
  `cmdSweepLegacyWorktrees` + `cmdStaleWorktreeCleanup` KEEP (do not prune/remove) an unprobeable tree.
- `scripts/test-adaptive-node.js`: drive `synthesizeLevel`'s leg-probe-error path → assert the leg is
  NOT silently dropped from the merge (captured/merged) OR the synthesis refuses with the typed reason.
  The current fail-open (silent clean-skip omitting real content) is the RED observation.

Model standard: the fix DIRECTION is fully specified here; the reasoning-tier review (n2) and adversary
(n3) gates catch any missed consumer or port. Write evidence with RED/GREEN tokens to
`kaola-workflow/issue-672/.cache/n1-fix.md`.

### n2-review

`code-reviewer`, reasoning. G1 gate over n1-fix. Confirm: (1) SITE 1 no longer treats a probe error as
clean (refuse-or-capture — no silent leg drop remains); (2) SITE 2 `worktreeDirtyState` returns
`'unprobeable'` on an existing-but-unprobeable path and BOTH destructive consumers
(`cmdStaleWorktreeCleanup` + `cmdSweepLegacyWorktrees`) treat `'unprobeable'` as keep (never
prune/remove), including under `--force`/`--archive`/`--export`; (3) the fix is faithfully mirrored
across all 4 adaptive-node editions (sync:editions regenerated) and all 4 claim editions (canonical +
codex byte-identical; gitlab/gitea hand-ports prose-converged modulo forge nouns); (4)
`edition-sync.js --check` + `validate-script-sync.js` are green and no export-superset drift was
introduced on the divergent forge claim ports; (5) the RED-first regressions genuinely FAIL on the
pre-fix code (not vacuous). Emit lowercase `verdict: pass` + `findings_blocking: 0` to
`kaola-workflow/issue-672/.cache/n2-review.md`.

### n3-adversary

`adversarial-verifier`, reasoning. Read-only WITH Bash. The CHANGE GATE for this silent-loss +
destructive-removal class (cf. #669); post-dominates the code node. Actively try to CONSTRUCT a
surviving fail-open: (a) any remaining `synthesizeLevel` catch/branch where a probe or exec error still
yields a clean-skip that omits real leg content from the octopus merge; (b) any claim path where an
`'unprobeable'` or `'dirty'` legacy/stale worktree still gets pruned or removed (probe the `'missing'`
prune branch, the `else → removeWorktree` branch, and the `--force`/`--archive`/`--export`
interactions). RUN the two unit regressions + the claude-chain walkthrough to confirm they actually
exercise the probe-error paths and are not vacuous. Confirm no OTHER porcelain empty-catch fail-open was
introduced by the diff. On a surviving fail-open/destructive path emit `verdict: fail` with the
construction; else `verdict: pass` + `findings_blocking: 0` to
`kaola-workflow/issue-672/.cache/n3-adversary.md`. NOTE: the four LONG npm chains are NOT run here
(subagent-can't-run-long-chains); the full four-chain green is discharged at n4-finalize.

### n4-finalize

`finalize`, unique docs/state sink (main-session-direct). Discharge the #307 cross-edition four-chain:
run SEQUENTIALLY `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run
test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` and confirm ALL FOUR exit 0 with their
success sentinels (capture REAL exit codes — never gate on a piped `| tail`; a green claude chain alone
is insufficient because `npm test` short-circuits on the first `&&` failure). Confirm
`edition-sync.js --check` clean. Add a `CHANGELOG.md` `[Unreleased]` entry under `### Fixed` noting the
porcelain-probe fail-closed hardening (site 1 leg-dirty probe → no silent octopus-merge omission; site 2
`worktreeDirtyState` → `'unprobeable'` ≠ `'missing'`, fail-closed before any destructive worktree sweep)
for #672. Docs/state write only (`CHANGELOG.md`). Verify the issue ends CLOSED (not merely exit-0). Do
NOT claim the optional closure-audit/release cap done — it is explicitly OUT OF SCOPE (see Plan Notes).

## Plan Notes

- EDITION CLASSES (determined at authoring): `kaola-workflow-adaptive-node.js` = GENERATED_AGGREGATOR
  (canonical + codex twin `plugins/kaola-workflow/scripts/...` + gitlab `kaola-gitlab-workflow-...` +
  gitea `kaola-gitea-workflow-...` @generated ports, all via `edition-sync.js --write`; declared
  together per generated_port_split). `kaola-workflow-claim.js` = COMMON_SCRIPTS canonical↔codex
  (byte-identical, sync:editions) + DIVERGENT gitlab/gitea forge hand-ports
  (FORGE_EXPORT_SUPERSET_FAMILY — hand-apply the same fail-closed edit; `worktreeDirtyState` + both
  destructive consumers were verified present and structurally identical in both forge ports). Test
  files `test-adaptive-node.js` + `test-claim-hardening.js` are canonical-only, wired into the claude
  chain (`test:kaola-workflow:claude`), which also runs `validate-script-sync.js` + `test-edition-sync.js`.
- OPTIONAL CAP — EXPLICITLY OUT OF SCOPE (issue #672 "Note"): `closure-audit.js` (`isDirty`, ~L166/173)
  and `release.js` (`trackedStatus`, ~L44) carry uncapped `git status --porcelain` content probes.
  BOTH already fail-CLOSED (closure-audit `catch → return true`; release `catch → {ok:false}`), so this
  is robustness/uniformity only, NOT a correctness hole. Left OUT because: neither file even defines
  `GIT_MAX_BUFFER` (the cap needs a new const), and pulling them in adds +8 cross-edition files
  (including a DIVERGENT closure-audit forge hand-port) for ZERO correctness gain. Per First Principles
  (correct-first is fully served by sites 1+2; surgical / spend-little). Recommend a trivial standalone
  uniformity follow-up if desired. NOT silently dropped — recorded here.
- REVIEWER-SUBAGENT MODEL: n2-review + n3-adversary carry `reasoning` in the plan `model` column
  because the validator grammar is `{reasoning, standard}` and `fable` is not a valid plan token. The
  KAOLA_GOAL `fable` reviewer-subagent override is applied at DISPATCH time by the executor (orthogonal
  to the frozen plan tier).
- No decision record (bug-fix hardening, no architectural decision). No `security-reviewer` /
  `doc-updater` / `main-session-gate` nodes (rationale in Design rationale above).
