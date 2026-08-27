# PR #1041 repair acceptance RED

baseline: `8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8`

Production baseline was unchanged while these tests ran. The acceptance write set is limited to:

- `scripts/test-cursor-edition.js`
- `scripts/test-runtime-agent-architecture.js`

## Cursor installation and doctor RED

Command:

```text
git archive --format=tar HEAD | tar -xf - -C /tmp/kw-pr1041-red-cursor-BObdkR
cp scripts/test-cursor-edition.js /tmp/kw-pr1041-red-cursor-BObdkR/scripts/test-cursor-edition.js
node /tmp/kw-pr1041-red-cursor-BObdkR/scripts/test-cursor-edition.js
```

Result: exit `1`; `17 failure(s), 849 passed`. The clean archive was necessary because the linked
worktree shares ignored generated Cursor trees with the main checkout; running there stops at D0 on
pre-existing generated-tree drift before reaching the new acceptance.

Failure signatures:

```text
RED: G8-sessionStart — global sessionStart still contains kaola-workflow-ensure-cursor-catalog.sh
RED: G8-sessionStart — running installed sessionStart hooks changed owner implementer bytes and added the other 13 canonical agents
RED: G8-collision-doctor — doctor did not identify canonical-name unmanaged collisions
RED: G8-collision — explicit target exited 0 and overwrote owner agent/command bytes
RED: G8-collision-uninstall — uninstall deleted files that were never safely recorded as managed
RED: G8-symlink — explicit target followed a managed-basename symlink and overwrote its outside owner target
RED: G8-symlink-uninstall — uninstall removed the unmanaged symlink
RED: G8-freshness-doctor — doctor reported neither exact target nor materialized SHA-256 nor effective current scope
RED: G8-freshness-doctor — doctor did not detect post-materialization byte mismatch
RED: G8-freshness-uninstall — uninstall deleted a managed file whose bytes no longer matched the installed materialization
RED: G8-authority — explicit target succeeded after the installed global implementer authority was removed, proving repository-source fallback
RED: G10-install — global install still deployed the ambient ensure script/hook and the source helper still shipped
RED: G10-hook — rendered sessionStart still contained the ambient ensure/catalog materializer
```

Mutation proof: the hook oracle accepts the shipped non-materializing compact hook shape but detects
an injected `.cursor/hooks/kaola-workflow-ensure-cursor-catalog.sh` entry. The behavioral fixture also
mutates global authority availability and project bytes, so static source agreement cannot make it
green.

## Active-run and workflow-init RED

Command:

```text
node scripts/test-runtime-agent-architecture.js
```

Result: exit `1`; `11 failure(s), 777 passed`.

Failure signatures:

```text
RED: A3[init-install-boundary/templates/routing/init.skeleton.md] — workflow-init executes install-codex-agent-profiles.js --global
RED: A3[init-install-boundary/plugins/kaola-workflow*/skills/kaola-workflow-init/SKILL.md] — all three Codex init consumers execute the same global installer
RED: A3[active-execution-consent] — plan exposes no explicit ephemeral consent apply_args
RED: A3[active-execution-consent] — no production-reachable post-conversation apply leg exists
RED: A3[active-state-schema] — production plan does not emit state_schema_incompatible for schema_version 999 active state
RED: A3[active-state-schema] — production apply rewrites instructions instead of fencing the incompatible active run
RED: A3[active-state-schema] — the rewrite changes instruction bytes and emits an adoption receipt around unknown state
```

Mutation proof: the init-surface detector catches an injected executable
`install-codex-agent-profiles.js --global` command in an otherwise clean generated command surface.
The consent fixture proves the semantic contrast through the real CLI: bare apply must remain
non-mutating, while only plan-emitted ephemeral consent arguments may authorize the same exact
old/new migration. The schema fixture supplies incompatible live state and an in-flight Mission List
to the production classifier rather than calling `compatibilityFor()` with a stand-in object.

## Baseline identity and write boundary

```text
baseline: 8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8
git diff --check: PASS
production/source changes by test author: none
```

## Follow-up: portable-init validator oracle repair

The active/init production repair removed executable runtime/global installation from all init
surfaces. Three validator artifacts still demanded the semantic opposite.

Old-pin RED:

```text
node scripts/validate-kaola-workflow-contracts.js
exit 1: plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md must include: install-codex-agent-profiles.js" --global

focused GitHub pin: exit 1 — github: stale validator pin RED: missing install-codex-agent-profiles.js" --global
focused GitLab pin: exit 1 — gitlab: stale validator pin RED: missing install-codex-agent-profiles.js" --global
focused Gitea pin: exit 1 — gitea: stale validator pin RED: missing install-codex-agent-profiles.js" --global
```

The GitLab and Gitea complete validators initially stopped even earlier in the same retired install
block on their removed `plugin_root=...` setup lines. Focused one-assertion runs established that the
later `--global` pins independently RED as well.

Updated validation-test paths:

