evidence-binding: n5-adversarial b3fa5f4ba4ab
verdict: pass
findings_blocking: 0

finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=documented-release-sequence-dead-end-FIXED-forge-helpers-hermeticity-verified-and-full-sequence-re-walked-to-green-by-this-gate
finding: id=R2 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=partial-chain-receipt-fail-open-FIXED-coverage-arm-chains_incomplete-verified-against-crafted-AND-official-producer-subset-receipts

upstream_read: n4-docs ace34bdc161e
upstream_read: n1-release-gate af77ad8fe2fc
upstream_read: n3-review ff3b324f4ae8
upstream_read: n2-strictness-tests 41cdd8308e59

## Claim Under Test (re-verify window, nonce b3fa5f4ba4ab)

"The repaired bundle correctly and completely implements ALL acceptance criteria of issues #651 and #652, docs included, regression-free" — after the R1 (forge-helpers hermeticity) + R2 (coverage arm) repairs and the N3-1 docs pass. The repair is uncommitted working-tree state, so all scratch experiments used an rsync snapshot of the worktree (`git init` + commit; zero tags), never a git clone (which would have missed the repair) and never the worktree itself.

## Disproof Attempt

### My original counterexample (a) — subset receipt: now refuses, twice over

- Crafted claude-only green clean-stamped receipt at the snapshot HEAD → `{"result":"refuse","reason":"chains_incomplete",...,"missingChains":["codex","gitlab","gitea"],"expectedChains":["claude","codex","gitlab","gitea"],...}` exit 1 — structural payload exactly as documented.
- Then with the OFFICIAL producer (not trusting n1's leg 2): `KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-run-chains.js --chains claude --json` → producer exit 0 (legitimate output), then `--release-check --json` → same `chains_incomplete` refusal, exit 1. R2 fix binds.

### My original counterexample (b) — documented sequence: re-walked to green, not assumed

In the rsync snapshot: complete hygiene bump commit (package.json 6.21.5→6.21.6 + 3 README edition lines + 2 .claude-plugin manifests + CHANGELOG heading) = candidate cb9b71a5, ZERO tags. `KAOLA_WORKFLOW_OFFLINE=1 KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --json` → `{"result":"pass","failed":[]}`; receipt `{"headSha":"cb9b71a5...","workTreeHash":"clean"}` with all four chains exitCode 0 unwaived — the previously-dead blanket-ambient-OFFLINE path went green THROUGH the R1-fixed gitlab/gitea suites (this same walk was red `failed:["gitlab","gitea"]` pre-repair). `--release-check --json` at the untagged candidate → pass envelope, exit 0; tag then created — the documented sequence completes end-to-end. R1 fix binds.

### R1 hermeticity verified directly in the worktree

All four combos now exit 0 (pre-repair the OFFLINE ones were exit 1): gitlab plain=0, gitlab OFFLINE=0, gitea plain=0, gitea OFFLINE=0. Diff review: +7 lines per suite (comment + `delete process.env.KAOLA_WORKFLOW_OFFLINE` before any require); the deliberate offline sub-test's own set/cache-bust/restore is untouched; zero production-script changes.

### New coverage arm probed for fail-opens — none found

- No package.json (fresh git repo) + fully GREEN four-chain receipt → `{"result":"refuse","reason":"repo_kind_undetermined",...}` exit 1 — fail-closed, the vacuous-coverage hole is shut.
- package.json with ZERO test:kaola-workflow:* scripts + green four-chain receipt → `repo_kind_undetermined`, exit 1.
- Expected set adapts correctly: repo declaring only claude+codex → 2-chain green receipt passes; claude-only receipt refuses `chains_incomplete` with `missingChains:["codex"]`.
- Extra unknown chain: 4 green + green "mystery" → pass (superset OK); 4 green + RED "mystery" → `chains_red` naming mystery (fail-closed on any red member, even outside the expected set).
- Precedence spot-checks all hold: empty chains[] → `chains_empty` (empty beats incomplete); claude-only RED → `chains_incomplete` (incomplete beats red); claude-only WAIVED → `chains_incomplete` (incomplete beats waived); subset receipt at PARENT sha → `chains_stale` with exact hints `"stale_paths":["newcode2.js"],"stale_kind":"code"` (stale beats incomplete, culprit hints intact).

### Earlier battery spot-checks still hold

4-chain receipt with one waived member → `chains_waived` naming codex; `headSha:"unknown"` → `chains_stale` with no stale_paths (degrade intact); green 4-chain at HEAD control → pass envelope exit 0.

### Regression + parity + docs (attack 6)

- `node scripts/simulate-workflow-walkthrough.js` in the worktree → "Workflow walkthrough simulation passed", exit 0 — all 13 #651 cases in-suite; cases (11)-(13) read: structural assertions (reason + status + deep-equal `missingChains`), matching my empirical outputs byte-for-byte.
- The re-walk's green claude chain re-ran test-adaptive-node + the full claude suite over the repaired tree at the bump commit; repair diff touches neither `test-adaptive-node.js` nor `kaola-workflow-adaptive-node.js` (#652 lanes unaffected).
- `node scripts/edition-sync.js --check` → full parity, exit 0 (all 4 validator editions carry the coverage arm).
- `node scripts/validate-workflow-contracts.js` → passed, exit 0 over the repaired docs.
- Docs now accurate for the 7-slot contract, verified against observed behavior: docs/api.md (coverage-requirement bullet with the exact filter expression, 7-slot precedence, `missingChains`/`expectedChains` envelope fields, "Coverage is checked BEFORE greenness" — matches my subset-RED observation); docs/conventions.md:386-393 (widened enumeration "red, missing, stale, incomplete, waived, or unresolvable-chain-set" + 7-slot family); README checklist comment widened identically; D-651-01 updated in place + R2 addendum. The only remaining `chains_empty > chains_red` docs hits are D-632-01's own historical finalize-family record — not stale for this gate.

### Informational (no action, non-blocking)

- The reused `repo_kind_undetermined` operator_hint prose says "package.json is present but UNREADABLE/unparseable" even when package.json is ABSENT (the release-check no-package.json arm); the `errors[]` text and structural reason are accurate — cosmetic hint-prose mismatch inherited from the #556 finalize wording.
- The unknown-headSha degrade path still leaks the raw `git diff unknown` stderr line (pre-existing #648 helper behavior, unchanged by this bundle, already recorded last window).
- n3's N3-2 deferred observation (working-tree vs candidate-pinned package.json resolution) is consistent with my analysis: same local trust envelope as the receipt itself, producer/gate symmetric — hardening idea only.

## Verdict

NOT-REFUTED (confidence: high) — both of my original counterexamples now fail against the repaired bundle (the subset receipt refuses typed with the structural payload, including when stamped by the official producer; the documented blanket-OFFLINE sequence re-walked to an all-four-green receipt and a passing gate at an untagged candidate), the new coverage arm resisted every fail-open probe I could construct (absent/chain-less package.json, adaptive expected sets, extra/red unknown chains, all five precedence orderings), the earlier refusal battery still holds, and all four docs surfaces now state the 7-slot contract that the code empirically exhibits. R1 and R2 are resolved; nothing new blocks.
