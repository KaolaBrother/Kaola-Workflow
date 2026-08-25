# Issue #1029 implementation evidence

## Assignment

Land the settled main-authored handoff guidance once in the canonical routing source, render it
through both dispatch-capable topics, and preserve byte identity across the derived runtime/forge
surface universe. Production ownership was limited to `templates/routing/slots.js`,
`templates/routing/next.skeleton.md`, `templates/routing/finalize.skeleton.md`, and the 12 tracked
next/finalize renders produced by `scripts/generate-routing-surfaces.js`.

## Baseline

- Candidate worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029`
- Baseline SHA: `89d171ef71c65b5d8841e98c9b48f7e52b10a41a`
- Before production edits, the only worktree diff was the test-owned
  `templates/routing/required-blocks.js` manifest addition.

Commands run before production edits:

```text
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit 0

$ node scripts/test-route-reachability.js
Route-reachability test FAILED: 85 failure(s), 556 passed.
exit 1
```

The RED was the expected absence of the two new manifest blocks on the 42 derived next/finalize
runtime/forge surfaces; no test-owned file was edited.

## Authored source

`templates/routing/slots.js` now defines `SLOTS['main-authored-handoff']` exactly once as a plain
string. Its 3,043 bytes compare equal to the frozen source
`/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/issue-1029/.cache/handoff-wording.md`
(the frozen file's terminal newline is not part of the slot value):

```text
slot_type=string
slot_bytes=3043 expected_bytes=3043
slot_equal_frozen=true
```

The complete PIN block, including both delimiters, is therefore authored only in `slots.js`; each
skeleton contains only one `<!-- SLOT:main-authored-handoff -->` reference. The references are
unconditional and outside all `REGION` directives. They precede the command-only model-routing
region because the existing additive renderers replace that region through the next Markdown
heading; placing a marker-first slot after it would drop the opening marker from additive renders.

The four duplicated reviewer scope/acceptance sentence occurrences were removed from the two
skeletons. The reviewer heavy-tier carveout remains, including the approved `fable` profile line,
and the shared block retains the reviewer-specific candidate, dispatched-surface, and acceptance
guidance.

## Generated paths

`node scripts/generate-routing-surfaces.js --write` was the only generator used. It rendered 18
registered surfaces and changed exactly these 12 tracked next/finalize files:

- `commands/workflow-next.md`
- `commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow-gitea/commands/workflow-next.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`

The generator also refreshed already-present ignored additive trees as part of its existing
`--write` behavior. No additive tree is a tracked candidate diff or a hand-edited source.

## Focused verification

```text
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit 0

$ node scripts/test-generate-routing-surfaces.js
test-generate-routing-surfaces: all 434 assertions passed.
exit 0

$ git diff --check
exit 0
```

Independent in-memory parity over the shipped derived universe used the canonical command rows and
the five existing additive renderers (opencode, Kimi, Grok, Cursor, and ZCode), plus the tracked
Claude command and Codex skill rows:

```text
records=42 expected=42
slot_bytes=3043 block_hashes=c9b7a552b236db0badd35fa79eb134f2eaad46a2d43ec98adca08fc25b4813fc
parity_failures=0
exit 0
```

Every extracted block had exactly one opening marker, a closing marker, and the same bytes as the
canonical slot. This proves the required 7 runtimes x 3 forges x 2 topics surface count without
requiring generated additive trees to exist in the candidate worktree.

## Route-oracle result and stop finding

The required focused command remains RED, and it cannot become green without changing the
test-owned files, which were explicitly read-only:

```text
$ node scripts/test-route-reachability.js
FAIL: T20 Claude contract: commands/workflow-next.md must require each reviewer dispatch to state the dispatched surface under review and what acceptance looks like
FAIL: T20 Claude contract: commands/kaola-workflow-finalize.md must require each reviewer dispatch to state the dispatched surface under review and what acceptance looks like
FAIL: MANIFEST orphan-surface: marker "<!-- PIN: main-authored-handoff -->" on ...workflow-next... not obligated by block fn-main-authored-handoff
...
Route-reachability test FAILED: 24 failure(s), 554 passed.
exit 1
```

There are two independent stale-oracle contradictions:

1. T20 still requires the exact reviewer-only sentence that the settled contract makes redundant.
   The production block preserves the reviewer-specific scope/acceptance meaning and the heavy-tier
   carveout, but the old duplicate sentence is intentionally absent.
2. The test-owned manifest declares `nx-main-authored-handoff` and `fn-main-authored-handoff` with
   the same marker. Its reverse orphan sentinel maps that marker to only the later finalize entry,
   so every valid next marker is falsely reported as an orphan. Existing consent handling shows that
   the marker must be treated as a foreign/shared marker or otherwise handled per topic in the test.

No production change can resolve either failure while retaining the frozen block, the next/finalize
scope, and test custody. The test author must repair the oracle before a `tests-green` verdict can be
recorded.

## Changed paths and exclusions

Actual candidate diff paths after regeneration:

```text
commands/kaola-workflow-finalize.md
commands/workflow-next.md
plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
plugins/kaola-workflow-gitea/commands/workflow-next.md
plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
plugins/kaola-workflow-gitlab/commands/workflow-next.md
plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
templates/routing/finalize.skeleton.md
templates/routing/next.skeleton.md
templates/routing/required-blocks.js
templates/routing/slots.js
```

`templates/routing/required-blocks.js` is the pre-existing test-owned diff; I did not edit it.
`scripts/test-route-reachability.js` is unchanged. `templates/routing/init.skeleton.md` and all
init surfaces are unchanged. No role profiles, mission-list schema, workflow state, claim/finalize
scripts, model/tier selection, repository docs, issue/PR state, commits, pushes, or installs were
changed.

## Verification tier

`tests-green` — not achieved because the read-only route oracle is contradictory as recorded above.
The canonical generator, generator test, diff check, and independent 42-surface byte-parity check
are green. Production changes and the full evidence record landed in this issue worktree and at:

`/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/issue-1029/.cache/implementation.md`
