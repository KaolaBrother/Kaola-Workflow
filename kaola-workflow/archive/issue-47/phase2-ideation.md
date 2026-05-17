# Phase 2 - Ideation: issue-47

## Approaches Evaluated

### Option A: Mirror `cmdStartup` explicit-target pattern (SELECTED)
- Summary: Remove `runBootstrapClaimFirstAvailable`, add `--target-issue` guard to `cmdBootstrap`, call `claimExplicitTarget` directly — exactly mirroring the issue-44 pattern for `cmdStartup`.
- Pros: Proven pattern; minimal diff (~30 changed, ~10 deleted); all existing infrastructure preserved; stdout-only (no receipt write); clear failure modes
- Cons: Bootstrap and startup diverge slightly — this divergence is correct by design (bootstrap is lightweight re-entry, not a session initializer)
- Risk: Low
- Complexity: Small

### Option B: Delegate bootstrap to startup internally
- Summary: Have `cmdBootstrap` call `cmdStartup` logic internally, including receipt write.
- Rejection reason: `cmdBootstrap` is stdout-only; `cmdStartup` calls `writeStartupReceipt`, creating session files bootstrap callers don't expect. Out of scope for this bug fix.
- Risk: Medium

### Option C: Remove bootstrap subcommand entirely
- Summary: Delete `cmdBootstrap` entirely and direct callers to `startup`.
- Rejection reason: Bootstrap is a documented contract in CLAUDE.md, README, and codex parity. Too invasive for a targeted bug fix.
- Risk: High

## Advisor Findings

Option A is sound. The advisor confirmed the plan is correct and identified five gotchas to incorporate:

1. **Validator assertion string**: Use `'bootstrap: --target-issue <N> is required'` not `'no_target'` — the latter is too weak and could match unrelated code.
2. **Stdout JSON shape**: Always emit `{project, issue, verdict, claim, session, target_source?, reasoning?}` with `null` for unknown fields (not missing keys), including in the `no_target` path.
3. **OFFLINE behavior**: Verify `claimExplicitTarget` handles offline mode gracefully before calling it; if not, add a pre-call `verdict: 'offline'` guard.
4. **L193/L194 validator fixes**: Choose new 13A/13B test header strings first (since those tests are being rewritten), then write validator assertions to match — avoid "fix then re-fix."
5. **Owned + mismatched target**: `ownedActiveProject` resume takes priority over `--target-issue`; document this as intended behavior in Phase 3 blueprint notes.

Full advisor response: `.cache/advisor-ideation.md`

## Selected Approach

**Option A — Mirror `cmdStartup` explicit-target pattern**

Remove `runBootstrapClaimFirstAvailable` and rewrite `cmdBootstrap` to require `--target-issue N`. The rewrite:
- Adds a no-target guard (stdout JSON `{project: null, issue: null, verdict: 'no_target', claim: 'none', session}`, stderr warning, exit 1)
- Adds an offline guard if `claimExplicitTarget` does not already handle it
- Calls `claimExplicitTarget(claimScript, classifierScript, args, args.targetIssue, coordRoot, root)` for the claim
- Emits stdout-only JSON (no receipt file written)
- All stdout JSON paths use the normalized shape `{project, issue, verdict, claim, session, [target_source, reasoning]}`
- Keeps `runBootstrapClaim`, `runBootstrapSweep`, `runBootstrapWatchPr`, `ownedActiveProject` check intact

Tests: replace 6G, 8I-a, 8I-b, 12D, 13A, 13B in-place with explicit-target versions; add 8I-c (no-target bootstrap); keep 8I-owned unchanged.

Validators: replace `runBootstrapClaimFirstAvailable` assertion with `'bootstrap: --target-issue <N> is required'`; fix pre-existing L193/L194 bugs using the NEW 13A/13B test headers.

Docs: README L308/L520, CHANGELOG [Unreleased], CLAUDE.md explicit-target section.

## Out of Scope (explicit)

- No `writeStartupReceipt` in bootstrap (preserves stdout-only contract)
- No removal of `runBootstrapClaim` (used by `claimExplicitTarget`)
- No changes to `runBootstrapSweep`, `runBootstrapWatchPr`, `ownedActiveProject`
- No changes to `pick-next` or `startup`
- No new external dependencies

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
