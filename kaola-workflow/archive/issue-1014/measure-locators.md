# Measure locators — issue #1014 (current tree)

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1014`  
Branch: `workflow/issue-1014` at `3a289108917d6fa5b3e8df625d2edceba83710d9` (`chore: archive issue-1013 [sink]`). Same SHA as `main` / `origin/main`.

**Plan of record:** GitHub issue [#1014](https://github.com/KaolaBrother/Kaola-Workflow/issues/1014) comment `5380834329` (“Plan of record (supersedes the previous comment)”, 2026-08-22). Comments override the body. The later “started local work” comment does not change the plan.

This report quotes what is on disk **now**. It does not implement.

---

## 1. `templates/routing/next.skeleton.md`

### Does it have `## Agent Model Dispatch`?

**No.** The file has no `## Agent Model Dispatch` heading. Contrast: finalize’s skeleton **does** wrap that heading in `REGION:command`:

```42:50:templates/routing/finalize.skeleton.md
<!-- REGION:command — the `model="{...}"` placeholders are filled at install time for this surface; the skill surface has no placeholder to fill and resolves each role's model from its installed profile at spawn time -->
## Agent Model Dispatch

Every subagent dispatch below carries an explicit `model=` line — the installer fills each
`model="{...}"` placeholder from the agent's own installed profile. You MUST pass `model="{...}"`
in every Agent call exactly as shown; never omit the `model=` line on any dispatch.
```

Next’s early headings after Consent go straight to Step 1 (`## Step 1 — Pick the work` at line 37). There is no dispatch heading between Consent and Step 1.

### Is `## Delegation` a `REGION:skill` (Codex only)?

**Yes.** Open at 259, close at 270:

```259:270:templates/routing/next.skeleton.md
<!-- REGION:skill — it directs every spawn to the Codex Per-Spawn Model Routing contract above and to pass an explicit `model` and `reasoning_effort` pair on the call; that contract renders on this surface only, and command runtimes route each role's model from its installed profile with no per-spawn pair to pass -->
## Delegation

Subagent delegation is the default posture and is established without asking the user. Invoke the
installed role agents for delegated work. For every spawn, follow the Codex Per-Spawn Model Routing
contract above and pass both `model` and `reasoning_effort` explicitly on the spawn call as the pair
selected by the role's existing tier. Per-task model or reasoning-effort exceptions are not allowed.
If the runtime genuinely cannot spawn a role agent, do the work inline and say so — that is a fact
about tool availability, not a choice to present as a question. Profile drift is not tool
unavailability and must not be recorded as one.

<!-- /REGION -->
```

A second `REGION:skill` at the top of the same skeleton (lines 2–17) is the Codex `## Codex Per-Spawn Model Routing` pin. Command renders drop both skill regions.

### Any omit-model / do-not-substitute-`generalPurpose` teaching?

**Not on this skeleton.** Grep of `next.skeleton.md` finds no `generalPurpose`, no “omit model”, no “do not substitute”. The only spawn-model teaching is the Codex skill region above (explicit `model` **and** `reasoning_effort` on the spawn call). Command next therefore currently ships **no** Agent-Model-Dispatch teaching at all.

---

## 2. Canonical `commands/workflow-next.md` (github) and gitlab/gitea twins

Twins **exist**:

- `commands/workflow-next.md`
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md`
- `plugins/kaola-workflow-gitea/commands/workflow-next.md`

**`## Agent Model Dispatch` is absent** on all three. GitHub headings (gitlab matches; gitea same set, line numbers +2 after Step 2):

```27:27:commands/workflow-next.md
## Step 1 — Pick the work
```

…then Step 2–7, `## Co-active Folders`, `## Required output`, `## Completion contract`. No `## Delegation` (stripped with `REGION:skill`). No `generalPurpose` / omit-model text.

Finalize **does** carry the heading (`commands/kaola-workflow-finalize.md:29`).

---

## 3. `templates/routing/init.skeleton.md` — overlay sentence

The live sentence is still the “configured model / installed profile” bullet, inside the KW-CLAUDE-TEMPLATE region (template ends at line 221):

```171:171:templates/routing/init.skeleton.md
- Use the vendored agent role names exactly as installed; prefer short names like `planner`. When spawning a Kaola subagent, pass the role's configured model on the spawn call — each agent ships its model in its installed profile.
```

That exact wording is already rendered into:

