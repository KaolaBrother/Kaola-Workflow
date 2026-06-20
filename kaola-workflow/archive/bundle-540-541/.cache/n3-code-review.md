evidence-binding: n3-code-review 6122cb39bbdf
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=implementer rationale=#541 edited canonical commands/kaola-workflow-finalize.md but did NOT regenerate the derived opencode mirror .opencode/command/kaola-workflow-finalize.md; sync-opencode-edition.js --check is RED (stale) and test-opencode-edition.js A6 parity is RED (283 passed / 1 failed); opencode-edition users lack the #541 --base forwarding. Fix: node scripts/sync-opencode-edition.js --write
R1_resolution: opencode mirror .opencode/command/kaola-workflow-finalize.md regenerated (plan-repair widened n2 write set, re-frozen plan_hash 615660ac) — #541 BARRIER_BASE/KAOLA_FINALIZE_BASE block byte-identical to canonical (diff exit 0); A6 green via test-opencode-edition.js "284 assertions" + sync-opencode-edition.js --check "15 agent(s) + 12 command(s) in parity with canonical"; walkthrough simulation passed (exit 0). Independently re-verified by code-reviewer before the finalize --verdict-check gate.

# n3-code-review (code-reviewer gate, opus) — bundle #540 + #541

Scope: union of n1 (#540, opencode strip-transform purge of stale `Step 0a-1`) and n2 (#541,
forward `--base` to whole-plan `--barrier-check` across 4 finalize surfaces). Reviewed the
working-tree diff (HEAD = 7cc07f4a; all bundle writes uncommitted in the worktree) plus live files.

## Verdict: FAIL — 1 blocking finding (#541 propagation gap)

The anti-laundering barrier itself is NOT weakened (per-node `--base` rejection intact at
plan-validator.js:2162-2165; whole-plan branch accepts `--base` at L2198; forwarding scoped to the
whole-plan call only; cross-edition parity byte-identical across all 4 bash surfaces). The failure
is a propagation gap: n2 edited canonical `commands/kaola-workflow-finalize.md` but did not
regenerate the derived opencode mirror, leaving the project's own opencode drift-detector and
A6 parity test RED.

## Blocking finding

