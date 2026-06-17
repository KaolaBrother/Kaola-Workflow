evidence-binding: n1-fix a733db787a9b
RED: #498 #498-COOPEN-REQUIRES-LEGS — containment-only/leg-isolation-only co-opened a group (got lane_group lg-A-B); #499 #499b open-next opened the node through a hash-defeating tamper (result:ok, opened.id:a); #516 dispatch.evidence_file === ".cache/n1-impl.md" (bare) — all FAILED pre-fix (20 failures, 989 passed)
GREEN: all three pass post-fix; test-adaptive-node 1007/1007 assertions green (#498 2 off-combos serial-degrade + full-conjunction co-opens; #499a wiring + #499b real-validator tamper refuses plan_integrity_failed; #516 dispatch.evidence_file === kaola-workflow/<project>/.cache/<id>.md)

# n1-fix (tdd-guide) — bundle #498 + #499 + #516

All edits + verify run from /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-498-499-516.
Canonical file edited: scripts/kaola-workflow-adaptive-node.js; editions regenerated via `node scripts/edition-sync.js --write` (codex twin + 2 forge ports) and verified with `--check`.

## #498 (HIGH, toggle-gated): write co-open engaged on KAOLA_LANE_CONTAINMENT alone; attribution-blind union barrier passed a cross-member overwrite when leg-isolation off

DEFECT: In `runOpenReady` (scripts/kaola-workflow-adaptive-node.js) the co-open gate fired on containment alone
(`if (containment && writeNodes.length >= 2)`), setting `groupForm`, while leg provisioning gated on a SEPARATE
conjunction (`groupForm && resolveLegIsolation && writeOverlapConsent`). With KAOLA_LANE_CONTAINMENT=1 and
KAOLA_LEG_ISOLATION unset (or set without --write-overlap-consent), a group co-opened but `legs` stayed null →
at close the `liveLegs===null` else-branch ran the SNAPSHOT `--group-barrier` (union over members; no parent-clean
fence, no synthesizer). The union allowlist is attribution-blind, so a path written by the WRONG member is still
in the union → passes a cross-member overwrite. Also `groupCeiling = Math.max(2, groupCeiling)` silently overrode an
operator's explicit KAOLA_FANOUT_CAP=1 / --max 1.

FIX (gate-conjunction only; per issue body — did NOT touch plan-validator.js union barrier or write-lane.sh):
- scripts/kaola-workflow-adaptive-node.js `runOpenReady`: factored ONE function-scope local
  `const legCoupled = resolveLegIsolation(process.env) && opts.writeOverlapConsent;` (~line 3818) used at BOTH gates so
  they can never drift. Co-open gate (~3829): `if (containment && legCoupled && writeNodes.length >= 2)`. Leg-provision
  gate (~3933): `if (groupForm && legCoupled)`. This makes the invariant groupForm ⟺ legs provisioned ⟺ the safe
  (parent-clean fence + commit-based barrier) close path; the legless snapshot union barrier is never reached via co-open.
- Replaced `groupCeiling = Math.max(2, groupCeiling)` with `if (groupCeiling < 2) { serial-degrade single write }`
  (no group), so an explicit cap of 1 is honored (verified: resolveFanoutCap({})=4, resolveFanoutCap({KAOLA_FANOUT_CAP:'1'})=1).

TESTS (scripts/test-adaptive-node.js):
- ADDED #498-COOPEN-REQUIRES-LEGS (regression guard, open-side): BOTH off-combos (containment-only AND
  leg-isolation-but-no-consent) → serial-degrade (1 write opened, no lane_group, other write stays pending). The
  leg-isolation-only case is exactly what a "gate on leg-isolation only" half-fix would miss.