- `commands/workflow-init.md:151`
- gitlab/gitea `commands/workflow-init.md:151`
- the three `kaola-workflow-init/SKILL.md` copies (`:106`)

Plan-of-record replacement (not on disk): spawn the type the installed next/finalize card names; follow that card for whether the call carries `model=`; do not substitute a generic built-in unless those instructions explicitly map the role.

`rewriteModelDispatchInstructions` in `scripts/sync-cursor-edition.js` only rewrites paragraphs that contain `model=` (`MODEL_MENTION = /model=/` at `:180`). This overlay sentence has no `model=` token, so Cursor sync **cannot** catch it.

---

## 4. `scripts/sync-cursor-edition.js`

### `CURSOR_MODEL_DISPATCH_BLOCK` current wording

```163:178:scripts/sync-cursor-edition.js
const CURSOR_MODEL_DISPATCH_GUIDANCE =
  'Use the named Cursor agent; generated frontmatter pins its canonical standard or reasoning tier '
  + 'to the approved model family at medium or high effort. Omit per-call model overrides; the '
  + 'one-family allowlist keeps dispatch cards portable while tier selection stays in generated agent metadata.';

const CURSOR_MODEL_DISPATCH_BLOCK = [
  '## Generated agent tier pins',
  '',
  'Named Cursor agents carry generated frontmatter that pins their canonical standard or reasoning',
  'tier at medium or high effort. The one-family allowlist keeps the dispatch surface portable',
  'while the canonical class selects the generated tier pin.',
  'Omit per-call model overrides from `Task`; the card only names the role.',
  '',
  'Dispatch a role with `Task` using `subagent_type: "<role>"`.',
  '',
].join('\n');
```

**Not in the block now:** omit `inherit`; “do not substitute `generalPurpose`”; catalog preflight / sentinel `.cursor/agents/implementer.md`; copy-from-git-toplevel-or-`CURSOR_HOME`; new-chat cold-start stop; `Invalid enum value` fail-closed.

### Which commands receive it? Is `workflow-next` among them? Heading vs `phaseCommands`?

**Heading substitution, not `phaseCommands`.** `phaseCommands` lives only in `validate-workflow-contracts.js` (see §8) and is unused by this generator.

Every canonical command for the forge is rendered:

```547:562:scripts/sync-cursor-edition.js
function writeCommands(forge) {
  let wrote = 0;
  for (const file of listCanonCommands(forge)) {
    const name = file.slice(0, -3);
    const canon = fs.readFileSync(canonCommandPath(file, forge), 'utf8');
    const out = renderCommand(canon, name, forge);
```

`listCanonCommands` = routing registry `commandSources(forge)` → `workflow-init.md`, `workflow-next.md`, `kaola-workflow-finalize.md` (topic order from `TOPICS` in `generate-routing-surfaces.js`). So **workflow-next is generated**, but `transformCommandBody` only **replaces** a `## Agent Model Dispatch` section:

```254:284:scripts/sync-cursor-edition.js
const MODEL_DISPATCH_HEADING = /^##\s+Agent Model Dispatch\s*$/;
// ...
    if (MODEL_DISPATCH_HEADING.test(line)) {
      // ...
      out.push(CURSOR_MODEL_DISPATCH_BLOCK.replace(/\s+$/, ''));
```

If the heading is missing, substitution is a no-op (`substitutedModelDispatch` stays false). `assertModelDispatchAnchorMatched` throws only on a **near-miss** (`## … Model …` that is not the exact heading), not on total absence. Therefore **finalize gets the block; next does not.**

`renderCommand` always runs `transformCommandBody` (`:310`), including `Agent(` → `Task(`, `stripCardModelPlaceholders`, and `rewriteModelDispatchInstructions` for leftover `model=` prose. Next has no Agent cards and no `model=` lines, so those passes leave next without a pins section.

### Catalog-preflight / cold-start / Invalid-enum fail-closed text?

**Absent** from `CURSOR_MODEL_DISPATCH_BLOCK`, from `transformCommandBody`, and from `install-cursor.sh`. No inject of a cursor-only preflight snippet.

---

## 5. Generated `.cursor/commands/workflow-next.md`

**Not in the git tree.** `.gitignore`:

```8:14:.gitignore
.cursor/
# ...
.cursor-*/
```

Glob under this worktree found **0** committed/fixture copies of `.cursor/commands/workflow-next.md`.

