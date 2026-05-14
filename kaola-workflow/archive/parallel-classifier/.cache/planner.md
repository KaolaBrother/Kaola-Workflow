# Planner: parallel-classifier

## Approach A — Compact router snippet + monolithic classifier (RECOMMENDED)

**Summary**: Single ~250-300 line script mirroring `kaola-workflow-claim.js` shape. Router gets a tight ~7-line bash block under Startup Step 3 (classify --issue N --json, route by verdict). Cap stays at 220.

**Module shape**: top-level `try { main() } catch` wrapper; `process.stdout.write(JSON.stringify({verdict, reasoning}) + '\n')`; no `require.main` guard; all logic tested via subprocess `execFileSync` in Epic Case 6.

**Pros**: Mirrors dominant pattern; cap stays intact; single review surface; all gh calls guarded by single OFFLINE check.
**Cons**: Rule engine not unit-testable in isolation; verdict verified end-to-end only.
**Risk**: Low
**Complexity**: Medium
**Architectural fit**: Strong

## Approach B — Library-style + cap raised to 230

**Summary**: Split into thin CLI wrapper + exported helpers with `require.main` guard. Router scan loop ~14 lines. Cap raised from 220→230 with matching contract validator update. Direct unit testing of `classify()`.

**Pros**: Rule engine directly unit-testable; cap-raise makes policy change visible.
**Cons**: Two new patterns at once; cap-raise precedent; extra complexity for simple rule set.
**Risk**: Medium
**Complexity**: Medium-Large
**Architectural fit**: Moderate

## Approach C — Classifier only, no auto-scan loop

**Summary**: Build `kaola-workflow-classifier.js` but do NOT modify `workflow-next.md`. Manual invocation only.

**Pros**: Zero cap risk; easiest to revert.
**Cons**: Misses the stated feature goal (autonomous selection); config file becomes dead settings.
**Risk**: Low (but incomplete)
**Complexity**: Small
**Architectural fit**: Fine, but incomplete

## Recommended: Approach A

Rationale: matches dominant pattern; preserves 220-line cap; delivers full feature in one unit; subprocess-based Epic Case 6 verification sufficient for a simple rule set; fits in 9 router-line headroom.

## Explicit Non-Goals

- Auto-claim of green verdicts
- Auto-suggest fixes for overlapping file sets
- Mutation of claimed projects' phase artifacts (only candidate's phase1-research.md yellow note)
- TTL/cache layer for verdicts
- Lock-file schema changes
- Scheduler, queue, or persistent ranking
- Cross-machine state synchronization
- New gh label taxonomy beyond `depends-on:#N`

## Candidate File Set Extraction (no gh-call explosion)

Single `gh issue view <N> --json title,body,labels` per candidate. From result:
1. Body regex for path tokens: `/(scripts|commands|hooks|kaola-workflow)\/[A-Za-z0-9_.\/-]+/g`
2. Labels: filter for `depends-on:#NNN` and `area:*`
3. Coarse area: `path.split('/')[0]` → membership in `COARSE_AREAS = new Set(['scripts', 'commands', 'hooks', 'kaola-workflow'])`
4. Fallback: zero paths AND no `area:*` labels → red against Phase ≤ 2 claimed projects

## 220-line Cap Handling

Fit in 9 lines. Router snippet:
```bash
### Candidate Scan (auto mode)
[ "$KAOLA_WORKFLOW_OFFLINE" = "1" ] && exit 0
for N in $(gh issue list --json number -q '.[].number' 2>/dev/null); do
  V=$(node "$ROOT/scripts/kaola-workflow-classifier.js" classify --issue "$N" --json 2>/dev/null)
  echo "$V" | grep -q '"verdict":"green"' && { echo "Candidate: #$N"; break; }
done
```

If genuinely exceeds 9 lines, raise cap to 230 (not 225) paired with matching validate-workflow-contracts.js update.

## Missing Facts

1. Is 220-line cap negotiable? (default: no — Approach A only)
2. .gitignore policy for `.cache/parallel-decision-*.md` (likely already gitignored)
3. `depends-on:#N` label — new convention needing README/CHANGELOG entry
4. Epic Case 6 scope: script-only via execFileSync; router verified statically via assertIncludes
5. GitHub API rate limits: add `--limit 50` if >100 open issues expected (defer)
