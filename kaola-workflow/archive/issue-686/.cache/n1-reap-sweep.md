evidence-binding: n1-reap-sweep e725d95472fb

RED: #686 R8a (chmod-000 workflow-state.md, EACCES) + R8b (workflow-state.md is itself a directory,
EISDIR): on pre-fix `sweepBarrierRefs`, ran `node scripts/test-claim-hardening.js` with the two new
regressions added (R8a/R8b, scripts/test-claim-hardening.js) and the (c) keep-pass hunk temporarily
reverted in scripts/kaola-workflow-claim.js — got exactly 4 failures, 241 passed (no other test
regressed):
  FAIL: #686 R8a: a LIVE project whose workflow-state.md exists but is UNREADABLE (chmod 000 /
    EACCES) must be KEPT ... tagsKept=[] tagsDeleted=["issue-686chmoddead","issue-686chmodlive"]
    refsDeleted=["refs/kaola-workflow/barrier/issue-686chmoddead/n1","refs/kaola-workflow/barrier/issue-686chmodlive/n1"]
  FAIL: #686 R8a: tagsKept must include the chmod-000-state-file live project tag, got []
  FAIL: #686 R8b: a LIVE project whose workflow-state.md is itself a DIRECTORY (EISDIR) must be
    KEPT ... tagsKept=[] tagsDeleted=["issue-686eisdirdead","issue-686eisdirlive"]
    refsDeleted=["refs/kaola-workflow/barrier/issue-686eisdirdead/n1","refs/kaola-workflow/barrier/issue-686eisdirlive/n1"]
  FAIL: #686 R8b: tagsKept must include the EISDIR-state-file live project tag, got []
This reproduces the adversary's R8 finding verbatim: a live SEQUENCE-run project (no
.cache/running-set.json) whose sole keep signal is a present-but-unreadable workflow-state.md gets
its barrier gc-anchor reaped, under BOTH fault shapes (EACCES and EISDIR).

