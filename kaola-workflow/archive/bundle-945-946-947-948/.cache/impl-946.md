# impl-946 — remove the 8 dead model-placeholder registrations from `install.sh`

**task**: Issue #946, owner-widened scope. Remove all 8 dead placeholder registrations from BOTH
coupled lists in `install.sh` (`model_for_placeholder()`'s `case` and `render_command_file()`'s
`placeholders` array), keeping the 3 live ones. Write set: exactly `install.sh`.

**verification tier**: `regression-green` — this is a behaviour-preserving removal of inert
registrations. The full existing suite set relevant to install rendering was green before AND after,
and an A/B sandbox install proves zero rendered bytes changed.

**files changed**: `install.sh` (only). Confirmed via `git status --porcelain`: the other modified
paths (`scripts/test-generate-routing-surfaces.js`, `scripts/test-opencode-edition.js`,
`scripts/test-route-reachability.js`) belong to concurrent agents and were not touched by me. No test
file was written or modified.

---

## The diff

`git diff -- install.sh` → `1 file changed, 4 insertions(+), 16 deletions(-)`.
The 16 deletions are exactly 8 `case` arms + 8 array entries; the 4 insertions are the comment block
recording the coupling invariant.

```diff
@@ -533,18 +533,14 @@ resolve_agent_model_for_install() {
   printf '%s\n' "$model"
 }

+# Registered placeholders are exactly the ones some command surface actually spells. A name
+# here with no consumer is inert residue; a name a surface spells with no arm here is the #646
+# regression (empty model → line silently dropped, or a hard install error out of model= context).
+# Both lists below must carry the same names — add to and remove from them in the same edit.
 model_for_placeholder() {
   case "$1" in
-    CODE_EXPLORER_MODEL) resolve_agent_model_for_install code-explorer ;;
-    KNOWLEDGE_LOOKUP_MODEL) resolve_agent_model_for_install knowledge-lookup ;;
-    PLANNER_MODEL) resolve_agent_model_for_install planner ;;
-    CODE_ARCHITECT_MODEL) resolve_agent_model_for_install code-architect ;;
     TDD_GUIDE_MODEL) resolve_agent_model_for_install tdd-guide ;;
-    IMPLEMENTER_MODEL) resolve_agent_model_for_install implementer ;;
-    INVESTIGATOR_MODEL) resolve_agent_model_for_install investigator ;;
     BUILD_ERROR_RESOLVER_MODEL) resolve_agent_model_for_install build-error-resolver ;;
-    CODE_REVIEWER_MODEL) resolve_agent_model_for_install code-reviewer ;;
-    SECURITY_REVIEWER_MODEL) resolve_agent_model_for_install security-reviewer ;;
     DOC_UPDATER_MODEL) resolve_agent_model_for_install doc-updater ;;
   esac
 }
@@ -567,16 +563,8 @@ render_command_file() {
   local placeholders=(
-    CODE_EXPLORER_MODEL
-    KNOWLEDGE_LOOKUP_MODEL
-    PLANNER_MODEL
-    CODE_ARCHITECT_MODEL
     TDD_GUIDE_MODEL
-    IMPLEMENTER_MODEL
-    INVESTIGATOR_MODEL
     BUILD_ERROR_RESOLVER_MODEL
-    CODE_REVIEWER_MODEL
-    SECURITY_REVIEWER_MODEL
     DOC_UPDATER_MODEL
   )
```

Untouched per constraint: `resolve_agent_model_for_install`, `extract_agent_model`,
`REQUIRED_AGENTS`, every agent file, `scripts/kaola-workflow-resolve-agent-model.js` (verified
`git diff --stat` empty; `investigator: 'sonnet'` still at `:15`).

## Both-lists-agree confirmation

Extracted mechanically from the edited file, not by eye:

```
awk '/^model_for_placeholder\(\) \{/,/^\}/' install.sh | grep -oP '^\s+\K[A-Z_]+_MODEL' | sort
awk '/local placeholders=\(/,/^  \)/'      install.sh | grep -oP '^\s+\K[A-Z_]+_MODEL$' | sort
```

Both emit exactly, and identically:

```
BUILD_ERROR_RESOLVER_MODEL
DOC_UPDATER_MODEL
TDD_GUIDE_MODEL
```

`diff` of the two extractions → **rc=0**, count **3**. Neither list carries a name the other lacks,
so neither half of the #646 partial-land shape (`CHANGELOG.md:2245`) is present.

## Independent census (I re-measured rather than assuming the brief)

`git grep -lP "\{<NAME>\}"` for all 11 placeholders, excluding `install.sh`:

- Live product surfaces exist **only** for `TDD_GUIDE_MODEL` (22 files), `BUILD_ERROR_RESOLVER_MODEL`
  (24), `DOC_UPDATER_MODEL` (7) — including `templates/routing/finalize.skeleton.md`,
  `commands/kaola-workflow-finalize.md` and the gitlab/gitea plugin mirrors.
- The 8 removed names hit **zero product surfaces**. Every hit is an archived run record under
  `kaola-workflow/archive/**` (`CODE_EXPLORER_MODEL`, `CODE_ARCHITECT_MODEL`,
  `SECURITY_REVIEWER_MODEL` had zero hits anywhere outside `install.sh`).
- `model_for_placeholder` has exactly one call site: `install.sh:589`, inside the array loop.
  `git grep -lnP 'model_for_placeholder|placeholders=\(' -- scripts/ plugins/` → **no matches**, so
  no guard or generator reads these lists by name.
