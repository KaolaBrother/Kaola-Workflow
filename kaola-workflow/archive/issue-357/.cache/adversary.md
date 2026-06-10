verdict: pass
findings_blocking: 0
finding: id=AV1 scope=pre_existing action=none status=resolved severity=low fix_role=none rationale=C2 order shift — formerly-interleaved self-contained scenarios (testKeepOpenArchiveStamp, testManualArchiveBackstop, …) now run AFTER the complete shared-tmp group; investigated and proved zero functional dependency (each creates its own tmpdir or writes its own project); shared-tmp internal order byte-identical; full run exit 0

# adversary — adversarial-verifier evidence (issue #357)

Refutation attempts against the five central claims, all via real command execution (NOT-REFUTED, confidence high):
- C1 --only isolation/timing: --only testProbeTimeoutEnv 0.055s / --only testBundleClaimCreatesOneFolder (registry position ~201) 1.225s, exactly 1 PASSED line each (earlier scenarios provably did not run); /tmp/kw-* count unchanged before/after (no tmp leak); bogus token exit 1.
- C2 full-run identity: registry vs git show HEAD call list — 213→214 (only the self-check added); all 201 add()-registered functions take ZERO parameters (no silently-undefined arg vacuity); 163 PASSED lines match original behavior (shared-tmp scenarios silent as before); sentinel + exit 0. AV1 order-shift finding above, resolved.
- C3 fail-closed mock: all 12 call sites write the shim before calling; callProbeIssueState guards null binDir; the self-check asserts the throw.
- C4 timeout: heaviest runNode path 0.937s (~4s under 4× contention) vs 120s; E2E chains + closure-audit probes use their own spawnSync 60s caps, never route long work through runNode.
- C5 editions block: tail30(null/undefined) → '' guarded; SIGKILL child err.stdout is '' not null (live-verified); TMPDIR-only harness with a real child exiting 42 printed the delimited block with child output then rethrew exit 1; success path untouched.
