# Planner Output — issue-169

## Approach A (RECOMMENDED): Surgical fix matching Phase 1 deliverables

Add `target_unverified` verdict in the offline classifier path, wire it through `claimExplicitTarget()`, extract `verdict`/`reasoning` in the Step 0b wrapper, add an explicit Step 0 target-existence check, and add an additive top-level CLI form. No restructuring of pure `classify()`. No changes to forge ports.

**Architectural fit:** Matches the established pattern (each refusal verdict has its own typed status branch in `claimExplicitTarget()`; classifier owns offline/online verdict decisions; Step 0b wrapper extracts JSON fields the prose claims to act on).

**Pros**
- Lowest blast radius. ~30 LOC across two scripts; ~10 LOC across two docs; ~80 LOC of new tests.
- Each step independently verifiable via the existing walkthrough runner.
- Preserves the pure `classify()` function (unchanged).
- Online path untouched; existing `target_unavailable` semantics preserved.
- `cmdStartup` `Object.assign({...defaults}, result)` already propagates `reasoning` — no changes needed.

**Cons**
- Two simultaneous edits to `scripts/` and `plugins/kaola-workflow/scripts/` need explicit byte-diff verification at the end.
- Reasoning strings must be single-line plain ASCII to survive shell extraction.

**Risks:** Low.
**Complexity:** Low.

---

## Approach B: Lift unverified detection into `claimExplicitTarget()`

Keep classifier output set unchanged. Have `claimExplicitTarget()` itself inspect `KAOLA_WORKFLOW_OFFLINE`, roadmap file, and active folders.

**Recommendation:** Reject. Contradicts Phase 1 deliverable #1; spreads roadmap-file logic across two scripts; harder to test.

---

## Approach C: Full CLI subcommand restructure

Replace `process.argv[2]` check with a proper subcommand parser.

**Recommendation:** Reject. Out of scope; risks breaking `classify --issue N` callers; not asked for.

---

## Selected: Approach A

### Implementation outline

**Phase 1 — Classifier verdict (both copies)**
1. `scripts/kaola-workflow-classifier.js` lines 334–351 offline path: before calling `classify()` when roadmap file is absent, add:
   ```js
   if (!fs.existsSync(roadmapFile)) {
     // also check active folders — if issue is already active, route as owned
     const alreadyActive = activeFolders.some(f => f.issue_number === args.issue);
     if (!alreadyActive) {
       process.stdout.write(JSON.stringify({ verdict: 'target_unverified', reasoning: 'OFFLINE and no local evidence for issue #' + args.issue + ' (no .roadmap/issue-' + args.issue + '.md, no active folder); refusing to fabricate verdict' }) + '\n');
       return;
     }
   }
   ```
2. CLI dispatch (lines 381–386): add additive branches before existing logic:
   - `if (sub === '--help' || sub === '-h' || sub === 'help')` → print usage to stdout, return.
   - `if (sub && sub.startsWith('--'))` → pass `process.argv.slice(2)` to `cmdClassify(argv)` instead of `slice(3)`.
   Refactor `cmdClassify()` to accept optional `argv` parameter.

**Phase 2 — Claim script (both copies)**
3. `scripts/kaola-workflow-claim.js` `claimExplicitTarget()` lines 428–444: insert fifth branch before fall-through:
   ```js
   if (classified.verdict === 'target_unverified') {
     return { status: 'target_unverified', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
   }
   ```

**Phase 3 — Wrapper extraction**
4. `commands/workflow-next.md` lines 136–138: append after existing 3 extraction lines:
   ```bash
   KAOLA_VERDICT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).verdict||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
   KAOLA_REASONING="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).reasoning||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
   ```
5. `plugins/.../SKILL.md` lines 117–120: mirror same two lines. Keep SKILL.md's `PICK_NEXT_PROJECT` style unchanged.

**Phase 4 — Step 0 target-existence validation + Required Output**
6. `commands/workflow-next.md` Step 0: add "0c — Target Existence Check" before Step 0a-1.
7. "Required Output Before Routing" block: add `target_unverified` to Parallel decision enum; add conditional `Startup refusal: {reasoning}` line when `KAOLA_CLAIM` is `none`.
8. SKILL.md: mirror equivalent prose changes.

**Phase 5 — Tests**
9. Update `testClassifierOfflineBypassesFailClosed`: assert `claim: 'none'`, `verdict: 'target_unverified'`, no folder created.
10. Add `testClassifierOfflineVerifiedTarget`: valid `.roadmap/issue-N.md` planted → `claim: 'acquired'`.
11. Add `testClassifierOfflineOwnedFolderRoutes`: active folder for issue N → `claim: 'owned'`.
12. Add `testClassifierTopLevelIssueFlag` and `testClassifierHelpFlag`: top-level `--issue` and `--help`.
13. Register all new tests in runner (~line 3433).

**Phase 6 — Mirror & validate**
14. Copy scripts to `plugins/kaola-workflow/scripts/`. Verify with `diff -q`.
15. Run `node scripts/simulate-workflow-walkthrough.js` → must exit 0.

### Key finding from planner
- GitLab/Gitea forge ports have the same Step 0b extraction gap but are OUT OF SCOPE for #169.
- `cmdStartup` already propagates `reasoning` via `Object.assign({...defaults}, result)` — no changes to `cmdStartup` needed.
- `active_folder` check for offline unverified guard: use `activeFolders.some(f => f.issue_number === args.issue)`.

---

## Explicitly NOT building
- GitLab/Gitea forge port updates
- `PICK_NEXT_PROJECT` → `KAOLA_PROJECT` rename in SKILL.md
- `target_mismatch` / `target_occupied` in `claimExplicitTarget()`
- Legacy `.sessions/*.json` cleanup
- `classify()` pure function refactor
- Full CLI parser rewrite

---

## Correction (2026-05-28)

The original framing referenced issue #317 as "nonexistent in `KaolaBrother/Kaola-Workflow`". This was a review error. The corrected understanding: #317 was a target in a **downstream consumer project** using Kaola-Workflow, not in the workflow package repo. The validation invariant is consumer-repo context (the cwd's git repo).

**Script behavior is already consumer-repo correct.** `ghExec()` uses cwd's `gh` context (no `--repo` flag); `getRoot()` uses `git rev-parse --show-toplevel`; `.roadmap/issue-N.md` is read under `getRoot()/kaola-workflow/.roadmap/`. Existing test shims already return `owner:test, name:repo` (non-Kaola fixture).

**Technical core of Approach A is unchanged.** The corrections are:
- One sentence of "active consumer repository" prose added to Step 0 in `commands/workflow-next.md` and `SKILL.md`.
- Step 0 target-existence check is item 7 inside the existing Step 0 numbered list (NOT a new "Step 0c").
- One consumer-repo isolation assertion added to an existing new test (NOT a separate test).

No re-plan needed.