- ADDED #498-COOPEN-FULL-CONJUNCTION (positive): full conjunction → co-open forms a group AND provisions legs.
- RETIRED (premise now unreachable: co-open ⟺ legs after #498): D437-OPEN-READY-GROUP (ON-alone forms group),
  D437-CLOSE-NODE-DEFERRED / -GROUP-PASS / -VACUITY-REFUSE / -CROSS-LANE-STRAY, and LEG-BARRIER-CLOSE-PATH-FLAG-OFF.
  No coverage lost: group OPEN → LEG-PROVISION-ON / #498-COOPEN-FULL-CONJUNCTION; group CLOSE via legs-live
  synthesizer → LEG-CLEAN-COMPLETION-NO-LEAK; serial close (what ON-alone now degrades to) →
  D437-CLOSE-NODE-FLAG-OFF-SERIAL. Each retirement carries a comment citing #498 + the covering test.
- Existing #500-NEGATIVE-A/B corroborate the off-combo serial-degrade.

RED→GREEN: RED `FAIL: #498-COOPEN-REQUIRES-LEGS [containment-only ...]: NO co-open without legs (serial-degrade),
got {"group_id":"lg-A-B",...}` and `[leg-isolation but NO consent]: ... got {"group_id":"lg-A-B",...}` (group formed
pre-fix). GREEN both off-combos serial-degrade (no laneGroup, opened.length===1, other stays pending); full-conjunction
co-opens + provisions legs.

## #499 (HIGH, requires tamper): serial resume / open-next path had no plan_hash integrity gate

DEFECT: `runOpenNext` called `mutationGuardPrologue(opts, { halt:true, excl:['scheduler','batch'] })` WITHOUT
`integrity:true`. The integrity layer (`mutationGuardPrologue`, shells validator --resume-check) ran only when
`cfg.integrity`. open-batch/top-up/open-ready all carry it; serial open-next did not. So on the documented serial
resume path (orient → open-next) a post-freeze hash-defeating content tamper (widen a declared_write_set, swap a role,
re-point depends_on — DAG still acyclic/unique-sink) was dispatched with no integrity refusal (orient's --resume-check
does not cover a tamper landing BETWEEN orient and open-next, or an open-next reached without orient).

FIX (code integrity gate only; resume.md docs fix is n3-docs's job, not touched):
- scripts/kaola-workflow-adaptive-node.js `runOpenNext` (~line 1641): prologue now
  `mutationGuardPrologue(opts, { integrity: true, halt: true, excl: ['scheduler', 'batch'] })`.
- Updated the two misleading comments that documented the deliberate omission (the runOpenNext prologue header and the
  `mutationGuardPrologue` Layer-1 comment "open-next DOES NOT add it") to state open-next now carries the layer.

TESTS (scripts/test-adaptive-node.js):
- ADDED #499a (mock-shell wiring, mirrors S387a): tampered plan (--resume-check returns ok:false) → open-next refuses
  plan_integrity_failed, zero mutation, ran validator --resume-check, no baseline recorded.
- ADDED #499b (REAL validator, false-green proof per #292 discipline): freeze a plan in a real $TMPDIR git repo,
  control-assert frozen passes --resume-check, TAMPER (widen `a` declared_write_set), assert real validator now FAILS
  --resume-check, then run the REAL open-next subprocess → REFUSE plan_integrity_failed with `a` still pending.
- COLLATERAL (deliberate, in write set): added `--resume-check → {exitCode:0, ok:true}` to every inline open-next mock
  shell that did not answer it (T10, T11, T12, #317-open-next, R11, D419-INV2, D444-DISPATCH-PARITY, S391b open-next
  [precedence: integrity Layer-1 passes so the halt_pending Layer-2 still fires], S-BYTE open-next, T472-DIVERT/-SERIAL/
  -NODEID). rtHarness + D444-OPENREADY already answered it. Walkthrough open-next fixtures use frozen plans → unaffected.

RED→GREEN: RED `FAIL: #499b: open-next REFUSES plan_integrity_failed on the tampered plan ... got exit=0
{"result":"ok","allDone":false,"opened":{"id":"a",...}}` (opened through the tamper pre-fix). GREEN #499a + #499b pass:
open-next refuses plan_integrity_failed, zero mutation (`a` stays pending).

## #516 (LOW): open-next dispatch emitted a bare evidence_file that a subagent mis-resolves to worktree-ROOT .cache/

DEFECT: open-next/open-ready/fused/reopen emitted `evidence_file: ".cache/<node-id>.md"` (bare, cwd-relative). A
role-agent subagent dispatched into the worktree interprets it relative to its cwd (worktree root) → writes
<worktree>/.cache/<id>.md, which does not match /^kaola-workflow\// → the per-node barrier treats it as a PRODUCTION
write outside the allowlist → false write_set_overflow (triage even proposes revert-overflow, deleting the evidence).

FIX (cheapest per issue body — emit the project-qualified DISPATCH path):
- ADDED helper `qualifiedEvidenceFile(project, nodeId) → 'kaola-workflow/' + project + '/.cache/' + nodeId + '.md'`
  (bare fallback when project absent), scripts/kaola-workflow-adaptive-node.js (~after buildDispatch).
- Qualified the DISPATCH packet `evidence_file` at all dispatch sites: runOpenNext (dispatchEvidenceFile),
  runOpenReady (dispatchEvidenceFile in buildDispatch ctx), runCloseAndOpenNext fused-advance (fusedEvidenceFile).
- DECISION (decisive grep of commands/kaola-workflow-plan-run.md:118 — plan-run consumes `dispatch.evidence_file`,
  NOT the top-level `opened.evidence_file` which is the #444 "back-compat kept for one release" VESTIGE): qualify the
  DISPATCH packet ONLY; leave the top-level mirror BARE (matches on-disk seed/record/verify resolution =
  dirname(planPath)+'.cache'). This keeps the fix surgical and inside the write set: the walkthrough's #433 (6d)
  assertion `onOut.opened.evidence_file === '.cache/n1.md'` (in simulate-workflow-walkthrough.js, NOT in my write set)
  stays green untouched — avoiding an out-of-write-set plan-repair. On-disk seed (seedEvidenceFile), record-evidence,
  and runVerifyEvidence are UNCHANGED (they join dirname(planPath), independent of the hint string).

TESTS (scripts/test-adaptive-node.js): ADDED #516-QUALIFIED-EVIDENCE-PATH (open-next + open-ready): assert
`dispatch.evidence_file === 'kaola-workflow/test-project/.cache/<id>.md'` AND the top-level mirror stays bare
`.cache/<id>.md` (vestige parity).

RED→GREEN: RED `FAIL: #516-QUALIFIED-EVIDENCE-PATH (open-next): dispatch.evidence_file is project-qualified, want
kaola-workflow/test-project/.cache/n1-impl.md, got ".cache/n1-impl.md"` (+ open-ready rv1/rv2). GREEN dispatch.evidence_file
is project-qualified at every dispatch site; top-level mirror stays bare.

## Cross-edition

GENERATED_AGGREGATOR. Edited canonical root scripts/kaola-workflow-adaptive-node.js; ran `node scripts/edition-sync.js
--write` (regenerated codex twin + gitlab/gitea forge ports) then `--check` → green
("edition-sync: 12 forge aggregator ports in rename-normalized parity with canonical."). All 4 editions in sync.
Write set respected: only the 4 adaptive-node.js copies + scripts/test-adaptive-node.js modified. test-parallel-batch.js
not modified — the #498 co-open logic lives entirely in adaptive-node.js's runOpenReady; parallel-batch only reads a
prebuilt lane_group fixture for `status --json` diagnostics (no co-open gate), so a green run suffices (no forced tests).

## Reopen #516 path (verified, not assumed)

`reopen-node` returns no `dispatch` sub-object; its top-level `evidence_file` left BARE is correct. Verified via
docs/plan-run-cards/reopen-complete-node.md (referenced by commands/kaola-workflow-plan-run.md:196): a reopened node is
RE-DISPATCHED through a fresh `open-next` (full-reset path runs `open-next` after deleting the stale baseline; repair-node
dispatches the fix agent with the original write set then close-and-open-next). The actual dispatch packet for a reopened
node therefore comes from open-next's `dispatch.evidence_file` (project-qualified) — reopen's own bare mirror is never the
dispatch source. No residual #516 bug on the reopen path.

## #307 four-chain gate — PENDING (orchestrator finalize step, not this node's verify criteria)

This is a CROSS-EDITION diff (modified plugins/kaola-workflow-{gitlab,gitea}/ ports + the codex twin). Per CLAUDE.md
Validation Policy, finalization requires all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green,
recorded — run sequentially. What was run here proves CLAUDE-side green (test-adaptive-node + walkthrough) and
rename-normalized PARITY (`edition-sync --check`), which is NOT the same as the four chains green. Flagged PENDING for the
orchestrator's finalize step; a green claude chain alone is insufficient evidence (#307).

## Verify exit codes (all 0/green)

- node scripts/test-adaptive-node.js → EXIT 0 (adaptive-node tests passed, 1007 assertions)
- node scripts/test-parallel-batch.js → EXIT 0 (parallel-batch tests passed, 220 assertions)
- node scripts/edition-sync.js --check → EXIT 0 (12 forge aggregator ports in parity; 4 editions in sync)
- node scripts/simulate-workflow-walkthrough.js → EXIT 0 (Workflow walkthrough simulation passed)