- `scripts/validate-kaola-workflow-contracts.js`
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

Each validator now rejects executable runtime/global installer commands on its init skill and command
surface, requires the skill's portable-init boundary statement, and proves the detector catches an
injected `node "$plugin_root/scripts/install-codex-agent-profiles.js" --global` command.

GREEN validation:

```text
node scripts/validate-kaola-workflow-contracts.js
Kaola-Workflow Codex contract validation passed

node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
Kaola-Workflow GitLab contract validation passed

node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
Kaola-Workflow Gitea contract validation passed
```

## Follow-up: per-change mixed schema RED

New acceptance path: `scripts/test-runtime-agent-architecture.js` now drives the real helper with an
active `schema_version: 999` state, an in-flight Mission List, an execution-default AGENTS drift, and
a separately pending layout-equivalent thin CLAUDE bridge.

Command and result:

```text
node scripts/test-runtime-agent-architecture.js
exit 1: runtime-agent-architecture test FAILED: 3 failure(s), 789 passed
```

Failure signatures:

```text
RED: A3[active-state-schema-mixed] — incompatible state froze the layout-equivalent CLAUDE write together with fenced AGENTS
RED: A3[active-state-schema-mixed] — partial adoption did not preserve/apply the two per-change outcomes
RED: A3[active-state-schema-mixed] — no recovery receipt recorded only the safe CLAUDE.md write
```

The fixture requires apply to write only `CLAUDE.md`, preserve AGENTS/state/Mission List bytes, retain
`state_schema_incompatible` evidence, emit no consent for the fenced change, and record recovery
evidence whose write set is exactly `CLAUDE.md` without durable approval state.

## Follow-up: standalone Cursor CLI pre-dispatch materialization oracle

Acceptance-test path changed:

- `scripts/test-cursor-edition.js`

The generated-byte oracle covers `workflow-next` and `kaola-workflow-finalize` for GitHub, GitLab,
and Gitea. It requires exactly one installed
`kaola-workflow-cursor-surface.js --ensure-target "$PWD" --forge=<selected forge>` call in a
standalone-CLI-local-only pre-dispatch section. Cursor App local and App-started Cloud remain
separate live-catalog decisions with an explicit negative boundary: neither inherits the CLI
materialization rule. `current` is a no-op; `materialized` requires a new CLI process before named
dispatch; missing/stale authority, collisions, symlinks, invalid/unproved bytes fail closed; ambient
cwd and `sessionStart` materializers remain forbidden.

The real-helper leg runs the artifact installed under a hermetic `CURSOR_HOME` by
`install-cursor.sh --global`. It proves first-call `materialized`, second-call `current` with an
identical byte/mode/mtime snapshot, global-authority byte provenance, modified receipt-owned byte
preservation, unproved collision preservation, symlink preservation, no-target/no-ambient writes,
and missing/hash-stale global authority refusal before target mutation.

Exact PR baseline RED procedure:

```text
red_root=$(mktemp -d /tmp/kw-pr1041-cli-materialization-red-XXXXXX)
git archive HEAD | tar -xf - -C "$red_root"
cp scripts/test-cursor-edition.js "$red_root/scripts/test-cursor-edition.js"
node "$red_root/scripts/test-cursor-edition.js"
```

Baseline and result:

```text
baseline: 8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8
temp tree: /tmp/kw-pr1041-cli-materialization-red-KbHEER
exit 1: cursor-edition test FAILED: 24 failure(s), 849 passed
```

New failure signatures on that unchanged production baseline:

```text
RED: G2-cli-materialization[workflow-next] — missing standalone CLI pre-dispatch section and installed-helper --ensure-target call
RED: G2-cli-materialization[kaola-workflow-finalize] — missing standalone CLI pre-dispatch section and installed-helper --ensure-target call
RED: G7[gitlab|gitea][workflow-next|kaola-workflow-finalize] — no exact generated --forge=<forge> explicit-target transaction
RED: G8-installed-helper — --global did not install and receipt kaola-workflow-cursor-surface.js
```

Mutation proof uses each real generated GitHub consumer as the subject. Removing the
`--ensure-target "$PWD"` operand, replacing it with ambient `"."`, or reversing the App-host
negative rule makes `cursorCliMaterializationVerdict()` reject the mutated bytes.

Current repaired-production GREEN was run from an isolated copy of the shared working tree so the
linked checkout's pre-existing generated Cursor trees could neither satisfy nor block the oracle:

```text
green_root=$(mktemp -d /tmp/kw-pr1041-cli-materialization-green-XXXXXX)
rsync -a --exclude='.git' --exclude='.kw' --exclude='.cursor' --exclude='.cursor-gitlab' --exclude='.cursor-gitea' ./ "$green_root/"
node "$green_root/scripts/test-cursor-edition.js"

temp tree: /tmp/kw-pr1041-cli-materialization-green-sv1vxe
exit 0: cursor-edition test passed (749 assertions)
```

The repaired production snapshot used for that GREEN had these subject hashes:

