evidence-binding: n3-workflow-next-resolver 85c129701bff
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: glue/wiring — mechanical self-containment fix: prefixes the pre-existing `kaola_script`/`claim_script` resolver pattern (already used 3x elsewhere in these files) before an out-of-order `$CLAIM_JS`/`$claim_script` usage so the entry snippet is self-contained; no new behavior, no natural failing unit test — the route-reachability + contract-validator token pins are the standing guardrail this change must keep GREEN.
<!-- regression-green|build-green|smoke-integration -->
regression-green: full existing suite green before and after (route-reachability, workflow contracts × 3 forges, and the full walkthrough all pass unchanged pre/post-edit; only the 6 declared files touched)

## Task

Own #627's workflow-next self-containment fix (fix#4, workflow-next portion) in
bundle-623-627-628. `commands/workflow-next.md:91` used `$CLAIM_JS` before its
first assignment (~:277 in the pre-edit file), so the Step-0 "exactly one active
folder" bash snippet was not self-contained. Prefixed the standard
`kaola_script`-based resolver (already the established in-file pattern, reused
verbatim 3 times elsewhere in the canonical command file) directly before the
`STATUS_OUT=...` line so the snippet resolves `$CLAIM_JS` / `$claim_script`
locally. Mirrored on the 3 forge command surfaces (gitlab/gitea `$CLAIM_JS`,
forge-specific `kaola_script` script-name arg) and the 3 `kaola-workflow-next`
SKILL twins (codex-style `$claim_script` two-branch resolver: primary path +
`find $HOME/.codex/plugins/cache` fallback, per forge).

## Resolver-prefix applied per surface

1. **`commands/workflow-next.md`** (canonical, `$CLAIM_JS`) — inserted before the
   `STATUS_OUT="$(node "$CLAIM_JS" status ...)"` line (was ~:91, now shifted +2
   lines) the same 2-line `kaola_script(){...}` function definition +
   `CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"` assignment already used
   verbatim at the file's Step 0b block (originally ~:276-277).

2. **`plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`** (codex,
   `$claim_script`) — inserted before the `STATUS_OUT=...` line the 4-line
   direct-path + fallback-find resolver already used at the file's startup
   transaction block (originally ~:292-295):
   `claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"` +
   `if [ ! -f "$claim_script" ]; then claim_script="$(find "$HOME/.codex/plugins/cache" ...)"; fi`.

3. **`plugins/kaola-workflow-gitlab/commands/workflow-next.md`** (`$CLAIM_JS`) —
   inserted before `STATUS_OUT=...` the gitlab-specific `kaola_script(){...}`
   function (scoped to `plugins/kaola-workflow-gitlab/scripts/`) +
   `CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"`, matching the
   file's own Step 0b block (originally ~:265-266).

4. **`plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`**
   (`$claim_script`) — inserted the gitlab-specific direct-path + fallback-find
   resolver (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`,
   `find ... kaola-workflow-gitlab ...`), matching the file's own startup block
   (originally ~:298-301).

5. **`plugins/kaola-workflow-gitea/commands/workflow-next.md`** (`$CLAIM_JS`) —
   inserted the gitea-specific `kaola_script(){...}` function (scoped to
   `plugins/kaola-workflow-gitea/scripts/`) + `CLAIM_JS="$(kaola_script
   kaola-gitea-workflow-claim.js)"`, matching the file's own Step 0b block
   (originally ~:265-266).

6. **`plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`**
   (`$claim_script`) — inserted the gitea-specific direct-path + fallback-find
   resolver (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`,
   `find ... kaola-workflow-gitea ...`), matching the file's own startup block
   (originally ~:296-299).

No other prose was touched on any of the 6 surfaces (surgical one-block insert
per file).

## Pin-survival confirmation

Grepped all 6 post-edit files for both HARD-constraint pins:

- **T7** (`<!-- PIN: claim-escalate -->` + `result: escalate`) — present on all 6
  surfaces, unmoved and untouched (the escalate branch text is verbatim; only
  the pin's line number shifted downward by the +2/+4 inserted lines above it in
  each file).
- **T4** (`workflow-plan.md exists -> kaola-workflow-plan-run` reconstruction rule
  + `auto-bundle` entry framing) — present on all 6 surfaces, unmoved and
  untouched.

## Provenance / scope check

- `git status --short` shows exactly the 6 declared files modified, nothing
  else.
- `git diff` on the 6 files, filtered to added lines, contains no `#NNN` /
  `D-NNN-NN` / `INV-NN` token (grep for `#[0-9]+`, `D-[0-9]+-[0-9]+`,
  `INV-[0-9]+` on added lines returned nothing) — PROVENANCE-CLEAN.
- The 3 forge command/SKILL pairs mirror the canonical fix modulo forge nouns
  (`$CLAIM_JS` vs `$claim_script`, `kaola-gitlab-workflow-claim.js` /
  `kaola-gitea-workflow-claim.js` script names, gitlab `watch-mr` vs gitea/github
  `watch-pr`) — semantically consistent, not byte-identical, as required.

## Verification commands (before / after)

Ran the full required verification suite twice: once against the pre-edit tree
(via `git stash` / `git stash pop` to snapshot a true before-state) and once
against the edited tree.

### Before (git-stashed, pre-edit)

```
node scripts/test-route-reachability.js
-> Route-reachability test passed (260 assertions). EXIT: 0

node scripts/validate-workflow-contracts.js
-> Workflow contract validation passed. EXIT: 0
```

### After (edited tree)

```
node scripts/test-route-reachability.js
-> Route-reachability test passed (260 assertions). EXIT: 0

node scripts/validate-workflow-contracts.js
-> Workflow contract validation passed. EXIT: 0

node scripts/validate-kaola-workflow-contracts.js
-> Kaola-Workflow Codex contract validation passed. EXIT: 0

node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
-> Kaola-Workflow GitLab contract validation passed. EXIT: 0

node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
-> Kaola-Workflow Gitea contract validation passed. EXIT: 0

node scripts/simulate-workflow-walkthrough.js
-> ... (all listed cases PASSED) ... Workflow walkthrough simulation passed. EXIT: 0
```

All checks green before and after; assertion counts unchanged (260
route-reachability assertions both times), confirming the resolver-prefix
insert did not alter any machine-pinned token or routing behavior.

## Write set (files actually changed)

- `commands/workflow-next.md`
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitea/commands/workflow-next.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`

No files outside the declared write set were modified.
