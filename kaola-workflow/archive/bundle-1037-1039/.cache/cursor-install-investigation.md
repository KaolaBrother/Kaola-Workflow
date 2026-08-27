# Investigation: PR #1041 Cursor installer, doctor, and CLI candidate matrix

## Setup

- Claim/question: what the exact candidate `8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8` actually does for PR #1041's declared focused suites, Cursor global/project installation, collision and refresh behavior, surface-specific doctor output, and standalone Cursor Agent CLI dispatch.
- Observation that would settle it: execute the declared suites and each disposable installer/doctor/CLI path, recording exit status, filesystem deltas, hashes, and emitted JSON. A live named dispatch would require the real standalone CLI host and authentication; otherwise the unmeasured boundary is recorded as a capability gap.
- Candidate worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1037-1039`.
- Candidate identity: `8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8` (`fix: adopt compatible layouts during an active run (#1037)`). The worktree was clean at start and end; `git diff --stat` was empty.
- PR metadata: `gh pr view 1041 --json number,title,headRefOid,baseRefOid,body` exited 0; PR head was `8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8`, base was `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`, title was `fix: global-first Cursor install and active-run layout adoption (#1039, #1037)`. Its body declared the five focused commands below and explicitly left local App/IDE, fresh Cloud boot, and Cursor CLI re-probe unclaimed.
- Environment: macOS arm64; `node v24.14.0`; GNU bash `3.2.57(1)-release (arm64-apple-darwin25)`; `git 2.50.1 (Apple Git-155)`; date `2026-08-27` (`Asia/Shanghai`). Installed paths: `/Users/ylpromax5/.local/bin/cursor-agent` and `/Users/ylpromax5/.local/bin/cursor`.
- Safety boundary: all installer/CLI fixtures used disposable paths under `/tmp`; `HOME` and `CURSOR_HOME` were redirected for those calls. No tracked file or real user runtime directory was modified. The report is the only durable write from this investigation. The exact-candidate archive used for generated-tree tests was `/tmp/kw-cursor-candidate-gszSZD`.

### Exact commands run

Focused suites, first from the supplied linked worktree and then (for the Cursor edition suite) from an exact-HEAD archive:

```text
node scripts/test-cursor-edition.js
node scripts/test-runtime-agent-architecture.js
node scripts/test-generate-routing-surfaces.js
node scripts/test-route-reachability.js
node scripts/validate-script-sync.js
scratch_root=$(mktemp -d /tmp/kw-cursor-suite-XXXXXX); git archive --format=tar HEAD | tar -xf - -C "$scratch_root"; (cd "$scratch_root" && node scripts/test-cursor-edition.js)
```

Disposable source and Git fixtures:

```text
candidate_root=$(mktemp -d /tmp/kw-cursor-candidate-XXXXXX); git archive --format=tar HEAD | tar -xf - -C "$candidate_root"
repo_one=$(mktemp -d /tmp/kw-cursor-repo-one-XXXXXX); repo_two=$(mktemp -d /tmp/kw-cursor-repo-two-XXXXXX); git -C "$repo_one" init -q; git -C "$repo_two" init -q
```

The global probes then invoked the exact candidate installer as follows (with the shown disposable `HOME`/`CURSOR_HOME` paths):

```text
(cd /tmp/kw-cursor-repo-one-DirOw2 && env HOME=/tmp/kw-cursor-user-one-bXCVjP CURSOR_HOME=/tmp/kw-cursor-home-one-feDjWW bash /tmp/kw-cursor-candidate-gszSZD/install-cursor.sh --global --yes)
(cd /tmp/kw-cursor-repo-two-m7Keyv && env HOME=/tmp/kw-cursor-user-two-fuDiYa CURSOR_HOME=/tmp/kw-cursor-home-two-yxW9Rt bash /tmp/kw-cursor-candidate-gszSZD/install-cursor.sh --global --yes)
```

The explicit project target probe was run from unrelated `repo_two`:

```text
(cd /tmp/kw-cursor-repo-two-m7Keyv && env HOME=/tmp/kw-cursor-target-user-8tuuLr CURSOR_HOME=/tmp/kw-cursor-target-home-nNGbyy bash /tmp/kw-cursor-candidate-gszSZD/install-cursor.sh --target /tmp/kw-cursor-target-0Py6GV --yes)
```

The stale-refresh probe replaced only a fixture file under the disposable target, then reran:

```text
printf '%s\n' 'STALE-BY-TEST' > /tmp/kw-cursor-target-0Py6GV/.cursor/agents/implementer.md
(cd /tmp/kw-cursor-repo-one-DirOw2 && env HOME=/tmp/kw-cursor-target-user-8tuuLr CURSOR_HOME=/tmp/kw-cursor-target-home-nNGbyy bash /tmp/kw-cursor-candidate-gszSZD/install-cursor.sh --target /tmp/kw-cursor-target-0Py6GV --yes)
```

The existing-project preservation probe invoked:

```text
(cd /tmp/kw-cursor-preserve-repo-JmIj8Y && env HOME=/tmp/kw-cursor-user-one-bXCVjP CURSOR_HOME=/tmp/kw-cursor-preserve-home-9NP5jD bash /tmp/kw-cursor-candidate-gszSZD/install-cursor.sh --global --yes)
```

Doctor and source-parity calls:

```text
(cd /tmp/kw-cursor-candidate-gszSZD && env HOME=/tmp/kw-cursor-doctor-home-1sttMh CURSOR_HOME=/tmp/kw-cursor-doctor-cursor-home-qoqNx6 bash ./install-cursor.sh --doctor --json --product cli --host local)
(cd /tmp/kw-cursor-candidate-gszSZD && env HOME=/tmp/kw-cursor-doctor-home-1sttMh CURSOR_HOME=/tmp/kw-cursor-doctor-cursor-home-qoqNx6 bash ./install-cursor.sh --doctor --json --product app --host local)
(cd /tmp/kw-cursor-candidate-gszSZD && env HOME=/tmp/kw-cursor-doctor-home-1sttMh CURSOR_HOME=/tmp/kw-cursor-doctor-cursor-home-qoqNx6 bash ./install-cursor.sh --doctor --json --product app --host cloud)
(cd /tmp/kw-cursor-target-0Py6GV && env HOME=/tmp/kw-cursor-target-user-8tuuLr CURSOR_HOME=/tmp/kw-cursor-target-home-nNGbyy bash /tmp/kw-cursor-candidate-gszSZD/install-cursor.sh --doctor --json --target /tmp/kw-cursor-target-0Py6GV --product cli --host local)
(cd /tmp/kw-cursor-candidate-gszSZD && node scripts/sync-cursor-edition.js --check)
```

Standalone CLI calls, always under disposable `HOME`:

```text
env HOME=/tmp/kw-cursor-cli-home-x4ymwv cursor-agent --version
env HOME=/tmp/kw-cursor-cli-home-x4ymwv cursor-agent --help
env HOME=/tmp/kw-cursor-status-home-JLj0uD cursor-agent status
env HOME=/tmp/kw-cursor-status-home-JLj0uD cursor-agent whoami
env HOME=/tmp/kw-cursor-status-home-JLj0uD CURSOR_HOME=/tmp/kw-cursor-target-home-nNGbyy NO_OPEN_BROWSER=1 cursor-agent --print --output-format stream-json --trust --sandbox enabled --workspace /tmp/kw-cursor-target-0Py6GV 'Read-only diagnostic. Before any work, call the native Task tool exactly once with subagentType implementer and omit any model argument. Ask it to return the single token CURSOR_PROJECT_CATALOG_PROBE. Do not use shell or write tools. Return its result and stop.'
```

## Observations

| Measurement | Command | Result | Exit |
|-------------|---------|--------|------|
| Candidate identity | `git rev-parse HEAD`; `git status --short --branch` | HEAD exactly `8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8`; clean branch `cursor/install-surface-1039-9401...origin/cursor/install-surface-1039-9401`. | 0 |
| PR declaration | `gh pr view 1041 --json number,title,headRefOid,baseRefOid,body` | Five focused suites declared: Cursor edition, runtime architecture, routing surfaces, route reachability, script sync. | 0 |
| Supplied-worktree Cursor suite | `node scripts/test-cursor-edition.js` | Stopped before assertions because the linked worktree resolves generated-tree root to `/Users/ylpromax5/Workspace/Kaola-Workflow`; `.cursor/commands/{kaola-workflow-finalize,workflow-init,workflow-next}.md` were stale. Output: `cursor-edition test FAILED: D0[github] ... present on disk and has DRIFTED ...`; it did not reach its self-repairing write. | 1 |
| Fresh exact-candidate Cursor suite | `(cd /tmp/kw-cursor-suite-ErLPKd && node scripts/test-cursor-edition.js)` | `D0: SKIPPED` for absent `.cursor`, `.cursor-gitlab`, `.cursor-gitea`; after self-provisioning: `cursor-edition test passed (871 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (...)]`. | 0 |
| Runtime architecture suite | `node scripts/test-runtime-agent-architecture.js` | `runtime-agent-architecture test passed (762 assertions). [generator: scripts/generate-agent-profiles.js]` | 0 |
| Routing-surface suite | `node scripts/test-generate-routing-surfaces.js` | `test-generate-routing-surfaces: all 520 assertions passed.` | 0 |
| Route-reachability suite | `node scripts/test-route-reachability.js` | `Route-reachability test passed (170 assertions).` | 0 |
| Script-sync suite | `node scripts/validate-script-sync.js` | `OK: 16 common scripts, 28 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 5 forge export-superset families in sync.` followed by `committed kernel parity: 4 Oracle Kernel copies identical at HEAD.` | 0 |
| Global install from unrelated Git repo 1 | `.../repo-one... install-cursor.sh --global --yes` | Started with `BEFORE_CURSOR=absent`; installed 14 agents and 3 commands into `/tmp/kw-cursor-home-one-feDjWW`, support scripts/hooks, and global `hooks.json`. Finished `AFTER_CURSOR=absent`, `AMBIENT_FILES=` empty, `GLOBAL_NESTED_CURSOR=absent`, and Git status `## No commits yet on main`. | 0 |
| Global install from unrelated Git repo 2 | `.../repo-two... install-cursor.sh --global --yes` | Same result independently: `AFTER_CURSOR=absent`, `AMBIENT_FILES=` empty, 14 global agents, 3 global commands, no nested `CURSOR_HOME/.cursor`, and unchanged Git status. | 0 |
| Explicit project materialization | `.../repo-two... install-cursor.sh --target /tmp/kw-cursor-target-0Py6GV --yes` | Target received 14 managed agents, 3 managed commands, and 2 project hooks. Including seeded unmanaged files, counts were 15 agent files and 4 command files. `CURSOR_HOME/hooks.json` stayed absent; target hooks JSON preserved `beforeShellExecution` and added `sessionStart`. Invoking repo-two still had `AMBIENT_REPO_TWO_CURSOR=absent`. | 0 |
| Same-name agent collision | Target seeded `.cursor/agents/implementer.md` hash `66ff78684a294ccfc6faaf290a990019232a8587af6b11042a56c72dc3c81234`; after explicit install hash was `2375574b15bc4767ee528ce7531bd3d5b2bbed295409f8df66504332612bd31c`, equal to candidate source. | No warning/refusal appeared in installer output. |
| Same-name command collision | Target seeded `.cursor/commands/workflow-next.md` hash `4228b8c6e6b54eb1832a5269ab356bc459bbb523136c012a6bcbcb59d3264417`; after explicit install hash was `6db9a0569c2fa94680b5a5c68482a721e6354503c701198461fd7a46afbfaf07`, equal to candidate source. | No warning/refusal appeared in installer output. |
| Unmanaged target files | Seeded `user-owned.md` and `user-command.md` with owner text. | Both remained byte-identical (`USER-UNMANAGED-AGENT`, `USER-UNMANAGED-COMMAND`). The same-basename managed files did not remain owner-identical. | 0 install |
| Explicit-target freshness repair | Replaced target `implementer.md` with `STALE-BY-TEST`, then reran explicit target install. | `PRE_REPAIR_CMP=different`; installer completed; `POST_REPAIR_CMP=equal`; post-repair hash again `2375574b15bc4767ee528ce7531bd3d5b2bbed295409f8df66504332612bd31c`. | 0 |
| Generated source parity after install | `(cd /tmp/kw-cursor-candidate-gszSZD && node scripts/sync-cursor-edition.js --check)` | `sync-cursor-edition[github]: 14 agent(s) + 3 command(s) + 2 hook file(s) in parity with canonical.` | 0 |
| Global install with existing project assets | `.../preserve-repo... install-cursor.sh --global --yes` | Seeded project `keep.md` files and hooks JSON retained exact hashes (`8b1608...b1b0f`, `28ca36...fe4c38`, `272a65...a0449d` before and after); project `implementer.md` remained absent; global home got 14 agents. | 0 |
| Doctor CLI/local | `install-cursor.sh --doctor --json --product cli --host local` | JSON selected `product_surface=cli`, `execution_host=local`, `kaola_workflow_version=10.0.1`, `inferred_from_sibling_binary=false`, `ambient_repository_write=false`, `global_discovery=unsupported`, `required_project_materialization=yes`, `named_catalog=project_custom_when_present`, `reload=new_process_same_chat`; evidence stamp was build `2026.08.25-3e8eec8`, host `standalone_agent_cli`, date `2026-08-27`, status `prior_probe_not_re-run_here`; `capability_gap=unknown`. | 0 |
| Doctor App/local | `install-cursor.sh --doctor --json --product app --host local` | JSON selected `product_surface=app`, `execution_host=local`, `inferred_from_sibling_binary=false`, `ambient_repository_write=false`, `global_discovery=unknown`, `required_project_materialization=unknown`, `named_catalog=unknown`, `reload=unknown`; evidence stamp was build `unknown`, host `local_ide_agent`, `observed_at=null`, status `unprobed`; `capability_gap=unknown`. | 0 |
| Doctor App/cloud | `install-cursor.sh --doctor --json --product app --host cloud` | JSON selected `product_surface=app`, `execution_host=cloud`, `inferred_from_sibling_binary=false`, `ambient_repository_write=false`, `global_discovery=unsupported`, `required_project_materialization=unknown`, `named_catalog=built_in_only`, `reload=unknown`; evidence stamp was build `cursor-grok-4.6-xhigh`, host `app_started_cloud_vm`, date `2026-08-27`, status `live`; `capability_gap=catalog_miss`. | 0 |
| Doctor write boundary | All three doctor calls used empty disposable doctor homes. | `BEFORE_HOME_ENTRIES=0`, `BEFORE_CURSOR_ENTRIES=0`, `AFTER_HOME_ENTRIES=0`, `AFTER_CURSOR_ENTRIES=0`. | 0 |
| Doctor against explicit target | `install-cursor.sh --doctor --json --target /tmp/kw-cursor-target-0Py6GV --product cli --host local` | Target `implementer.md` hash unchanged. Parsed top-level keys were `ambient_repository_write,capability_gap,evidence_stamp,execution_host,global_discovery,global_root,inferred_from_sibling_binary,kaola_workflow_version,named_catalog,note,product_surface,project_materialization,reload,required_project_materialization,runtime,selected_host,surfaces`; `has_target=false`, `has_freshness=false`, `has_collision=false`. | 0 |
| Standalone CLI version | `env HOME=/tmp/kw-cursor-cli-home-x4ymwv cursor-agent --version` | `2026.08.25-3e8eec8`. | 0 |
| Standalone CLI help | `env HOME=/tmp/kw-cursor-cli-home-x4ymwv cursor-agent --help` | CLI identified itself as `Usage: agent [options] [command]`; `--model <model>` is optional; no project-catalog dispatch was performed. It created only disposable temp-home cache/config entries. | 0 |
| Isolated CLI authentication status | `env HOME=/tmp/kw-cursor-status-home-JLj0uD cursor-agent status`; same for `whoami` | Both printed `Not logged in` and exited 0. `CURSOR_API_KEY_LENGTH=0`. | 0 |
| Exact named CLI dispatch attempt | `cursor-agent --print --output-format stream-json --trust --sandbox enabled --workspace /tmp/kw-cursor-target-0Py6GV '...call native Task ... subagentType implementer and omit any model argument...'` | Printed `Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.` No Task call, named child result, or tier-carrier observation was emitted. | 1 |
| Final candidate state | `git status --short --branch; git diff --stat; git diff --check; git rev-parse HEAD` | Clean candidate worktree, empty diff stat, no diff-check output, exact HEAD retained. `node scripts/sync-cursor-edition.js --print-tree-root` reported `/Users/ylpromax5/Workspace/Kaola-Workflow` (the linked worktree's shared generated-tree root). | 0 |

### Selected raw output

The focused suite's supplied-worktree failure and clean archive pass were:

```text
sync-cursor-edition[github]: PARITY FAILED (3 file(s)):
  - .cursor/commands/kaola-workflow-finalize.md — stale — regenerate
  - .cursor/commands/workflow-init.md — stale — regenerate
  - .cursor/commands/workflow-next.md — stale — regenerate
...
cursor-edition test FAILED: D0[github]: .cursor is present on disk and has DRIFTED from canonical (sync --check exit 1).
...

D0: SKIPPED — .cursor is absent from disk, so nothing was compared (gitignored generated tree; a fresh clone has none).
D0: SKIPPED — .cursor-gitlab is absent from disk, so nothing was compared (gitignored generated tree; a fresh clone has none).
D0: SKIPPED — .cursor-gitea is absent from disk, so nothing was compared (gitignored generated tree; a fresh clone has none).
cursor-edition test passed (871 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (.cursor, .cursor-gitlab, .cursor-gitea)]
```

The two global installs emitted the same scope boundary (the paths differed):

```text
Kaola-Workflow · cursor edition (github) — refreshing generated tree...
Deploying globally (github) → /tmp/kw-cursor-home-one-feDjWW
Installed workflow agents → /tmp/kw-cursor-home-one-feDjWW/agents/ (14)
Installed workflow commands → /tmp/kw-cursor-home-one-feDjWW/commands/
Global install writes only /tmp/kw-cursor-home-one-feDjWW/{agents,commands}. Project catalogs need explicit --target DIR.
Installed support scripts → /tmp/kw-cursor-home-one-feDjWW/kaola-workflow/scripts (forge github)
Installed hook scripts → /tmp/kw-cursor-home-one-feDjWW/kaola-workflow/hooks
Installed hook scripts → /tmp/kw-cursor-home-one-feDjWW/hooks
Merged hooks JSON → /tmp/kw-cursor-home-one-feDjWW/hooks.json
```

The explicit-target merge showed the project hooks split and preserved user event:

```text
Installed workflow agents → /tmp/kw-cursor-target-0Py6GV/.cursor/agents/ (14)
Installed workflow commands → /tmp/kw-cursor-target-0Py6GV/.cursor/commands/
Installed hook scripts → /tmp/kw-cursor-target-0Py6GV/.cursor/hooks
Merged hooks JSON → /tmp/kw-cursor-target-0Py6GV/.cursor/hooks.json
HOOK_KEYS=
["beforeShellExecution","sessionStart"]
[{"command":"echo user-owned"}]
[".cursor/hooks/kaola-workflow-compact-context.sh",".cursor/hooks/kaola-workflow-ensure-cursor-catalog.sh"]
```

The three selected doctor JSON rows emitted these exact top-level values:

```text
cli/local:  global_discovery=unsupported; required_project_materialization=yes; named_catalog=project_custom_when_present; reload=new_process_same_chat; evidence_stamp.status=prior_probe_not_re-run_here; inferred_from_sibling_binary=false; ambient_repository_write=false
app/local:  global_discovery=unknown; required_project_materialization=unknown; named_catalog=unknown; reload=unknown; evidence_stamp.status=unprobed; inferred_from_sibling_binary=false; ambient_repository_write=false
app/cloud:  global_discovery=unsupported; required_project_materialization=unknown; named_catalog=built_in_only; reload=unknown; evidence_stamp.status=live; capability_gap=catalog_miss; inferred_from_sibling_binary=false; ambient_repository_write=false
```

## Reproduction

- **Global ambient-write claim:** reproduces as the narrow intended behavior. Two unrelated disposable Git repositories remained without `.cursor`, with empty ambient file listings and unchanged Git status after `--global`; global homes contained the 14/3 managed catalog and hook assets.
- **Explicit project materialization:** reproduces. A target supplied with `--target` received the project catalog and hooks while the invoking unrelated repository remained without `.cursor`.
- **Same-basename collision:** reproduces as silent replacement. Existing owner bytes at the managed basenames `implementer.md` and `workflow-next.md` were replaced by candidate-generated bytes; the installer exited 0 and emitted no collision refusal/warning.
- **Freshness repair:** reproduces as byte refresh. A deliberately stale target agent compared different before rerun and equal to candidate source after rerun; the installer exited 0.
- **Doctor host separation:** reproduces structurally. The three explicit product/host inputs selected distinct rows; App/local stayed unknown/unprobed, App/cloud stayed built-in-only/live, and CLI/local carried its separate prior-probe stamp. All were read-only in empty temp homes.
- **Exact named CLI dispatch:** does not reproduce because the isolated standalone CLI is not authenticated. The command reached the installed CLI but exited before catalog inspection or Task dispatch.

## Narrowing

- **Focused-suite environment axis:** the linked worktree's shared generated root was stale, so its Cursor suite stopped at D0. An exact-HEAD archive with no generated trees passed the same suite at 871 assertions after self-provisioning. This separates a shared ignored-tree freshness issue from candidate assertion behavior.
- **Global vs explicit target axis:** `--global` from both unrelated Git repos did not create project assets; `--target` from one of those repos materialized only the named target. This rules in the immediate installer scope split for these GitHub/default-forge cases.
- **Managed vs unmanaged filename axis:** non-managed `user-owned.md`/`user-command.md` survived; managed-basename files did not. This rules out a blanket “all existing project files are preserved” interpretation and isolates the collision behavior to the installer's basename copy set.
- **Fresh vs stale target axis:** a stale managed target byte was repaired by rerunning the installer. The test does not establish a persistent project version/hash manifest because none was created or surfaced by the measured install.
- **Doctor surface axis:** changing only `--product`/`--host` changed selected fields as expected and preserved `inferred_from_sibling_binary=false`; adding `--target` did not add target inspection, freshness, or collision fields. The doctor path is therefore independently selectable but was not shown to inspect effective target state.
- **CLI authentication axis:** version/help/status worked, but the exact no-model named-dispatch attempt stopped at authentication. No CLI catalog, Task enum, named child, or tier-carrier fact was substituted from the App, shell wrapper, or static adapter.

## Inferences

- The candidate's immediate global installer scope rule is supported with high confidence for the two measured default-forge Git fixtures: it writes the selected `CURSOR_HOME` carrier and does not write an ambient repository. This would be refuted by a fresh default-forge global run that adds or changes an ambient project `.cursor` asset.
- The explicit target path is operational and refreshes generated bytes, but the measured installer does not refuse or diagnose same-basename project ownership collisions. Confidence is high because both before/after hashes and the zero exit/no-warning output are direct observations. A collision-aware run that preserves or explicitly rejects those owner files would refute this finding.
- The doctor output is a static surface report for the requested product/host, not a measured effective-install diagnostic for the target tested here: it returned 0 with an explicit target, did not change with target state, and exposed no `target`, `freshness`, or `collision` fields. Confidence is high for the output contract observed; a doctor implementation that inspects a target and reports those fields would refute the broader diagnostic-gap inference.
- Cursor CLI named-role dispatch and its omitted-model tier carrier remain unmeasured in this run. The installed binary/version is proven, but authentication prevented a live Task call. Confidence is high that this run cannot support a named-dispatch PASS; a genuinely authenticated CLI call from the pre-materialized project catalog would supply the missing evidence.
- Local Cursor App/IDE Agent catalog and a fresh App-started Cloud boot were not driven here. No CLI, shell command, static adapter row, or prior report was treated as evidence for either distinct host.

## Open

- Live exact-named standalone CLI dispatch with a pre-boot project `.cursor/agents/implementer.md`, omitted per-call model, and observable tier/profile carrier: blocked by isolated authentication (`Not logged in`, no API key). The correct boundary is `capability_gap`, not a simulated dispatch.
- Local Cursor App/IDE Agent catalog, precedence, reload, command/hook behavior, and tier carrier: unmeasured; a genuine App host is required.
- Fresh App-started Cloud consumer boot with project assets present before boot and any remote injection path: unmeasured; a new Cloud run is required.
- The measured target install has no surfaced version/hash/collision manifest, and the static doctor does not report target freshness/collision. Whether a later runtime-specific mechanism supplies those facts was outside this bounded matrix.
- The focused suite's direct linked-worktree D0 failure is preserved as an environment observation; the clean exact-HEAD archive pass is the candidate assertion result. No generated tree was repaired in the shared worktree.
- All disposable `/tmp/kw-cursor-*` fixture roots were removed after recording their paths and outputs; only this report remains from the investigation.