**How tests generate it:** `scripts/test-cursor-edition.js` self-provisions before assertions:

```243:261:scripts/test-cursor-edition.js
// Self-provision: regenerate .cursor/ from tracked canonical sources before any
// assertion that reads it.
// ...
  const r = runGenerator(['--write']);
```

That is `node scripts/sync-cursor-edition.js --write`, which writes gitignored `.cursor/` (and `.cursor-gitlab/` / `.cursor-gitea/` when those forges are exercised) at `TREE_ROOT` (coord/main-root aware, same as the installer). The suite then reads `commandRel('workflow-next')` for runtime stamps (`--runtime cursor`, `CURSOR_HOME`) and a **tree-wide** ban on `model="` (`G2-declaration`, `:525–528`). It does **not** require the pins heading on generated next.

---

## 6. `install-cursor.sh` — `--global`

### Writes `${CURSOR_HOME}/{agents,commands}`? Nested `.cursor/` under `CURSOR_HOME` (G8)?

Header and the live branch:

```22:24:install-cursor.sh
# DEPLOY LAYOUT (scope-dependent):
#   - PROJECT (--target/$PWD): agents and commands land under <project>/.cursor/{agents,commands}.
#   - GLOBAL (--global): they land DIRECTLY under ${CURSOR_HOME:-$HOME/.cursor}/{agents,commands}.
```

```430:442:install-cursor.sh
if [[ "$GLOBAL" -eq 1 ]]; then
  DEST_ROOT="$(cursor_home)"
  LAYOUT_DEST="$DEST_ROOT"
  echo "Deploying globally ($FORGE) → $DEST_ROOT"
else
  DEST_ROOT="${TARGET:-$PWD}"
  LAYOUT_DEST="$DEST_ROOT/.cursor"
  echo "Deploying into project ($FORGE) → $DEST_ROOT"
fi

confirm_install
copy_agents "$LAYOUT_DEST/agents"
copy_commands "$LAYOUT_DEST/commands"
```

`--global` → `LAYOUT_DEST=$CURSOR_HOME` (default `$HOME/.cursor`), so agents/commands are **un-nested**: `$CURSOR_HOME/agents`, `$CURSOR_HOME/commands`. Project path nests `.cursor/` under the target. G8’s “no nested `.cursor/` under `CURSOR_HOME`” matches this `--global` branch.

### `--global` from a git work tree — dual-write to `$(git rev-parse --show-toplevel)/.cursor/{agents,commands}`?

**No.** There is no `git rev-parse`, no second `copy_agents`/`copy_commands`, and no “Task types are workspace-scoped” print. `--global` from `$HOME` and from a git work tree take the same branch (`GLOBAL=1` → `LAYOUT_DEST=cursor_home` only).

---

## 7. `scripts/test-cursor-edition.js`

### Require canonical `workflow-next.md` to carry `## Agent Model Dispatch`?

**No.** There is no assertion that canonical next (or “at least one command”) carries that heading. Cursor suite has no opencode-style S2 `sectionCarriers` loop. Next-specific pins are G2 runtime rewrites (`--runtime cursor`, `CURSOR_HOME` at `:489–492`).

### Require generated cursor next to carry pins block / omit `model=` / forbid `generalPurpose`?

- **Pins block / `## Generated agent tier pins`:** not required on next (or on any named command).
- **Omit `model=`:** **tree-wide** on generated `.cursor/**` via `assert(!/\bmodel="/.test(content)` (`:525–528`). That is a negative on `model="` literals, not a positive “this file contains `CURSOR_MODEL_DISPATCH_BLOCK`”.
- **Forbid `generalPurpose` impersonation:** **no** such needle.
- Catalog-preflight sentinel / new-chat stop: **no**.
- Shared-block identity with finalize: **no**.

### G8 `--global` nesting and dual-write

G8-global (`:876–896`):

- `--global` exits 0
- `$CURSOR_HOME/agents/knowledge-lookup.md` un-nested
- commands under `$CURSOR_HOME/commands/`
- **`!exists($CURSOR_HOME/.cursor)`** — no nested `.cursor/` under `CURSOR_HOME`
- hooks.json merge + `./hooks/` rewrite

