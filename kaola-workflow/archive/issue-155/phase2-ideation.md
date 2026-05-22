# Phase 2 - Ideation: issue-155

## Approaches Evaluated

### Option A: New `target_unavailable` verdict + sibling refusal branch (SELECTED)
- Summary: Add `target_unavailable` as a new classifier verdict returned when remote fetch fails outside OFFLINE mode. Add a sibling branch in `claimExplicitTarget` to produce a `target_unavailable` status. Add a narrow `issueClosureProbe` helper at `claimProject:326` to cover the `cmdClaim` bypass path.
- Pros: Mirrors existing `user_target_blocked`/`user_target_red` pattern exactly; untouched `cmdStartup` mapper; `issueIsClosed` safe callers unchanged; `cmdPickNext`/`cmdBootstrap` inherit fix free
- Cons: Two code shapes to touch (classifier + `claimProject` probe) because two independent paths reach the unsafe gate
- Risk: Low
- Complexity: Medium-low (~6 edited functions across 6 files + 1 new tiny helper + tests)

### Option B: Pre-flight remote probe in `claimExplicitTarget`
- Summary: Add explicit reachability check at top of `claimExplicitTarget` before calling classifier.
- Pros: Single conceptual chokepoint
- Cons: Double round-trip; doesn't cover `cmdClaim` direct path; introduces new "is remote up" concept; 404 vs network-down indistinguishable
- Risk: Medium
- Complexity: Medium-high; least pattern-aligned

### Option C: Tri-state `issueIsClosed` returning `{ closed, available }`
- Summary: Change `issueIsClosed` signature and update all 6+ callers.
- Pros: Central source of truth
- Cons: Blast radius hits callers whose fail-open is *correct*; doesn't touch classifier path at all (AC#1/#2 still need separate work); violates surgical-changes rule
- Risk: High
- Complexity: High

## Advisor Findings

Approach A confirmed sound. Key corrections from advisor:
1. **Use `target_unavailable` for both verdict and status** — matches shipped router doc (`commands/kaola-workflow-next.md`) and issue's explicit proposal. `user_target_remote_unavailable` would cause doc drift.
2. Verify GitLab/Gitea `cmdClaim` structure before deciding on `claimProject` guard — do not assume symmetry.
3. Keep distinct reasoning strings on 3 GitHub wrapper leak points (packaging bug vs. contract bug vs. remote failure).
4. Phase 4 delta: check if any existing tests assert `green` on failing-fetch in online mode (those would be asserting the bug).

## Selected Approach

**Approach A** with `target_unavailable` as the typed refusal for both classifier verdict and startup status.

**Rationale**: Most surgical approach that mirrors established patterns. The dual-path problem (classifier route + `cmdClaim` bypass) requires exactly two fix sites; Approach A handles both minimally. The `target_unavailable` name matches the router contract and issue text precisely.

## Implementation plan summary

1. `scripts/kaola-workflow-classifier.js:357` — catch block → `{ verdict: 'target_unavailable', reasoning: 'gh issue fetch failed; refusing outside KAOLA_WORKFLOW_OFFLINE=1' }`
2. `scripts/kaola-workflow-claim.js:297–312` — 3 wrapper leaks → `target_unavailable` (distinct reasoning strings preserved per leak point)
3. `scripts/kaola-workflow-claim.js:claimExplicitTarget` — add sibling branch: `if (verdict === 'target_unavailable') return { status: 'target_unavailable', claim: 'none', ... }`
4. `scripts/kaola-workflow-claim.js:326` (`claimProject`) — add `issueClosureProbe()` helper; when `!OFFLINE && !available` → `{ status: 'target_unavailable', ... }`
5. Mirror changes in GitLab/Gitea classifier + claim wrappers + `claimExplicitTarget`
6. Update `commands/kaola-workflow-next.md` Parallel-decision enumeration to include `target_unavailable`
7. Add regression tests in `simulate-workflow-walkthrough.js` and per-forge test files

## Out of Scope (explicit)

- Do NOT change `issueIsClosed` signature or its 4 safe callers
- Do NOT introduce remote-health module, retry layer, or caching
- Do NOT change OFFLINE semantics or add new CLI flags/subcommands
- Do NOT edit `cmdPickNext`/`cmdBootstrap` directly (inherit via `claimExplicitTarget`)
- Do NOT touch `kaola-workflow-roadmap.js` drift detection

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
