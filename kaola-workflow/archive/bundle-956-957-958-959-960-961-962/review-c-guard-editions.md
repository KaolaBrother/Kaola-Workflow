# Review C — the #957 guard, cross-edition consistency, S5 comment rewrites

VERDICT: PASS — 0 confirmed defects. The new guard is mutation-proven armed on both tiers and both value axes, reflow-tolerant, cannot pass vacuously, and reachable in a chain that actually executes for every drift class it targets. All rewritten comments are true against the code they describe, all four trees agree, and every tombstone guard is intact and armed (one re-proven red/green in a disposable copy).

All mutations were performed in a disposable rsync copy under the session scratchpad, never in the worktree or main tree; the copy was restored and re-verified green (exit 0) after each mutation. No tracked file was edited; this report is the only write.

## Part 1 — the new guard (`scripts/validate-kaola-workflow-contracts.js:504-517`)

Mutation matrix (disposable copy; real exit codes captured directly, never via a pipe):

| # | Mutation | Expected | Observed |
|---|---|---|---|
| M1 | README standard-tier effort `medium`→`high` (README side only) | red | exit=1, thrown at validator:515, message names the standard tier and the built fragment |
| M2 | README reasoning-tier effort `xhigh`→`high` (on the wrapped second line) | red | exit=1, reasoning-tier message |
| M3 | delete the whole dispatch-prose paragraph (README:179-182) | red | exit=1, standard-tier message (first fragment fails) |
| M4 | aggressive reflow — same tokens re-wrapped across 6 lines, breaks mid-fragment | green | exit=0 — `norm()` (validator:23) collapses all whitespace runs; no maintenance trap on rewrap |
| M5a | preflight constant only `medium`→`high` | red | exit=1 — but at the PRE-EXISTING byte-parity pin ("plugins/... must match scripts/kaola-workflow-codex-preflight.js"), not the new guard |
| M5c | constant drifted in all live copies | red | exit=1 at the PRE-EXISTING literal pin (validator:448 "historical standard migration pair must be gpt-5.6-sol/medium") |
| M6 | coherent migration: constants in all 6 file copies (root + codex + both forge trees, preflight + installer) + validator literal pin + README all moved to `high` together | green | exit=0 — the full validator passes end to end |
| M6c | same as M6 but README lagging at `medium` | red | exit=1 at the NEW guard, and the "expected:" string shows `` `high` `` — the expectation is built from the mutated constant, proving it reads the constant, not a literal |
| M7 | README reasoning-tier MODEL `gpt-5.6-sol`→`gpt-5.7-sol` | red | exit=1, reasoning-tier message |

The author's three claimed proofs (red on mutated model, red on mutated effort, positive control) are independently re-verified: M7/M1-M2/M6+M6c. Note one sharpening the author's framing did not state: a CONSTANT-side mutation never reaches the new guard — the pre-existing byte-parity checks and the literal pins at validator:444-453 red first (M5a/M5c). The new guard's unique coverage is the README side, which is exactly the surface #957 said was unguarded. Both drift directions are caught by SOME check in the same file; the system fails closed either way.

Per-tier coverage: M1 proves standard-only, M2 reasoning-only; a both-tier drift trivially reds on the first loop iteration. Deletion of the sentence outright: M3.

Vacuity: impossible by construction. An empty `README.md` dies earlier at validator:481 (`roleListAnchor !== -1`), and even standing alone `''.includes(fragment)` is false, i.e. red not green. Undefined/empty constants produce a fragment containing `` `undefined` `` that cannot match README — red, fails closed (and validator:444-453 would already have red on the constants themselves). Fragment collision: `dispatches as` occurs on exactly one line region of README (grep count 1, README.md:180-181), and the fragment carries tier + model + effort, so it cannot match anything else.

Chain reach (package.json evidence): `scripts/validate-kaola-workflow-contracts.js` runs in `test:kaola-workflow:codex` ONLY (package.json:41). The claude chain (:40) and `:full` (:46) run a different validator, `scripts/validate-workflow-contracts.js`. This is NOT a hole at finalize or release: README.md is a member of `ROOT_EDITION_READ_FILES` (kaola-workflow-run-chains.js:712) and any `plugins/` path is edition-coupling (:742), so every diff that can move either side of this fact classifies all-four at finalize — the codex chain runs and the guard fires. A release always requires the unwaived four-chain receipt. The only run that skips it is a manually invoked claude fast gate, which the project already documents as a sampled, non-verifying gate.

Ran in the worktree (all read-only, verified from source first): `validate-kaola-workflow-contracts.js` exit=0, `validate-script-sync.js` exit=0, `edition-sync.js --check` exit=0, `generate-routing-surfaces.js --check` exit=0 (18 surfaces).

## Part 2 — one rule, one wording: I agree with not mirroring, with evidence

- The gitlab/gitea contract validators reference README zero times (grep count 0 in both). Their `root` does resolve to the repo root (validate-kaola-workflow-gitlab-contracts.js:7), so they COULD read it — but no README assertion has ever lived there, and adding one would create a second and third wording of the rule.
- There is no "codex twin at a different root" to break: `validate-kaola-workflow-contracts.js` is deliberately Codex-only and excluded from the byte-copy allowlist (validate-script-sync.js:34-35 names it and points to `validate-workflow-contracts.js` as the Claude validator). No plugins copy of the guard-bearing file exists. Had the guard gone into the CLAUDE validator instead, its policed byte-copy twin at `plugins/kaola-workflow/scripts/` resolves `root` to a directory with no README.md — the single-site codex placement avoids that class entirely.
- No forge-passes-while-wrong gap exists: chain selection is binary — claude-alone or all-four (classifyScope, run-chains.js:766-774; fail-closed on unresolved base). There is no path on which a gitlab/gitea chain runs as the standing verdict without the codex chain also running. `npm test` is all four.
- The constant side is already centrally pinned in the same validator: cross-tree byte-identity of all preflight copies (observed firing at :659 in M6full) and all three installers (:652), plus the literal pins :444-453. Mirroring the README pin per-forge would add wording, not reach.