`runInstaller(['--global'], { skipTarget: true })` does **not** set `cwd` to a disposable git fixture; spawn inherits the suite process cwd (this repo). The installer still only writes `CURSOR_HOME`. **Dual-write to git toplevel `.cursor/agents/implementer.md` is not asserted** (neither presence nor absence). Catalog-copy-only-`listCanonAgents()` (stray `user-agent.md`) is not asserted.

G8-project **does** assert all `canonAgents` under `<target>/.cursor/agents/` (`:856–858`).

---

## 8. `scripts/validate-workflow-contracts.js` (and gitlab/gitea twins)

### What is `phaseCommands`? Is `workflow-next` in it?

```156:179:scripts/validate-workflow-contracts.js
const phaseCommands = [
  'commands/kaola-workflow-finalize.md'
];
// ...
for (const file of phaseCommands) {
  assert(exists(file), file + ' is missing');
  assertIncludes(file, 'workflow-state.md');
  assertIncludes(file, '## Agent Model Dispatch');
  assertIncludes(file, 'You MUST pass `model=');
  assertIncludes(file, 'model="{');
  assertEveryDispatchHasModel(file);
```

**`workflow-next` is not in `phaseCommands`.** The list is finalize-only. Folding next into it would demand `model="{` placeholders and `You MUST pass \`model=` — which next does not have (plan of record: do **not** add next here).

### Overlay assertions about the “configured model” sentence?

**None.** The KW-CLAUDE-TEMPLATE sweep (`:454–484`) pins mission-list vocabulary and bans retired DAG-executor tokens. It does **not** assert presence/absence of “configured model” / “ships its model in its installed profile”.

### Any next heading pin?

**No `## Agent Model Dispatch` pin on next.** Next pins (`:207–214`, `:224+`) cover existence, `watch-pr`, `## Co-active Folders`, retired vocab, and the six-surface router contract (selection, mission list, etc.). Heading / `You MUST pass \`model=` / `model="{` **absent** is not checked.

### Gitlab / gitea twins

They do **not** define `phaseCommands`. Equivalent heading loop is **basename prefix `kaola-workflow-`**, which matches **finalize only**, not `workflow-next.md`:

```203:207:plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
for (const file of commandFiles.filter(file => path.basename(file).startsWith('kaola-workflow-'))) {
  assertIncludes(file, '## Agent Model Dispatch');
  assertIncludes(file, 'You MUST pass `model=');
  assertIncludes(file, 'model="{');
```

(Gitea: same at `:202–206`.) Overlay: gitlab extracts KW-CLAUDE-TEMPLATE for **byte-identity** of command vs skill (`:335–339`), not the configured-model sentence. No next heading pin on the twins.

---

## 9. `scripts/test-route-reachability.js` T19 conflict needles

`hasProfileOwnedDispatchConflict` (`:106–114`) — phrases (regex, not literals):

1. `pass` … `configured model` (`/pass\b.{0,100}\bconfigured model\b/i`)
2. `ships its model in its installed profile` (`/ships its model in its installed profile/i`)
3. `profile` … `owns` … `model`
4. `inherit*` … `model` … `profile`
5. `(model|reasoning effort)` … `(inherited from|owned by|read from)` … `profile`

Call-site mutations that must **red** a Codex next/finalize skill (`:596–605`):

- `"Pass the role's configured model on the spawn call."`
- `"Inherit the model from the role's installed profile."`

Universe: Codex skills `kaola-workflow-next` and `kaola-workflow-finalize` only (`:408–411`). Init’s KW-CLAUDE-TEMPLATE is stripped before dispatch-universe detection (`:421–422`), so the overlay sentence in init does **not** put init in T19’s dispatch set.

`codexDispatchCallSite` for next is the `## Delegation` section (`:117–119`).

### Confirm needles are not on the **command** next surface; they live on Codex skills

- Canonical **command** `commands/workflow-next.md`: no “configured model”, no Delegation section.
- Codex **skill** `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:269` has `## Delegation` and instructs passing `` `model` `` and `` `reasoning_effort` `` explicitly — **not** the T19 conflict phrases. Conflict needles are the *forbidden* profile-owned wording; current skill Delegation is the allowed Codex pair.

The **init overlay** (`pass the role's configured model` / `ships its model in its installed profile`) **is** needle (1)+(2), but it lives in KW-CLAUDE-TEMPLATE (stripped for T19 universe / not on next command). Plan: keep T19 needles; do not put those phrases on Codex skills; rewrite overlay in the template region.

