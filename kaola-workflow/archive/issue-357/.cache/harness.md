# harness — tdd-guide evidence (issue #357)

## RED
Unmodified file: runNode had no timeout/no KAOLA_ scrub/no git isolation (HEAD :28-36); ghMockEnv returned {} on missing shim (HEAD :3183, silent fall-through to real gh); main() hard-coded call list — `--list` ran the whole suite instead of listing. RED captured against these behaviors.

## GREEN
- --list: prints 214 scenario names (one/line, [shared-tmp group] suffixes), exit 0, runs NOTHING.
- --only noSuchScenarioXYZ: exit 1, "Error: --only matched no scenarios for token(s): \"noSuchScenarioXYZ\"".
- --only testProbeTimeoutEnv: 1 scenario green in seconds; --only testFinalize: shared-tmp group + matching scenarios, 18 green.
- FULL run: all 214 PASSED, exact sentinel "Workflow walkthrough simulation passed", exit 0 (sentinel printed only on full runs; --only prints "Walkthrough --only subset passed (N scenarios)").
- validate-workflow-contracts.js: exit 0 (pins intact).
- git diff --stat: ONLY scripts/simulate-workflow-walkthrough.js (479+/238-).

## Self-test testHarnessSelfCheck (6 assertions, registered)
(1) --list exits 0 + includes known name + no PASSED lines; (2) bogus --only exit 1 names token; (3) --only runs one scenario green; (4) ghMockEnv missing shim THROWS /shim file not found/; (5) runNode scrubs inherited KAOLA_* (sentinel var absent in child); (6) child env carries GIT_CONFIG_GLOBAL=/dev/null + GIT_CONFIG_NOSYSTEM=1.

## Shared-tmp handling
13 ordering-coupled head scenarios marked sharedTmp:true and run as one group (runSharedTmpGroup) in original order both on full runs and when --only selects any member — state coupling preserved, not untangled (deliberate scope ruling).
