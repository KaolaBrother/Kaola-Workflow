evidence-binding: adversarial-1030 9f30b7c1e462

# Adversarial verification — issue #1030

behavior_contract_version: 3
behavior_contract_hash: 8db400bc449cc30799ac2ef89e9f1778aebd965ec524745c5c6c65019dd27db6
resolved_profile_hash: 9ff7f5d3f0598d7b0ca616e2322c3e5694ac5181d3bf02a975d49d552d1fac44
candidate: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1028-1030-1031 at baseline e2a793f8 plus current diff

## Claim

The #1030 candidate makes every ZCode GLOBAL consumer invocation resolve a real support script exactly once while preserving project-install behavior.

## Surface

Read-only surface is `install-zcode.sh`, the G8 portions of `scripts/test-zcode-edition.js`, manifest/forge helpers needed to reason about actual deployed paths, and safe hermetic commands.

## Result

Analytical result: **refuted**.

Confidence: high. A concrete project-install boundary permitted by the installer makes the layout and support directories alias, leaves the generated self-launcher installed, and produces recursive execution rather than one real-script invocation.

Execution status: the production counterexample completed against `install-zcode.sh` SHA-256 `d8eaea63aca00a5b6c8c7e3abac876fdfdce20ea4a38aff8ddd0f26dd608520e`. During the pass, `scripts/test-zcode-edition.js` changed from SHA-256 `96ee4cf04209ede19bad939dc41d9a50c2ab93aa3142939f053d3a822d4e5bed` to `6155cac2d14877c7d81d12ba3bca11bd4f34628d869c691b68ba1977e309d384`; `install-zcode.sh` did not change. Per the dispatch stop condition, no validation of the changed test artifact was attempted and a closure pass is required after the production repair lands.

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=implementer rationale=project-local ZCODE_HOME aliases the project layout, so the project copy order overwrites the real support script with a recursive launcher

### R1 — project layout alias preserves the collision

- failure_class: boundary-value / path-alias collision
- trigger: project install with `--target /tmp/.../project` and `ZCODE_HOME=/tmp/.../project/.zcode`
- primary_anchor: `install-zcode.sh:451` — the branch assumes project launcher and support-script directories are distinct and therefore runs `install_support_scripts` before `install_edition_dir` for every non-global install.
- secondary_anchor: `install-zcode.sh:232` and `install-zcode.sh:291` — under the trigger, both functions target the same physical `$ZCODE_HOME/kaola-workflow/scripts` directory.
- proof:
  - Hermetic command environment used temporary `HOME`, target, consumer cwd, and project-local `ZCODE_HOME`; no real user home was touched.
  - Installer exited 0.
  - `$ZCODE_HOME/kaola-workflow/scripts/kaola-workflow-claim.js` contained the marker `zcode-edition support launcher` (`launcher_marker=1`).
  - From a consumer package whose name was not `kaola-workflow`, bounded invocation `node <deployed-claim> --help` returned `{status:null,error:"ETIMEDOUT",signal:"SIGKILL",stdoutBytes:0,stderrBytes:0}` after 1000 ms.
  - A post-run process-table query found no surviving process with the fixture script path; temporary fixtures were deleted successfully.
- impact: a valid project install configuration makes workflow support invocations recurse instead of reaching the real script once. The invocation hangs and can create a process chain until externally killed.
- action: make copy ordering depend on physical path aliasing, not only the `GLOBAL` flag, and retain the bounded alias regression witness.

## Counterexample frontier attempted

- github global install: passed. All 16 manifest `.js` files were present, byte-identical to their real source, contained no launcher marker, and the bounded claim `--help` invocation exited 0 from a non-Kaola consumer cwd.
- gitlab global install: passed with the same checks for all 18 manifest files.
- gitea global install: passed with the same checks for all 18 manifest files.
- stale-manifest convergence: passed. A seeded non-manifest `stale-future.js` was removed, and a github-to-gitlab reinstall left exactly the gitlab manifest set.
- ordinary project install with distinct target layout and `ZCODE_HOME`: passed. The project tree retained its launcher, the home tree retained the real script, and bounded launcher invocation from a consumer cwd exited 0.
- project install with aliased target layout and `ZCODE_HOME`: refuted the claim as R1.
- `--no-scripts`: passed for a hermetic gitea project install. Agents/commands/config remained, while neither support-script/edition directory was created.
- hooks/config order: for each global forge install, `hooks.enabled` was true and both configured global hook command targets existed when resolved from the ZCode home, matching the source-declared global hook cwd contract.
- process cleanup: no orphaned fixture support-script processes remained after the bounded recursion kill; the exact temporary tree was deleted.
- candidate stability: failed late because `scripts/test-zcode-edition.js` changed during the pass. The production anchor and reproduced failure remained unchanged.