- `install.sh` is not duplicated: `git ls-files | grep -E '(^|/)install.*\.sh$'` → `install.sh`,
  `install-all.sh`, `install-kimi.sh`, `install-opencode.sh`, and none of the latter three carries a
  placeholder list.

**Additional finding (corroborates, changes nothing):** all 8 removed roles ship with
`model: inherit` in their agent frontmatter. `resolve_agent_model_for_install` returns empty for
`inherit`, so had any surface ever spelled one of these 8, `render_command_file` would have either
silently dropped the line (`model="{X}"` context, `install.sh:590-594`) or exited 1
(`install.sh:596-599`). These registrations were dead twice over — no consumer, and no usable value
if one had appeared.

## Sandbox install evidence (real exit codes; real `$HOME` never touched, no `--global`)

Sandbox homes under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad/impl946/`.

| leg | command | rc |
|---|---|---|
| BEFORE (pristine tree) | `HOME=<scratch>/home-before bash install.sh --yes --forge=github --no-settings-merge` | **0** |
| AFTER (modified tree) | `HOME=<scratch>/home-after bash install.sh --yes --forge=github --no-settings-merge` | **0** |

39 installed files on each leg.

`bash -n install.sh` → **rc=0** (run both before and after the edit).

### A/B: zero rendered bytes changed

SHA-256 of every installed file, filename-normalised, before vs after: **36 of 39 byte-identical
raw**. The 3 that differ are install-run nondeterminism, not rendering — each inspected individually:

- `.claude.json` — differs only in `firstStartTime` and `machineID`.
- `.claude/backups/.claude.json.backup.<epoch-ms>` — filename carries the install epoch-ms; content
  differs only in `firstStartTime`.
- `.claude/kaola-workflow/hooks/hooks.json` — embeds the sandbox `$HOME` path; **identical after
  path-normalisation** (`diff` rc=0).

No `commands/`, `agents/` or any rendered surface differs. This independently reproduces the A/B
result the brief cited.

Method note: an initial backup-file comparison silently did not run — zsh's `*` does not match
dotfiles and the glob aborted the command while the `&& echo` still printed. Redone with `find`;
the result above is from the working run.

### Zero unsubstituted placeholders in the installed tree

```
grep -rEo '\{[A-Z_]+_MODEL\}' <sandbox>/.claude/{commands,agents}
```
→ **zero matches**. (`<sandbox>/.claude/skills` does not exist for the github Claude install; `ls`
confirmed, so the scan covered every directory that exists.)

Positive control — the same pattern over the source tree returns the expected 6 hits, so the scan is
capable of finding a match:

```
commands/kaola-workflow-finalize.md:{BUILD_ERROR_RESOLVER_MODEL}
commands/kaola-workflow-finalize.md:{DOC_UPDATER_MODEL}
commands/kaola-workflow-finalize.md:{TDD_GUIDE_MODEL}
templates/routing/finalize.skeleton.md:{BUILD_ERROR_RESOLVER_MODEL}
templates/routing/finalize.skeleton.md:{DOC_UPDATER_MODEL}
templates/routing/finalize.skeleton.md:{TDD_GUIDE_MODEL}
```

### The 3 live placeholders still substitute to concrete models

`<sandbox>/.claude/commands/kaola-workflow-finalize.md`:

```
 87:  model="sonnet",     ← tdd-guide
 96:  model="opus",       ← build-error-resolver
155:  model="sonnet",     ← doc-updater
```

Exactly the expected models at exactly the expected lines.

### The 8 de-registered roles still ship

All present in `<sandbox>/.claude/agents/`, each with `model: inherit`: `code-explorer`,
`knowledge-lookup`, `planner`, `code-architect`, `implementer`, `investigator`, `code-reviewer`,
`security-reviewer`. No role was retired.

## Suite results

**before** (pristine tree):

| suite | rc | last line |
|---|---|---|
| `node scripts/test-install-model-rendering.js` | **0** | `Install model rendering tests passed` |
| `node scripts/validate-workflow-contracts.js` | **0** | `Workflow contract validation passed` |

**after** (modified tree):

| suite | rc | last line |
|---|---|---|
| `node scripts/test-install-model-rendering.js` | **0** | `Install model rendering tests passed` |
| `node scripts/validate-workflow-contracts.js` | **0** | `Workflow contract validation passed` |
| `node scripts/test-install-adaptive-config.js` | **0** | `Install adaptive-config tests passed` |
| `node scripts/test-install-upgrade-rewrite.js` | **0** | `Install upgrade rewrite tests passed` |
| `node scripts/test-install-manifest-single-source.js` | **0** | `... (#407/#412): PASSED` |
| `node scripts/validate-script-sync.js` | **0** | `committed kernel parity: 4 Oracle Kernel copies identical at HEAD.` |
| `node scripts/validate-vendored-agents.js` | **0** | `Vendored agent validation passed for 14 agents` |

The last five are the other install-reading suites, run because `install.sh` feeds them; the brief
required only the first two. Exit codes captured directly (`echo rc=$?` on the node invocation), never
through a pipe. **No unexpected failure occurred, so no serial re-run was needed.**

## Not done / out of scope

- No test file authored or modified — custody respected.
- `CHANGELOG.md` and any doc surface for this user-visible removal are left to the orchestrator;
  my write set was exactly `install.sh`.
