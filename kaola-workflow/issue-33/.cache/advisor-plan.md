# Advisor Plan Cache — issue-33
Generated: 2026-05-16

## Advisor Input

Reviewed Phase 3 blueprint (`.cache/architect.md`) for issue-33. Blueprint proposes five tasks:
T1 `mainRootFromCoord` helper, T2 `coordRoot` hoist + pre-chdir, T3 post-pipeline chdir + probe at both exit points, T4 shell fix in phase6.md, T5 test 16G extension. Asked for: build sequence safety, missing files/integration points, implementation completeness, edge cases, and whether the post-pipeline chdir is load-bearing or defensive.

## Advisor Response Summary

### Build Sequence: Dependency-Safe

T1 → T2 → T3 (sequential, all in sink-merge.js) then T5 (depends on T1-T3). T4 (phase6.md) is fully independent. No circular or reversed dependencies.

### Phase 2 → Phase 3 Deviation: Explicitly Flagged

The blueprint correctly deviates from Phase 2 Track 1 description ("chdir after removeWorktree returns removed/abandoned"). Phase 2 described the chdir as post-removal. The architect found the critical constraint: `removeWorktree()` at claim.js:638 returns `{deferred}` immediately if `process.cwd()` is inside the worktree — removal does not happen. The fix must be pre-chdir. This deviation is load-bearing and must be flagged in phase3-plan.md.

### Post-Pipeline Chdir: Load-Bearing (Not Hand-Waving)

The pre-chdir (T2) sets CWD to mainRoot before removeWorktree, which is necessary for removal to proceed. However, the post-pipeline defensive chdir (T3) serves a second purpose: it guarantees the CWD is mainRoot at both exit points regardless of any inadvertent chdir inside the pipeline (git subprocess hooks, merge drivers, or future pipeline additions). The probe is written AT the post-pipeline position, not at the pre-chdir position — so the probe correctly asserts end-state CWD, not entry-state CWD. Both T2 and T3 are needed.

### `process.on('exit')` Recommendation: Adopt

The blueprint duplicates the probe+chdir block at two exit points (FF-race path and normal exit path). Replace with a single `process.on('exit', () => { ... })` handler registered once at main entry, which fires at all exit paths. This halves the probe code and eliminates the risk of a future third exit path missing the probe. No behavioral difference for current paths.

### `env16` vs `env16Off` in Test: Verified Correct

T5 uses `env16` for the claim subprocess (line 3607 in walkthrough.js — online, gh calls allowed) and `env16Off` for the sink-merge subprocess (adds `KAOLA_WORKFLOW_OFFLINE: '1'`). This matches the pattern used by existing 16G tests.

### No Missing Files or Integration Points

The three-file write set (sink-merge.js, phase6.md, walkthrough.js) is complete. No plugin mirror sync is needed (blueprint correctly scopes out `plugins/` changes). No new imports required: `fs`, `path`, `os`, `spawnSync` are already present.

### Edge Cases Covered

- `KAOLA_COORD_ROOT` env-var override (plain dir, not `.git`-suffixed): `mainRootFromCoord` handles via `path.basename !== '.git'` branch.
- `process.chdir` failure (e.g., tmpdir was cleaned up): wrapped in try/catch, silent failure — does not abort pipeline.
- Probe file parent dir absent: guarded by `fs.existsSync(path.dirname(_p))` check.
- FF-race exit: chdir + probe must fire here too. With `process.on('exit')` pattern, this is automatic.

### One Open Question Resolved

The advisor flagged: "Does coordRoot need to be hoisted if we use process.on('exit')?" Answer: yes. `coordRoot` must be function-scoped (not block-scoped) so the `process.on('exit')` handler can close over it. The hoist (T2) is still required.

## Recommendation

Adopt `process.on('exit')` for the probe+chdir. Update T3 in the phase3-plan.md task list accordingly. All other blueprint decisions stand.
