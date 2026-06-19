evidence-binding: n3-code-review c476fdf6aa1f
verdict: pass
findings_blocking: 0

# n3-code-review (G1 gate, post-dominates n1-finalize-base + n2-opencode-flip)

## Verdict: PASS — 0 blocking findings. Both code nodes are sound.

Diff reviewed: `git diff de272214` over the 11 in-scope files (4× claim.js,
walkthrough, sync-opencode-edition, test-opencode-edition, 2× .opencode commands,
install-opencode.sh, docs/opencode-edition.md). Canonical `commands/` + `install.sh`
verified EMPTY (`git diff --name-only de272214 -- commands/ install.sh` → no output).

## Seven explicit checks — each conclusion

### 1. Anti-laundering guard intact (n1, load-bearing) — CONFIRMED UNTOUCHED
- `scripts/kaola-workflow-plan-validator.js:2162-2165` — the per-node
  `--barrier-check` `--base` rejection STILL fires: inside the
  `if (args.includes('--barrier-check'))` block (opens L2131), when `nodeId` is
  set, `if (args.includes('--base'))` → refuse `invalid_args` ("--base is not
  allowed with --node-id"). Verbatim from HEAD; n1 did not touch plan-validator.js.
- The forwarded `--base` from `cmdFinalize` reaches `--finalize-check` ONLY
  (plan-validator.js L2493 block). `--finalize-check` is a SIBLING code path to
  `--barrier-check` — it never enters the per-node barrier branch. Its attribution
  sweep reads `flagVal('--base') || 'main'` at L2576; it does not invoke a per-node
  barrier internally.
- Conclusion: a caller CANNOT launder a per-node barrier with a free `--base`.
  The two flags route to disjoint validator blocks. Guard intact.

### 2. Default-unset byte-equivalence (n1) — CONFIRMED
- `cmdFinalize` (scripts/kaola-workflow-claim.js:2073-2078):
  `finalizeBase = args.base || (process.env.KAOLA_FINALIZE_BASE || '').trim() || null;`
  When both unset → `null` → `if (finalizeBase) push(...)` is SKIPPED.
- Resulting argv: `[validatorScript, livePlanPath, '--finalize-check', '--json']` —
  byte-identical to the prior literal. No extra token emitted.
- Validator then falls back to `'main'` (L2576). Branch-per-issue behavior unchanged
  (pinned by test direction 1: WITHOUT --base on a shared branch refuses, naming
  the sibling file — exactly today's behavior).

### 3. claim.js ×4 consistency (n1) — CONFIRMED BYTE-FOR-BYTE
- Diffed the added regions across all four copies. The `--base` block is identical:
  - KNOWN_VALUE_FLAGS: `'base',` appended (surrounding context differs only by
    forge — gitlab twin has `mrIid`, others `prNumber`; the added token is the same).
  - `cmdFinalize` forwarding: same comment, same `finalizeBase` line, same
    `validatorArgv` build + conditional push, same execFileSync call. Byte-identical.
- Four files: scripts/kaola-workflow-claim.js,
  plugins/kaola-workflow/scripts/kaola-workflow-claim.js,
  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js,
  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js.

### 4. Forge-port forbidden-only (n1 touches gitlab/gitea) — CONFIRMED
- The gitlab/gitea claim.js diffs are the IDENTICAL `--base` fix only. No unrelated
  forge changes, no forbidden edits. `--forbidden-only` posture satisfied.

### 5. Mechanism B correctness (n2) — CONFIRMED
- `git diff --name-only de272214 -- commands/ install.sh` → EMPTY. Canonical is
  100% untouched. (Could not have changed: `transformCommandBody` is called ONLY
  from `renderCommand`, which writes `.opencode/command/*`; canonical
  `commands/*.md` is read-only input.)
- Strip-transform (sync-opencode-edition.js:197-218) mirrors the existing
  Agent Model Badge strip (L190-196): detect heading → skip body. Correctly
  adapted for the nested `### Branch A`/`### Branch B` children via the
  SIBLING anchor `^##\s` (rejects `###` — after two hashes `\s` needs whitespace,
  `###` has a third `#`). Trailing-blank rewind (L213-214) leaves a clean
  single-blank seam. Scoped to opencode rendering only.
- Prose rewrite (L262): `text.replace(/downgrade to full path \/\s*/g, '')`
  removes just the "downgrade to full path / " prefix, leaving
  "discard+restart / STOP" coherent.

### 6. Generated-output coherence (n2) — COHERENT; disclosed leftovers are NON-BLOCKING
- `.opencode/command/workflow-next.md` / `kaola-workflow-adapt.md` read coherently
  after the strip. Step 0a-2 (adaptive front-end entry) fires correctly; scout
  dispatch unchanged; output template format preserved.
- Disclosed leftover inline references (workflow-next.md L72, L118, L159-161, L464):
  "(Step 0a-1)" and "switch-OFF" mentions in Bundle Lane, Goal-Driven Autonomy,
  and the output template. ASSESSMENT: ACCEPTABLE / NON-BLOCKING. Reasoning:
  (a) Router contract intact — the dangling "(Step 0a-1)" references degrade
  gracefully: "resolve the path intent" trivially resolves to adaptive on
  adaptive-only-default opencode, and the agent proceeds to Step 0a-2 correctly.
  (b) switch-OFF branches are UNREACHABLE on opencode (adaptive is unconditional
  default), so dead-prose referencing them cannot cause a wrong action; the
  explicit `KAOLA_PATH=fast`/`full` escapes still work and the prose's substance
  (those escapes take single-issue) is correct.
  (c) Output template over-lists paths (mentions OFF) but the FORMAT is preserved.
  (d) n2 agent disclosed these intentionally; docs/opencode-edition.md
  "Surviving back-references" note documents the rationale (deep surgery on
  canonical concepts outside this flip's scope). A polish follow-up is welcome
  but not a correctness gate. Recorded as finding R1 (non-blocking follow-up).

### 7. Tests real (both) — CONFIRMED THEY BITE
- `testFinalizeBaseFlagScopesAttributionSweep` (simulate-workflow-walkthrough.js
  L14356, registered in buildRegistry L13051): builds a REAL shared two-issue
  branch fixture in $TMPDIR, commits issue-1 work (aaa/x.js) then issue-2 work
  (bbb/y.js), and asserts BOTH directions:
  (1) WITHOUT --base → exit≠0, refuse `finalize_gate_unverified`, inner names
  `unattributed_change` + `aaa/x.js`, no archive created (pins today's behavior).
  (2) WITH --base <ISSUE2_BASE> → exit 0, `status: closed` (RED before the fix —
  cmdFinalize would not forward --base). (3) KAOLA_FINALIZE_BASE env → same pass.
  Not tautologies — they exercise both directions + the env sourcing path.
- A22 (test-opencode-edition.js L392-418): asserts the generated
  workflow-next.md has NO Path Intent section / KAOLA_ENABLE_ADAPTIVE / Branch A/B,
  and adapt.md has NO "downgrade to full path" / "fall back to full". Bites the
  strip-transform directly.

## Test evidence (run this review)
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation
  passed" (includes `testFinalizeBaseFlagScopesAttributionSweep: PASSED`).
- `node scripts/test-opencode-edition.js` → "opencode-edition test passed (283
  assertions)" (includes A22).
- #307 four-chain obligation (n1 touches all 4 claim.js edition trees) — ALL GREEN:
  - `npm run test:kaola-workflow:claude` → pass (full walkthrough + 40+ contract tests)
  - `npm run test:kaola-workflow:codex` → pass
  - `npm run test:kaola-workflow:gitlab` → pass (both gitlab + gitlab-codex walkthroughs)
  - `npm run test:kaola-workflow:gitea` → pass (both gitea + gitea-codex walkthroughs)

## Findings

finding: id=R1 scope=in_scope action=follow_up status=deferred severity=low fix_role=implementer rationale=n2-disclosed leftover "(Step 0a-1)"/"switch-OFF" inline references in .opencode/command/workflow-next.md (L72,L118,L159-161,L464) are stale-but-coherent dead-prose; router contract intact, switch-OFF unreachable on adaptive-only-default opencode; polish purge is a deferred follow-up, not a finalize gate

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 1     | note   |

Verdict: APPROVE — 0 blocking findings. n1's anti-laundering guard is intact,
default-unset path is byte-equivalent, and the ×4 claim.js fix is consistent.
n2's Mechanism B leaves canonical untouched and the generated output is coherent.
All four #307 chains + the opencode suite are green. The single LOW finding (R1)
is a disclosed, intentional, non-blocking polish follow-up.