---

## 10. `docs/cursor-edition.md` and README Cursor `--global` vs project `.cursor/agents`

### `docs/cursor-edition.md`

Install-all note (`:112–117`): `install-all.sh` invokes this installer **`--global` by default**.

Project vs global (`:132–140`):

- PROJECT: `<project>/.cursor/{agents,commands}`
- GLOBAL: `${CURSOR_HOME:-$HOME/.cursor}/{agents,commands}` with **no** nested `.cursor/` directory

The doc does **not** say Task `subagent_type` loads from workspace `.cursor/agents` rather than `~/.cursor/agents`. It does **not** say `--global` / install-all default is **not** dispatch-capable by itself. Cold start **is** declared (`:85–86`: new chat after install; mid-session edit inconclusive). Agents are described as generated `.cursor/agents/` Task types (`:7`, table `:52`) without the catalog-load split measured in Probe A/B.

### README

Cursor additive blurb (`:254`): named roles as `.cursor/agents/*.md` (`Task` types); Task cards omit per-call `model`.

Install-all (`:240`): defaults `--forge=github`, **`--global`**.

Cursor subsection (`:401–407`):

```
./install-cursor.sh --global --yes   # deploy agents+commands into ${CURSOR_HOME:-~/.cursor}
./install-cursor.sh --yes            # deploy into the current project (.cursor/{agents,commands})
```

Same fact as the docs: two layouts, no statement that only **project** `.cursor/agents` populates the Task enum.

---

## 11. `scripts/generate-routing-surfaces.js` — `REGION:command` vs `REGION:skill` for next

Renderer (`:214–224`): on `<!-- REGION:cond -->`, keep the body iff `condMatches(cond, ctx)` where tags are `surface_type` (`command`|`skill`) and/or `forge`. Else drop the whole region.

Next topic (`:80–85`): skeleton `next.skeleton.md`; command basename `workflow-next`; skill basename `kaola-workflow-next`. Eighteen surfaces (3 forges × command+skill × 3 topics).

**What next gets today:**

| Context | `REGION:skill` (Codex routing + `## Delegation`) | `REGION:command` (nested-command continue, `:283–287`) | `## Agent Model Dispatch` |
|---|---|---|---|
| Claude command (github/gitlab/gitea) | stripped | kept | **absent** (not in skeleton) |
| Codex skill (3 forges) | kept | stripped | **absent** |

**If** the plan’s `REGION:command` `## Agent Model Dispatch` is added (after Consent, before Step 1):

- **Claude commands** (all three forges): heading + Claude free-form body ship after `--write`.
- **Codex skills:** that region stripped; existing `## Delegation` + Codex pair unchanged.
- **Cursor / Grok / opencode / Kimi:** they do **not** read the skeleton; they transform **canonical command** markdown. After generate, next would **carry the heading**, so Cursor substitutes `CURSOR_MODEL_DISPATCH_BLOCK`, Grok substitutes `GROK_MODEL_DISPATCH_BLOCK`, opencode S2 inherited-effort block, Kimi strips the section (K2-anchor treats it as a carrier that must not retain Claude’s section).

---

## 12. `listCanonAgents()` — location and names

**Cursor generator (catalog-copy-only-canon source of truth for this issue):**

```93:97:scripts/sync-cursor-edition.js
function listCanonAgents() {
  return fs.readdirSync(CANON_AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3));
}
```

`CANON_AGENTS_DIR = path.join(REPO, 'agents')` (`:45`). Exported on `module.exports` (`:772`). **Unsorted** (readdir order). No subdirectory walk; top-level `*.md` only.