```text
install-cursor.sh                                  8ca572a8574d86b2e95e047897ecdc0a5915f5d14fc1e352bd60491e7e9ea821
scripts/kaola-workflow-cursor-surface.js           1bfe82ac6b53e378ba40404cb882533a3cb9935105de6dad01cd27e5f6b2a74e
scripts/sync-cursor-edition.js                     a1de8da26cd54ba1191db3ccdb817b71a390c7f8f08892a459bf22fb03599d8c
scripts/test-cursor-edition.js                     cc8055d3964345dad8c85ef78e5ebc2036dff236d261be246affc9da21e0aa87
```

Final focused hygiene:

```text
node --check scripts/test-cursor-edition.js: PASS
git diff --check: PASS
production/source changes by test author in this follow-up: none
```

## Follow-up: final-review doctor and no-scripts transition RED

Independent final review of exact candidate
`0884a8347828b2c77d969d639196724af26d0905` exposed two additional causal classes. The acceptance
oracle was added before changing production and was then run against that unchanged baseline.

Baseline RED:

```text
node scripts/test-cursor-edition.js
exit 1: cursor-edition test FAILED: 7 failure(s), 778 passed
```

Failure identities:

```text
R1 current identity — doctor flattened a historical Cloud evidence stamp into current runtime_build and named_catalog on an empty host
R1 current capability gap — doctor implied a current catalog identity without a live observation or current receipt
R3 no-scripts ownership — full-to-no-scripts install dropped receipt ownership for preserved script and hook files
R3 uninstall bytes — uninstall consequently left preserved receipt-owned script/hook bytes behind
R3 uninstall hook entry — uninstall consequently left the preserved sessionStart hook registration behind
R3 partial authority promotion — a fresh no-scripts authority was not promoted when a later ordinary project install requested scripts/hooks
R3 restored hook surface — that later ordinary project install therefore failed to restore the project sessionStart hook surface
```

The transition fixtures use isolated Cursor homes and targets. They prove both full-to-no-scripts-to-
uninstall cleanup and fresh-no-scripts-to-default-project promotion through the production installer,
including receipt files, hook entries, installed bytes, and the rendered project hook.

Repaired-production GREEN:

```text
node scripts/test-cursor-edition.js
exit 0: cursor-edition test passed (785 assertions)

node scripts/test-runtime-agent-architecture.js
exit 0: runtime-agent-architecture test passed (798 assertions)

node scripts/test-install-all.js
exit 0: install-all test passed (275 assertions)

node scripts/test-routing.js
exit 0: routing test passed (520 assertions)

node scripts/simulate-workflow-walkthrough.js
exit 0: 179/179 passed

git diff --check
exit 0
```

The repaired doctor now keeps current `runtime_build`, `named_catalog`, and `capability_gap` unknown
without a live current observation while retaining the historical Cloud Build/catalog under the
typed evidence stamp. A `--no-scripts` transition retains ownership only for prior non-missing
skipped assets and hook entries, so later uninstall can safely remove unchanged owned bytes while
preserving modified bytes. A later ordinary project install first promotes an incomplete global
authority to the complete desired receipt, then materializes the project from that authority.

## Follow-up: closure-review active global live-hook promotion RED

The first closure review confirmed R1 and both original R3 transitions resolved on exact candidate
`51ebbac2fa024de3bf8f6e4c428a753aaf95a540`, then exposed R4. The new production-path fixture was
added before the production repair and ran this exact transition in one isolated Cursor home:

```text
full global install
remove one receipt-owned kaola-workflow/hooks authority file
global --no-scripts (retains the still-present hooks/ live hook and sessionStart entry)
ordinary project install (enters authority-only promotion)
```

Baseline RED:

```text
node scripts/test-cursor-edition.js
exit 1: cursor-edition test FAILED: 1 failure(s), 787 passed

FAIL: G8-noscripts-live-hook-promotion: authority-only promotion preserves the active global live hook, receipt ownership, and registration
```

Observed semantic opposite: the promotion restored the authority and project hook files but deleted
the separately active global `hooks/kaola-workflow-compact-context.sh`, dropped its receipt record,
and left the global `hooks.json` `sessionStart` entry dangling.

Surgical repair: an authority-only global transaction now preserves the prior `hooks/` prefix during
retirement and carries forward only non-missing prior receipt records. It still writes no live hook,
does not adopt unproved bytes, and does not change the no-scripts rule.

GREEN affected frontier:

```text
node scripts/test-cursor-edition.js
exit 0: cursor-edition test passed (788 assertions)

node scripts/test-runtime-agent-architecture.js
exit 0: runtime-agent-architecture test passed (798 assertions)

node scripts/test-install-all.js
exit 0: install-all contract test passed (275 assertions)

node scripts/test-generate-routing-surfaces.js
exit 0: all 520 assertions passed

node scripts/simulate-workflow-walkthrough.js
exit 0: 179/179 passed

git diff --check
exit 0
```
