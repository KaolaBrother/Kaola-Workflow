evidence-binding: n3-review 791b3c0c0286
## Code Review — issue #566 (n2 diff, G1 gate n3-review)

Diff: 5 files, +88/-8 (4 byte-identical hook copies + new test in simulate-workflow-walkthrough.js).

### Checklist results
1. **Fail-open preserved — VERIFIED empirically.** `|| printf ''` / `2>/dev/null` / `|| true` guards correct. Tested: payload missing `model` → `model:"", model_planned:"sonnet"`, exit 0; unknown agent_type → resolver empty, `model_planned:""`, exit 0; malformed JSON → early exit 0 at agent_type guard; hook always ends `exit 0`.
2. **Byte-identity — VERIFIED.** md5 of all 4 hook copies identical (`b85bc285cc0f05b655dff68bdde11de2`); `git diff --no-index` pairs exit 0; `validate-script-sync.js` passes.
3. **Backward compatibility — VERIFIED.** Only field-parsing reader is `kaola-workflow-claim.js:105-107` (`checkDispatchAttestations`), keys exclusively on `entry.agent_type`; `JSON.parse` ignores extra keys. Back-fill writers (claim.js:977/1169/2397) construct entries without model fields — mixed-shape lines parse cleanly. No reader broken.
4. **Resolver locator — VERIFIED in all 4 trees.** Each plugin tree carries its own resolver mirror; ran each of the 4 hook copies from a tmp git repo, each emitted `model_planned:"sonnet"` for `contractor`.
5. **No scope creep — VERIFIED.** Exactly the 5 declared files; no claim.js/docs/CHANGELOG/validator/schema changes. Untracked `kaola-workflow/issue-566/` is workflow state, not a code change.
6. **Test quality — VERIFIED, RED is real.** `testDispatchLogEmitsModelFields566` spawns the actual hook via spawnSync in a tmp git repo, asserts exit 0, one JSONL line, `agent_type==='contractor'`, non-empty `model_planned`, `model==='gpt-5.2'`; registered in buildRegistry(). Both assertions undefined pre-impl → real RED. Not a tautology.
7. **Shell correctness — VERIFIED.** `"$AGENT_TYPE"` double-quoted; injection test (`agent_type:"contractor; rm -rf /"`) produced literal line, rm did NOT execute; new `node -e` parse byte-symmetric with existing passes; env export correct; `#!/bin/sh`, no bashisms.
8. **Security — VERIFIED.** Model tiers are not secrets; resolver is local, no network; `JSON.stringify` escapes user-controlled values; no new dependency.

### Reproduction
- `simulate-workflow-walkthrough.js --only testDispatchLogEmitsModelFields566` → PASSED (exit 0)
- `validate-script-sync.js` → OK in sync (exit 0)
- `resolve-agent-model.js contractor --raw` → sonnet (exit 0)
- 4 fail-open empirical cases → all exit 0, no broken logs

### Findings: CRITICAL 0 | HIGH 0 | MEDIUM 0 | LOW 0. Clean, well-scoped, additive; dual-field payload-agnostic; fail-open symmetry exact. No non-blocking nits.

verdict: pass
findings_blocking: 0