[HIGH] opencode finalize mirror stale — drift check + A6 parity RED
File: .opencode/command/kaola-workflow-finalize.md:36 (stale); cause = commands/kaola-workflow-finalize.md:37-46 (#541)
Issue: `sync-opencode-edition.js` `writeCommands()` (scripts/sync-opencode-edition.js:503-517) emits
  EVERY canonical command into `.opencode/command/`, so editing canonical
  `commands/kaola-workflow-finalize.md` (surface 1 of #541's 4) necessarily invalidates the derived
  `.opencode/command/kaola-workflow-finalize.md`. n2 regenerated the 3 plugin mirrors but missed
  this 5th derived surface. The opencode mirror still carries the OLD line 36
  `node "$VALIDATOR" "$PLAN" --barrier-check --json; BC=$?` (no BARRIER_BASE forwarding).
  Reproducible:
    - `node scripts/test-opencode-edition.js` → FAIL A6[kaola-workflow-finalize.md] (283 passed, 1 failed)
    - `node scripts/sync-opencode-edition.js --check` → PARITY FAILED (.opencode/command/kaola-workflow-finalize.md — stale — regenerate)
  Functional impact: opencode-edition users running `/kaola-workflow-finalize` on a shared/multi-issue
  branch do NOT get the #541 `--base` scoping (barrier-check runs against origin/main → mis-attribution).
  This is the task's OWN required verify check (`sync-opencode-edition.js --check → drift-free parity`),
  and it is RED.
Fix (mechanical, do NOT hand-edit the mirror): `node scripts/sync-opencode-edition.js --write` —
  regenerates .opencode/command/kaola-workflow-finalize.md from canonical with the BARRIER_BASE
  forwarding. Re-run `test-opencode-edition.js` (expect 284/284) and `--check` (expect drift-free).

## n1 (#540) sub-claims — all PASS

- (d1) opencode-only / additive: PASS. Canonical `commands/workflow-next.md` byte-unchanged
  (`git diff --stat -- commands/workflow-next.md` empty). The strip-transform
  (scripts/sync-opencode-edition.js:280, `text.replace(/ \(Step 0a-1\)| or Step 0a-1/g, '')`) runs
  ONLY inside `renderCommand` (opencode output); canonical is never touched. Consistent with D-530-02.
- (d2) no over-strip: PASS. The 3 regenerated inline sites read as clean prose (no dangling words,
  no double spaces):
    L72:  "Resolve the path intent first,"  (was "...first (Step 0a-1),")
    L159: "resolve the path intent *before*" (was "...intent (Step 0a-1) *before*")
    L464: "from KAOLA_PATH judgment"        (was "...KAOLA_PATH or Step 0a-1 judgment")
  `grep -c "Step 0a-1" .opencode/command/workflow-next.md` = 0. A15-A21 PIN/CARD literals present
  (`grep -c "PIN\|CARD"` = 1) — no collateral damage. The regex is scoped to the literal "Step 0a-1"
  with its two real affixes (leading-space parenthetical / leading-space " or "); only workflow-next
  carried it, so no over-strip risk.
- (d3) assertion soundness: PASS. A22 (scripts/test-opencode-edition.js:416-417,
  `assert(!wfNext.includes('Step 0a-1'), ...)`) is NOT a tautology: the 3 inline mentions existed
  pre-#540 and are now 0 → genuine RED→GREEN.

## n2 (#541) sub-claims — a/b/c/e PASS (the blocking finding is a 5th-surface propagation gap, not a defect in the 4 listed surfaces)

- (a) byte-equivalence when KAOLA_FINALIZE_BASE unset: PASS. Verified in macOS default bash 3.2.57
  (no `set -u`): `BARRIER_BASE=""; BARRIER_BASE_ARG=(); [ -n "$BARRIER_BASE" ] && ...; printf '<%s>\n'
  --barrier-check --json "${BARRIER_BASE_ARG[@]}"` emits exactly `<--barrier-check>` `<--json>` (0
  trailing args) — textually identical to the pre-edit `node "$VALIDATOR" "$PLAN" --barrier-check --json`.
  When set, argv appends `--base <ref>` (verified). The 4 finalize command blocks do NOT use `set -u`
  (`grep "set -" *.md` empty), so the bash-3.2 empty-array-under-nounset gotcha does not bite.
  Advisory note (non-blocking): the `"${arr[@]}"`-empty-under-`set -u` idiom is fragile IF a caller
  later adds `set -eu` to these blocks on bash < 4.4; the `${arr[@]:-}` form would be defensive. Not
  flagged as a finding because (1) no `set -u` today, (2) matches the codebase's existing array idiom.
- (b) cross-edition parity: PASS. All 4 forwarding blocks byte-identical modulo the pre-existing
  validator var (`$VALIDATOR` in 3 command files vs `$validator_script` in the Codex SKILL.md) and
  indent (2-space inside the 3 ```bash blocks vs flush-left in SKILL.md). No #254 drift.
- (c) no laundering into per-node barrier: PASS. scripts/kaola-workflow-plan-validator.js:2162-2165
  (the `--base` REJECTION when `--node-id` is set — the anti-laundering guard) is UNTOUCHED by this
  diff. The whole-plan branch (L2198, `const base = flagVal('--base') || 'origin/main';`) accepts
  `--base`. The forwarding is scoped to the whole-plan `--barrier-check` call only.
- (e) sourcing consistency with #539: PASS. #541's bash sources `KAOLA_FINALIZE_BASE` env
  (`BARRIER_BASE="${KAOLA_FINALIZE_BASE:-}"`), mirroring #539's env path
  (scripts/kaola-workflow-claim.js:2033, `(process.env.KAOLA_FINALIZE_BASE || '').trim()`). The #539
  Node path ALSO accepts a `--base` CLI flag (flag wins); the #541 bash prose block is env-only,
  consistent with its agent-pastes-into-shell invocation model (the agent exports the env var). No
  divergence worth flagging.

## Verify matrix

- `node scripts/test-opencode-edition.js` → FAIL (A6 kaola-workflow-finalize.md parity: 283 passed, 1 failed) ← BLOCKING
- `node scripts/sync-opencode-edition.js --check` → PARITY FAILED (.opencode/command/kaola-workflow-finalize.md stale) ← BLOCKING
- `node scripts/simulate-workflow-walkthrough.js` → PASS ("Workflow walkthrough simulation passed", exit 0); `--only testFinalizeBaseFlagScopesAttributionSweep` → PASSED (3/3 #539 directions green)
- canonical `commands/workflow-next.md` untouched by n1: PASS (empty diff)
- 4 finalize forwarding blocks parity grep: PASS (identical modulo var/indent)
- per-node `--base` rejection intact: PASS (plan-validator.js:2162-2165 untouched)

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 1     | block  |
| MEDIUM   | 0     | —      |
| LOW      | 0     | —      |

Verdict: BLOCK — 1 HIGH blocking issue (#541 opencode finalize mirror not regenerated; the project's
own opencode drift-detector + A6 parity test are RED). The 4 listed n2 surfaces and all of n1 are
correct; the gap is solely the missing 5th derived surface. Mechanical fix: regenerate via
`node scripts/sync-opencode-edition.js --write`. Route repair to the implementer (propagation
completion), not security — the barrier is not weakened.
