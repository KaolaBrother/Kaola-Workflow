# Item 4 (issue #935 / A5) — delete `install.sh`'s `default_agent_model()` fallback

**Outcome: DELETED.** The fallback is dead, its deletion is behaviour-preserving for all 14 roles,
and the guard that keeps it dead is armed for vendored roles as well as local ones.

- **verification tier**: `regression-green`
- **file changed**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-935/install.sh` (only)
- **not committed**, per brief.

---

## 1. The change

`git diff -- install.sh` in `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-935`:

```diff
diff --git a/install.sh b/install.sh
index 7cef83d0..b01368d4 100755
--- a/install.sh
+++ b/install.sh
@@ -503,20 +503,6 @@ install_agent_files() {

 install_agent_files

-default_agent_model() {
-  case "$1" in
-    code-explorer|knowledge-lookup|code-architect|tdd-guide|implementer|investigator|build-error-resolver|code-reviewer|security-reviewer|adversarial-verifier)
-      printf '%s\n' "sonnet"
-      ;;
-    planner)
-      printf '%s\n' "opus"
-      ;;
-    doc-updater)
-      printf '%s\n' "sonnet"
-      ;;
-  esac
-}
-
 extract_agent_model() {
   local agent_file="$1"
   [[ -f "$agent_file" ]] || return 0
@@ -535,13 +521,12 @@ extract_agent_model() {
   ' "$agent_file"
 }

+# The source agent frontmatter is the ONLY model authority for the install. An `inherit`
+# value resolves to empty on purpose: render_command_file drops the whole model= line for it.
 resolve_agent_model_for_install() {
   local agent="$1"
   local model
   model="$(extract_agent_model "$(agent_source_file "$agent")")"
-  if [[ -z "$model" ]]; then
-    model="$(default_agent_model "$agent")"
-  fi
   if [[ "$(printf '%s' "$model" | tr '[:upper:]' '[:lower:]')" == "inherit" ]]; then
     return 0
   fi
```

`inherit` handling is untouched and still first-in-line after extraction. The empty case now falls
straight through to `printf '%s\n' ""`, which the `$(...)` caller collapses to the empty string —
**bit-identical to the pre-change behaviour for the two roles the fallback's `case` never covered**
(`metric-optimizer`, `synthesizer`), which fell off the `case` and returned empty anyway.

Residual references: `grep -n default_agent_model install.sh` → exit 1 (no matches). The only other
occurrences repo-wide are in `kaola-workflow/ROADMAP.md` (the issue text) and archived `.cache/`
notes from issues #153 / #328 — no live code.

## 2. Premise re-verification (all three claims in the brief HELD)

| claim | verdict | evidence |
|---|---|---|
| sole call site at `:543` inside `resolve_agent_model_for_install` | HELD | `grep -n` found exactly `506` (def) and `543` (call) |
| stale: 12 of 14 roles, and disagrees on 3 | HELD | `case` lists 12; `metric-optimizer`/`synthesizer` absent. Fallback says `sonnet` for `code-architect`/`code-reviewer`/`security-reviewer`; `DEFAULT_AGENT_MODELS` (14 entries) says `opus` |
| the `model:` guard is NOT in `validate-vendored-agents.js` | HELD | the `/^model:\s*\S+/m` assert is `scripts/validate-vendored-agents.js:99`, inside the `localAgents` loop opened at `:92`. `localAgents` = 8 roles (`:28-37`); `vendoredAgents` = 6 roles incl. `build-error-resolver` (`:11-18`); the vendored loop `:69-87` asserts provenance + `name:` only — **never `model:`** |

Additional measured fact that matters for forge coverage: `SOURCE_AGENTS_DIR="$SCRIPT_DIR/agents"`
(`install.sh:37`) is set **unconditionally**, outside the per-forge branch at `:94-107`. All three
forges read the same `agents/` tree, so one guard over `agents/*.md` covers every forge.

## 3. Step 2 — mutation proof of the guard (3 legs + 1 control)

Mirror built with `git archive HEAD | tar -x` (HEAD = `254e667f`) into
`…/scratchpad/mirror-base`, then copied per leg. **HEAD, not the working tree** — another agent is
concurrently editing `agents/build-error-resolver.md`, which is leg 2's exact fixture. No tracked
file was mutated.

Command in every leg: `node scripts/test-agent-model-resolver.js` (run from the mirror root).

### Leg 3 — baseline, unmutated mirror
```
Agent model resolver tests passed
LEG3_EXIT=0
```

### Leg 1 — positive control, LOCAL role: `model:` line deleted from `agents/investigator.md`
```
LEG1_EXIT=1
```
Exact assertion text:
```
AssertionError [ERR_ASSERTION]: investigator source frontmatter (none) must equal its
DEFAULT_AGENT_MODELS tier (sonnet) — installed agents resolve through the default map alone, so a
divergence silently re-tiers the role

'' !== 'sonnet'

    at Object.<anonymous> (…/mirror-leg1/scripts/test-agent-model-resolver.js:91:10)
  actual: '', expected: 'sonnet', operator: 'strictEqual'
```

### Leg 2 — DECISIVE, VENDORED role: `model:` line deleted from `agents/build-error-resolver.md`
```
LEG2_EXIT=1
```
Exact assertion text:
```
AssertionError [ERR_ASSERTION]: build-error-resolver source frontmatter (none) must equal its
DEFAULT_AGENT_MODELS tier (sonnet) — installed agents resolve through the default map alone, so a
divergence silently re-tiers the role

'' !== 'sonnet'

    at Object.<anonymous> (…/mirror-leg2/scripts/test-agent-model-resolver.js:91:10)
```
The guard at `scripts/test-agent-model-resolver.js:87-94` iterates `DEFAULT_AGENT_MODELS`, which has
**14** entries — it is total over the roster, not over the 8 local roles.

### Extra control (not requested, and it sharpens leg 2)
On the **same** leg-2 mutant, the validator the brief warned against consulting:
```
node scripts/validate-vendored-agents.js
Vendored agent validation passed for 14 agents at 922d2d8f…
VENDORED_VALIDATOR_EXIT=0
```
So `validate-vendored-agents.js` is demonstrably **blind** to a missing `model:` on a vendored role.
`test-agent-model-resolver.js` is the sole guard, and it is armed.

### Negative control — is the fallback load-bearing in the state the guard forbids?
Yes, which is why the deletion's safety rests entirely on the guard above. With `model:` deleted from
`agents/investigator.md` (a role that IS a rendered command placeholder):

| tree | `resolve_agent_model_for_install investigator` |
|---|---|
| fallback present (HEAD) | `[sonnet]` |
| fallback deleted (mine) | `[]` |

Worth recording for the reviewer: in that forbidden state the **old** code was not "safe", it was
differently wrong — for `code-architect` / `code-reviewer` / `security-reviewer` it would have
silently installed `sonnet` where the canonical map says `opus`. Post-deletion the same state instead
drops the `model=` line (install still exits 0). Both are defects; the guard is what prevents both.

## 4. Step 3 — the installer still resolves every role, shown by execution

Two trees built from the same `git archive HEAD`, differing **only** in `install.sh`
(`diff -rq` reported exactly one differing path): `step3-before` (HEAD) and `step3-after` (HEAD +
my `install.sh`).

### 4a. Full install, all three forges, exit codes
`bash install.sh --yes --forge=<forge> --no-settings-merge` with `HOME` redirected to a scratch dir:

```
INSTALL before/github EXIT=0    INSTALL after/github EXIT=0
INSTALL before/gitlab EXIT=0    INSTALL after/gitlab EXIT=0
INSTALL before/gitea  EXIT=0    INSTALL after/gitea  EXIT=0
```
No leftover `{*_MODEL}` placeholders in any installed command, any forge.

### 4b. Installed-tree byte comparison (same HOME path both runs, `.claude/backups` excluded)
sha256 manifest of every installed file, before vs after:

| forge | installed files | differing paths |
|---|---|---|
| github | 38 | `./.claude.json` only |
| gitlab | 40 | `./.claude.json` only |
| gitea | 40 | `./.claude.json` only |

Everything under `.claude/` — all commands, all 14 agents, the agent manifest, scripts, hooks — is
**byte-identical**. `.claude.json` differs only in two nondeterministic fields written by the
`claude` CLI, not by install.sh:
```
< "firstStartTime": "2026-08-10T08:16:46.799Z"      < "machineID": "38022f78…"
> "firstStartTime": "2026-08-10T08:16:47.579Z"      > "machineID": "493817ea…"
```
`grep -c model .claude.json` → `0`. It carries no tier.

### 4c. Per-role execution of the SHIPPING function, all 14 roles
`install.sh` ends with no `exit`, so `. ./install.sh --yes --forge=github --no-settings-merge`
performs a real install and leaves its own functions defined. The bytes executed are the shipping
file's, not a copy. Iterating `"${REQUIRED_AGENTS[@]}"` (the installer's own 14-role array):

```
                          BEFORE                AFTER
default_agent_model defined?  YES                  NO
code-explorer            -> [sonnet]           [sonnet]
knowledge-lookup         -> [sonnet]           [sonnet]
planner                  -> [opus]             [opus]
code-architect           -> [opus]             [opus]
tdd-guide                -> [sonnet]           [sonnet]
implementer              -> [sonnet]           [sonnet]
investigator             -> [sonnet]           [sonnet]
build-error-resolver     -> [sonnet]           [sonnet]
code-reviewer            -> [opus]             [opus]
security-reviewer        -> [opus]             [opus]
doc-updater              -> [sonnet]           [sonnet]
adversarial-verifier     -> [sonnet]           [sonnet]
synthesizer              -> [opus]             [opus]
metric-optimizer         -> [sonnet]           [sonnet]
```
`diff` of the two role tables: **exit 0 — all 14 identical**, none empty, and every value equals
`DEFAULT_AGENT_MODELS`. Note the before-column is itself proof the fallback never fired:
`code-architect`/`code-reviewer`/`security-reviewer` resolved `opus`, which the fallback could not
have produced.

(Scope note: `model_for_placeholder` (`install.sh:551-565`) exposes only **11** of the 14 roles as
command placeholders — `adversarial-verifier`, `synthesizer` and `metric-optimizer` have none. The
enumeration above deliberately covers all 14 rather than only the 11 that render.)

## 5. Step 4 — syntax check

```
bash -n install.sh                             EXIT=0
bash -n install.sh uninstall.sh install-all.sh EXIT=0
```

## 6. Regression suites — before and after, on trees differing only in `install.sh`

Coverage set derived by `grep -ln install\.sh scripts/test-*.js scripts/validate-*.js`, then
re-checked for indirect references (`installScript` / `INSTALL_SCRIPT` → only
`validate-vendored-agents.js`, already included).

| suite | before | after |
|---|---|---|
| `bash -n install.sh uninstall.sh install-all.sh` | 0 | 0 |
| `validate-vendored-agents.js` | 0 | 0 |
| `test-agent-model-resolver.js` | 0 | 0 |
| `test-install-model-rendering.js` | 0 | 0 |
| `test-install-all.js` | 0 | 0 |
| `test-install-manifest-single-source.js` | 0 | 0 |
| `test-install-adaptive-config.js` | 0 | 0 |
| `test-install-upgrade-rewrite.js` | 0 | 0 |
| `test-uninstall-forge-branches.js` | 0 | 0 |
| `validate-script-sync.js` | 0 | 0 |
| `validate-workflow-contracts.js` | 0 | 0 |
| `test-opencode-edition.js` | 0 | 0 |

`test-install-model-rendering.js` is the one that matters most: it runs a real
`install.sh --yes --forge=github` into a synthetic HOME and asserts every role in its independently
derived `EXPECTED_ROLE_MODELS` table (`:3022-3036`, 13 roles) resolves to its pinned tier. Green
before and after.

## 7. Two RED suites in the live worktree — NOT mine

Run in the live worktree (which carries the concurrent agent's in-progress edits to
`agents/adversarial-verifier.md`, `agents/build-error-resolver.md`,
`scripts/generate-reviewer-profiles.js` and the four `kaola-workflow-resolve-agent-model.js` copies):

```
test-agent-model-resolver.js       EXIT=1
test-install-model-rendering.js    EXIT=1
(all other suites in the table above: EXIT=0)
```

Both are the expected intermediate state of items A1–A4 (`build-error-resolver` moving
`sonnet` → `opus`) with the test-custody item A8 not yet done:
- `test-agent-model-resolver.js:68` — `build-error-resolver Claude dispatch tier changed; the declared divergence says sonnet` / `'opus' !== 'sonnet'` — `CLASS_DIVERGENCE` still declares `claude: 'sonnet'`.
- `test-install-model-rendering.js:2945` — `finalize routed-fix build-error-resolver block should render as sonnet` — a pinned `model="sonnet"` expectation.

**Isolation control**: a scratch snapshot of the live worktree with **only `install.sh` reverted to
HEAD** (their edits kept, mine removed) reproduces both failures at the same files and the same line
numbers, with byte-identical assertion text (`diff` of the failure blocks: exit 0 for the resolver;
for the rendering suite the only delta is the path prefix, same `:2945:3`). The reds pre-exist my
change. They belong to the test author under custody — **I did not touch any test file.**

## 8. What I did not measure

- **`simulate-workflow-walkthrough.js` was NOT run.** Measured, not assumed: it contains **0**
  matches for `install.sh` / `install_agent` / `resolve_agent_model_for_install`, so it cannot
  observe this change. The bundle still needs a full-scope walkthrough for the *other* items.
- **No live-runtime spawn check** (issue item A10): I did not reinstall over the real `~/.claude`
  and did not read an effective model back from a live spawn. Every install here ran with `HOME`
  redirected to scratch; the user's real install is untouched (`~/.claude/agents` mtime still
  `8月 9 16:03`, a day before this session).
- **Four-chain receipt**: not run (out of scope for this item; the bundle touches every edition, so
  a claude-only receipt will not qualify).
- The A/B trees were built from `HEAD`, so these results certify *my `install.sh` change in
  isolation*. They do not certify the concurrent agent's edits.

## Scratch artifacts (session-local)

Under `…/bbc1c516-…/scratchpad/`: `mirror-base|leg1|leg2` (mutation legs), `step3-before|after`
(A/B trees), `manifest-*.txt` (installed-tree sha256 manifests), `roles-before|after.txt`
(14-role enumerations), `live-snapshot` (isolation control), `negctl-before|after`.