The focused 691-test suite was not re-run: R1 had already refuted the claim, so the behavior contract requires short-circuiting the expensive validation rather than running it after an admitted defect.

discovery_verdict: fail
discovery_findings_blocking: 1

---

# Adversarial closure — R1

## Closure identities

candidate: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1028-1030-1031 at baseline e2a793f8 plus repaired current diff
repair_install_sha256: 73582d9e74a87c9a85bff8a22d8ffd0ab990906924813adac297a385521d15a2
repair_test_sha256: 6155cac2d14877c7d81d12ba3bca11bd4f34628d869c691b68ba1977e309d384

## Closure result

Analytical result: **not_refuted**.

Execution status: succeeded. The repair hashes were recorded before replay, remained unchanged through the focused suite, and matched again after all hermetic commands completed.

Confidence: high. The exact R1 trigger now installs the byte-identical real claim script, the bounded consumer invocation exits 0, the complete prior frontier passes, and the 695-assertion edition suite is green.

finding: id=R1 scope=in_scope action=none status=resolved severity=high fix_role=implementer rationale=universal real-script-last ordering resolves aliased and global layouts while preserving distinct project layout

### R1 closure proof

- prior_trigger_replayed: `--target <temp>/project` with `ZCODE_HOME=<temp>/project/.zcode`, consumer package name not equal to `kaola-workflow`.
- repair_anchor: `install-zcode.sh:447` now unconditionally runs `install_edition_dir` before `install_support_scripts`; the real manifest copy is final whether the directories are distinct or physically identical.
- test_anchor: the G8 project-alias region creates the exact equality `<target>/.zcode === ZCODE_HOME`, rejects the launcher marker, and bounds `--help` with a 1000 ms SIGKILL timeout.
- observed_result: the aliased deployed `kaola-workflow-claim.js` contained no `zcode-edition support launcher` marker and was byte-identical to `scripts/kaola-workflow-claim.js`.
- invocation_result: `{status:0,signal:null,stdoutBytes:1152,stderrBytes:0}`; no timeout or recursion occurred.
- forge_variants: the alias trigger was additionally replayed for gitlab and gitea using their renamed manifest claim basenames; both installed real scripts and exited 0 under the same bounded invocation.

## Prior frontier replay

- github global: all 16 manifest scripts were executable, byte-identical to the selected real source, contained no launcher marker, formed the exact deployed `.js` set, and the bounded claim invocation exited 0.
- gitlab global: the same checks passed for all 18 manifest scripts.
- gitea global: the same checks passed for all 18 manifest scripts.
- global stale convergence: a seeded non-manifest `stale-future.js` was removed for every forge; a github-to-gitlab reinstall left exactly the gitlab manifest set.
- distinct project layout: preserved. The project edition path retained the generated launcher, `$ZCODE_HOME` retained the real support script, and the launcher reached the real claim script with bounded exit 0 from a non-Kaola consumer cwd.
- `--no-scripts`: preserved for a gitea project fixture. Agents/commands/config deployed, while neither support-script nor edition directory was created.
- hooks/config: `hooks.enabled` was true; SessionStart and PreToolUse command targets existed for every global forge install when resolved from the source-declared ZCode-home cwd. Distinct-project hook targets existed when resolved from the project root.
- universal-order side effects: no extra `.js` files survived, executable bits remained set on all real manifest scripts, generated project launchers were not overwritten when paths were distinct, and aliased hook refreshes completed successfully.
- process cleanup: the final process-table query found no fixture support-script process. The exact closure temporary tree was deleted and absence was confirmed.
- focused suite: `node scripts/test-zcode-edition.js` exited 0 with `zcode-edition test passed (695 assertions)` and all three generated trees in parity.

No repair regression or new in-scope counterexample was demonstrated.

verdict: pass
findings_blocking: 0