Same helper exists independently in `sync-opencode-edition.js:178`, `sync-kimi-edition.js:133` (comment: “Top-level agents/*.md only”), `sync-grok-edition.js:93`.

`test-cursor-edition.js` does **not** call `listCanonAgents`; it uses a local `trackedAgents()` that **sorts** (`:118–119`).

**Names on disk now** (14 files under `agents/`, sorted for the report; `listCanonAgents()` itself does not sort):

`adversarial-verifier`, `build-error-resolver`, `code-architect`, `code-explorer`, `code-reviewer`, `doc-updater`, `implementer`, `investigator`, `knowledge-lookup`, `metric-optimizer`, `planner`, `security-reviewer`, `synthesizer`, `tdd-guide`

---

## Implementer file inventory (likely touch set)

From plan Layer 4 (implementer does not author tests). Current purpose of each:

| File | Purpose now |
|------|-------------|
| `templates/routing/next.skeleton.md` | Next command/skill union; Delegation is skill-only; no Agent Model Dispatch |
| `templates/routing/init.skeleton.md` | Init union; KW-CLAUDE-TEMPLATE still teaches “configured model” on spawn |
| `scripts/generate-routing-surfaces.js` | Render engine; run `--write` after skeleton edits (18 surfaces). Logic change not required unless REGION/cond bugs appear |
| `commands/workflow-next.md` | Generated github next command; no dispatch heading |
| `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | Gitlab twin |
| `plugins/kaola-workflow-gitea/commands/workflow-next.md` | Gitea twin |
| `commands/workflow-init.md` | Generated github init; overlay bullet at `:151` |
| `plugins/kaola-workflow-gitlab/commands/workflow-init.md` | Gitlab init overlay |
| `plugins/kaola-workflow-gitea/commands/workflow-init.md` | Gitea init overlay |
| `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` | Codex init skill; same overlay in template (`:106`) |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md` | Gitlab Codex init skill |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md` | Gitea Codex init skill |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Codex next; Delegation + routing pin; should **not** gain the command heading |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | Gitlab Codex next |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | Gitea Codex next |
| `scripts/sync-cursor-edition.js` | Cursor transform; weak `CURSOR_MODEL_DISPATCH_BLOCK`; heading-gated; no preflight inject |
| `install-cursor.sh` | `--global` → `CURSOR_HOME/{agents,commands}` only; no git-toplevel dual-write |
| `docs/cursor-edition.md` | Documents global vs project layout; does not state Task catalog = workspace `.cursor/agents` |
| `README.md` | install-all `--global` default; Cursor install examples |
| `CHANGELOG.md` | `[Unreleased]` user-visible notes |

Out of scope (plan): restamping `agents/*.md` frontmatter; `Task(model=)`; `scripts/kaola-workflow-claim.js`; Grok #1015; committing `.cursor/`.

**tdd-guide (not implementer):** `scripts/test-cursor-edition.js`, `scripts/validate-workflow-contracts.js`, gitlab/gitea contract validators if overlay/next pins are shared, `scripts/test-route-reachability.js` (needles stay; overlay stays out of Codex skills).

---

## What is true now — gaps vs plan of record

The diagnosis in comment `5380834329` still matches this tree.

1. **Catalog:** `--global` still only fills `${CURSOR_HOME}/{agents,commands}` (G8-un-nested). It does **not** dual-write `$(git rev-parse --show-toplevel)/.cursor/{agents,commands}`. Docs/README still present `--global` / `install-all` default as a normal Cursor install, not as “not the Task catalog.” No generated next/init preflight, no copy-from-canon-names-only, no cold-start new-chat stop, no Invalid-enum fail-closed teaching.

2. **Teaching:** `## Agent Model Dispatch` exists on finalize (`REGION:command`) and is what Cursor substitutes. Next skeleton has **no** such heading; `## Delegation` is **skill-only**. Canonical and forge `workflow-next.md` therefore never trip `MODEL_DISPATCH_HEADING`, so generated Cursor next never receives `CURSOR_MODEL_DISPATCH_BLOCK`. The block itself still lacks inherit/`generalPurpose`/catalog fail-closed lines.

3. **Overlay:** init template still says pass the role’s configured model / ships its model in the installed profile. Cursor rewrite cannot see it (`model=` only). That sentence is a T19 conflict needle if it landed on a Codex next/finalize skill; today it lives in the stripped init template region.

4. **Guards:** `phaseCommands` is finalize-only (correct to leave). No separate next heading pin (`You MUST pass \`model=`` present, `model="{` absent). Cursor suite does not require the heading on canonical next or the pins/`generalPurpose` text on generated next. G8 asserts no nested `.cursor` under `CURSOR_HOME` and does **not** assert git-toplevel dual-write or catalog-copy-only-canon.

5. **Generated Cursor next** is gitignored; tests materialize it via `sync-cursor-edition.js --write`. There is no committed fixture to edit.

Until Layer 1–2 land, a `/workflow-next` parent can still lack named Kaola Task types (Probe A) and, even with a loaded catalog, is not taught omit-`model` / no-`generalPurpose` on the next card (Probe B teaching gap).