GREEN: reinstated the (c) keep-pass hunk (sweepBarrierRefs now walks each scanRoot's project-folder
entries a THIRD time — independent of pass (a) readActiveFolders and pass (b) running-set.json —
and adds sanitizeBarrierTag(entry.name) to `keep` whenever workflow-state.md EXISTS but
fs.readFileSync throws; a project dir with NO workflow-state.md at all is left out, correctly
reapable). `node scripts/test-claim-hardening.js` → "claim-hardening tests passed (245 assertions)",
0 failures (pre-existing 235 assertions + 10 new R8a/R8b assertions, of which the 4 that failed
pre-fix above now pass). Both new regressions assert tagsKept includes the live project AND the
paired genuinely-dead sibling tag (no folder anywhere) is STILL reaped in the same sweep run,
proving the fix is fail-safe under-reap only, not a blanket keep-everything.
`node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed". Parity:
`node scripts/edition-sync.js --check` → "10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and
27 byte-identical groups in parity with canonical"; `node scripts/validate-script-sync.js` → "OK: 24
common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks.json families
(config + hooks dir), and 7 forge export-superset families in sync." Cross-edition diff (touches all
3 forge claim.js ports) — all four chains run sequentially and green: `npm run
test:kaola-workflow:claude` (exit 0, "Workflow walkthrough simulation passed" +
generate-routing-surfaces 12/12), `test:kaola-workflow:codex` (exit 0), `test:kaola-workflow:gitlab`
(exit 0), `test:kaola-workflow:gitea` (exit 0) — no failures in any chain.

failed_review_attempt: n3-adversary:3
failed_review_gate: n3-adversary

## R8 fix — the new keep pass (sweep-local, tighten-only)

`sweepBarrierRefs` (scripts/kaola-workflow-claim.js) already builds its KEEP set per scanRoot from
two OR'd signals: (a) `readActiveFolders(scanRoot, {excludeClosedIssues:false})`, and (b) a direct
walk of `kaola-workflow/*/.cache/running-set.json`. R8 is that (a) silently drops a folder whose
`workflow-state.md` EXISTS but cannot be read — `readActiveFolders` → `parseStateFile` calls
`fs.readFileSync(stateFile, 'utf8')` (active-folders.js:196), and the per-folder try/catch around it
is a bare `continue` (active-folders.js:246). A SEQUENCE run has no running-set.json, so signal (b)
is empty too, and the folder's ONLY liveness evidence — the state file's mere presence — vanishes
from both signals. That contradicts the sweep's OWN documented "cannot prove dead ⇒ keep/abort"
posture, which today only fires at DIRECTORY granularity (the R4 fail-closed `git worktree list`
enumeration abort) and not at file granularity.

Added pass (c) inside the same `for (const scanRoot of scanRoots)` loop, reusing the SAME `entries`
listing already read for pass (b) (no extra `readdirSync`):

```js
// (c) #686 R8: present-but-UNREADABLE workflow-state.md KEEP — an independent pass over the
// SAME entries listing as (b). readActiveFolders drops (never re-implemented here — see the
// R8 doc paragraph above) a folder whose state file exists but fails to read; that folder's
// ONLY liveness evidence is otherwise lost. A project dir with NO workflow-state.md at all is
// deliberately skipped here (no liveness evidence — correctly reapable).
for (const entry of entries) {
  if (!entry.isDirectory() || entry.name === 'archive' || entry.name.startsWith('.') || !isSafeName(entry.name)) continue;
  const stateFile = path.join(workflowDir, entry.name, 'workflow-state.md');
  if (!fs.existsSync(stateFile)) continue;
  try {
    fs.readFileSync(stateFile, 'utf8');
    // readable — already covered (or correctly excluded) by pass (a) above.
  } catch (_) {
    keep.add(sanitizeBarrierTag(entry.name));
  }
}
```

Fail-safe / under-reap argument: this pass can only ever ADD entries to `keep` (a `Set`), never
remove any — mirroring the existing R5 case-fold and the #680 orphan-baseline discipline already
documented in the surrounding comment block ("any tag whose ownership survives EITHER keep-pass in
ANY worktree root is kept — ambiguity resolves to KEEP"). It runs across every `scanRoot` in the
existing all-worktrees union, so it inherits the R4 universe for free. It does NOT touch
`readActiveFolders`' shared continue-on-parse-fault semantics (kept byte-identical — other #353
consumers depend on that exact swallow behavior), so the fix is strictly sweep-local. A project
folder with NO `workflow-state.md` at all is deliberately excluded (`if (!fs.existsSync(stateFile))
continue`) — that shape carries zero liveness evidence and the adversary confirmed it is correctly
reapable; both R8 regression tests assert a sibling genuinely-dead tag (no folder anywhere) is still
reaped in the SAME sweep run, so the fix cannot silently degrade into keep-everything.

Propagated to all 3 edition ports (scripts/kaola-workflow-claim.js is COMMON_SCRIPTS; the new (c)
pass references no gh/forge-specific identifier, so the hunk is byte-identical across all four
files):
- scripts/kaola-workflow-claim.js (canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js — synced via `node scripts/edition-sync.js
  --write` (COMMON_SCRIPTS byte-copy target; confirmed 1 file updated, then re-verified in parity by
  `--check`)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js — hand-ported (DIVERGENT forge
  port; identical hunk, no gh→forge rename needed since the new code has no gh/forge reference)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js — hand-ported (same)

## #690 discharged in-run (test hygiene, one-liner applied per instruction)

The R6 test block (scripts/test-claim-hardening.js, embedded-newline worktree path fixture) declared
`nlPath686g` as a `const` INSIDE its `try`, while `nlPath686g` is a SIBLING worktree directory living
OUTSIDE `mainRoot686g` (`nlPath686g = mainRoot686g + '-wt-a' + '\n' + 'wt-b'`) — the `finally` only
ever `rmSync`'d `mainRoot686g`, so if any assertion between the worktree-add and the end of the try
threw, `nlPath686g` (and every assertion that DID run before the throw) leaked that sibling scratch
directory on disk. Fixed exactly as directed: hoisted `let nlPath686g;` above the `try`, changed the
inner assignment from `const nlPath686g = ...` to a plain `nlPath686g = ...`, and added
`if (nlPath686g) { try { fs.rmSync(nlPath686g, { recursive: true, force: true }); } catch (_) {} }` to
the `finally` (before the existing `mainRoot686g` cleanup) — now `nlPath686g` is reachable and
cleaned up in EVERY exit path, including a mid-test throw. This discharges #690 in this run; the
orchestrator can close #690 as fixed alongside #686.

All prior R1/R4/R4-fail-closed/R5/R6/R7 regressions remain green (verified via the same
`test-claim-hardening.js` run — 245/245 assertions passed, 0 failures).