## Part 3 — the S5 comment rewrites

Every rewritten claim was checked against the code it describes:

- `adaptiveSchema.evaluateChainReceipt` exists (kaola-workflow-adaptive-schema.js:1235) and its own header states "Called IN PROCESS" and "IT REPORTS; IT DOES NOT REFUSE" (:1207, :1210).
- claim.js finalize calls it in process: scripts/kaola-workflow-claim.js:4041, with `cacheDir = path.join(authorityDir, '.cache')` (:4036) and `project = basename(authorityDir)` — i.e. `kaola-workflow/<project>/.cache/chain-receipt.json` (kernel default :1260). A missing receipt returns the typed finding `chains_unverified` (:1264-1266) which the caller records in finalization-summary.md — "the check reads nothing and reports chains_unverified" is exact.
- Consumer mode: the kernel's dual-mode consumer arm reads `.cache/final-validation.md` (:1222-1225) — the SELF-HOST-ONLY header's attribution is true.
- "The only refusal is `chains_config_missing`" — live and typed: `resolveChains` has exactly one error constructor (run-chains.js:886), and the arm records `{ result: 'refuse' }`, prints the typed envelope, and returns 1 (:1099-1105). Within the `resolved.error` arm the "only" is precise. (Other refusals elsewhere in the file — `no_chains` :1140, the release-check :910 — are different sites; the sentence's scoping is unchanged from its pre-S5 wording.)
- Receipt-reader lines: the kernel indexes exactly name/exitCode/accepted_red (:1297, :1306) and reads `timed_out` for the operator hint (:1309).
- Barrier comments: `sanitizeBarrierTag` (claim.js:2597-2599) is byte-for-byte the described computation; `adaptive-node.js`/`plan-validator.js` exist nowhere in any of the four trees (full-tree find: only archived run-record artifacts carry those strings in file names). One measured nuance, not a defect: `git for-each-ref 'refs/kaola-workflow/**'` in the main repo enumerates 0 refs today, so "the refs they wrote are not [gone]" is not exemplified in the self-host; the statement is about the installed base the sweep code serves, and the operative claim — the shape is pinned by historical refs, no live caller — stands. The rewrite is strictly more truthful than the present-tense text it replaced.

Four-tree agreement:

- codex tree: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` and `...-run-chains.js` are byte-identical to root (cmp).
- run-chains is a GENERATED aggregator (edition-sync.js:64); `edition-sync --check` green in the worktree mechanically proves both forge ports are the exact rename-transform of the edited canonical.
- claim is hand-ported: both rewritten hunks verified present in gitlab (full diff inspected) and gitea (:2300, :5998), each with the correctly renamed self-reference (`kaola-gitlab-workflow-claim.js` / `kaola-gitea-workflow-claim.js` at the RECEIPT PATH site, run-chains :43-45 in each port). The state-dir name `kaola-workflow/<project>/` is forge-neutral, so that fragment is correct unrenamed. The historical short names "adaptive-node.js / plan-validator.js" match the pre-change forge wording — no rename regression.
- All four kernel copies byte-identical (cmp, base-named in every tree). The one-line `kaola-workflow-install-manifest.js` comment deletion moved identically in both its copies (cmp).

Tombstones intact and doing their job:

- `scripts/test-finalize-door.js` untouched by the diff. T1 (:452-460) re-proven armed in the disposable copy: appending `require("kaola-workflow-plan-validator")` to claim.js → exit=1 with the exact T1 message; restored → exit=0 (490 assertions). The S5 comment text cannot trip T1's require-regex.
- `scripts/validate-workflow-contracts.js:560-562` retired-vocabulary sweep (`plan-validator` among the banned tokens on `commands/kaola-workflow-finalize.md`) — present, target file untouched.
- Forge validators' #401 refusal-matrix anchors (gitlab:349, gitea:356) — present.
- Post-rewrite census: run-chains carries ZERO `plan-validator` mentions in all four trees; claim carries exactly the 2 deliberate historical references per tree.

Non-blocking observation (pre-existing, outside S5's declared scope of claim.js + run-chains.js): `scripts/test-run-chains.js:727` still says "plan-validator --finalize-check derives" in present tense — the same stale-naming class S5 fixed, in a file S5 did not cover. Not candidate-caused; recorded for visibility only.

finding: id=R1 scope=pre_existing action=report status=open severity=low fix_role=implementer rationale=test-run-chains.js:727 comment still names the retired plan-validator reader in present tense; outside the S5 delta, not candidate-caused

verdict: pass
findings_blocking: 0
review_conclusion: The #957 README guard is independently mutation-proven armed on both tiers, both value axes, deletion, and reflow, with its positive control showing it reads the preflight constants; the single-site placement is justified by binary chain selection and central constant pinning, and every S5 comment rewrite is true, propagated identically across all four trees, with all plan-validator tombstones intact and T1 re-proven red then green.
