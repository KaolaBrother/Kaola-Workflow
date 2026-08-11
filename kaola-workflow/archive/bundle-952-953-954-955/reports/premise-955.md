# Premise pass — issue #955 (per-runtime capability divergence table)

- Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955`
- Commit under measurement: `483a5e5e` (main; v9.6.0 / codex plugin 7.6.0 + the #952–#955 roadmap filing)
- Installed trees inspected on this box: `~/.claude`, `~/.codex`, `~/.config/opencode`, `~/.kimi-code`
- Read-only pass. No tracked file edited by me.

> **Concurrency note.** The worktree was clean when this pass started and had 13 modified files by
> the time it ended (`agents/{code-architect,implementer,planner}.md`, their nine `.toml` twins, and
> `scripts/test-agent-profile-parity.js` — 176 insertions, 2 deletions) from another agent working
> the same worktree. None of mine. The two measurements that could have been contaminated (claude
> frontmatter tiers; codex TOMLs carrying no model key) were **re-run against the pinned commit**
> `git grep … 483a5e5e` and are unchanged; the concurrent diff touches no `model:`, `name:` or
> `tools:` line. Every count in this report is a `483a5e5e` fact.

## Headline

**Exactly one of the assumptions behind the five rows is STALE: #944.** The codex role→tier carrier
gap is closed, at both the authored and the installed level — every one of the six Codex SKILL
surfaces now carries a rendered per-spawn tier roster, and I verified it in the installed plugin
cache, not only in the repo. Every other row's assumption holds: kimi still cannot dispatch a named
custom subagent; the command surface is still three per runtime; there are still no
`PreToolUse`/`PostToolUse` hooks anywhere and the dispatch-log is still advisory; the install paths
are unchanged, including codex's versioned cache that prunes.

Two adjacent records are stale in ways the issue did not anticipate, and both would have been copied
into a cell by anyone writing the table from memory:

- `DEFAULT_AGENT_MODELS` no longer claims to be "the effective tier of every installed agent" — #949
  corrected its scope to say it does **not** decide a Claude Code dispatch.
- #949 **renamed** the model-badge section rather than deleting it; the dispatch mechanism it
  documents is fully intact.

Separately, the premise pass found **six stale or missing prose facts** in docs that a per-edition
doc should own — including one per-edition doc restating another runtime's mechanism, and rotting.
Those are listed at the end as findings, not table content.

## Terminology the table must get right before it writes a cell

"The four runtimes" (claude, codex, opencode, kimi) and "the editions" are **not the same axis**, and
the repo conflates them in at least one place. `install-all.sh:38` → `RUNTIMES=(claude opencode codex
kimi)`. But `generate-routing-surfaces.js` renders over **six edition trees** — claude×{github,
gitlab, gitea} and codex×{github, gitlab, gitea} (`scripts/generate-routing-surfaces.js:66-74`,
`COMMAND_EDITIONS` / `SKILL_EDITIONS`). The forge axis multiplies claude and codex; opencode and kimi
carry `--forge` inside their own standalone installers instead.

So every claude and codex cell is really "×3 forges". Say that once above the table, not per cell.

---

## Row 1 — DISPATCH CARRIER

| runtime | current shipped truth | authoritative file pointer | flag |
|---|---|---|---|
| claude | 14 named subagent definitions in Markdown, dispatched by the runtime's Agent tool. | `agents/` (the directory — 14 `*.md`); provenance/refresh in `docs/agents-source.md` | CURRENT |
| codex | 14 TOML agent profiles, registered through one roster mapping each agent name to its `config_file`. | `plugins/kaola-workflow/config/agents.toml` (registry, 14 `[agents.*]` blocks); profiles `plugins/kaola-workflow/agents/*.toml`; installer `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` | CURRENT |
| opencode | 14 named subagent definitions in Markdown (`mode: subagent`), dispatched by opencode's `task` tool. | `docs/opencode-edition.md` § "What gets generated" (`agents/<name>.md` → `.opencode/agent/<name>.md`) | CURRENT |
| kimi | **Cannot dispatch a named custom subagent.** Kimi's Agent tool exposes only built-in `coder`/`explore`/`plan`. The 14 roles ship as role-contract Skills (`kaola-role-<name>`); each canonical dispatch card is rewritten at generation time to `explore` (read-only roles) or `coder` (write roles), prefixed with an instruction to invoke the matching role Skill. | `docs/kimi-edition.md` § "Roles as Skills"; the machine-enforced declaration is `KIMI_RUNTIME_NATIVE` at `scripts/test-kimi-edition.js:411-414` | CURRENT |

### Measured counts

```
agents/*.md                                     14
plugins/kaola-workflow/agents/*.toml            14
plugins/kaola-workflow-gitlab/agents/*.toml     14
plugins/kaola-workflow-gitea/agents/*.toml      14
[agents.*] blocks in config/agents.toml         14
~/.claude/agents/*.md            (installed)    14
~/.codex/agents/kaola-workflow/*.toml           14
~/.config/opencode/agent/*.md                   14
~/.kimi-code/skills/kaola-role-*                14
```

### Pointer-target problems in this row

- **claude — WEAK.** No single file *states* "claude dispatches via the Agent tool over
  `agents/*.md`". The directory is the fact. A pointer at `agents/` + `docs/agents-source.md` is the
  best available; a pointer at a prose sentence does not exist.
- **kimi — two candidates, pick deliberately.** `docs/kimi-edition.md` § "Roles as Skills" is the
  readable target; `scripts/test-kimi-edition.js:411` is the *enforced* one. The kimi doc explicitly
  says of itself: "this paragraph describes it but is not it." For an absence cell the issue permits
  naming the establishing record; here that record is an edition doc, **not** an issue or ADR number,
  so the issue's stated exception does not literally cover this cell. Worth a decision at write time.

---

## Row 2 — COMMAND / SKILL SURFACE

`node scripts/generate-routing-surfaces.js --check` → `all 18 surfaces byte-match the skeleton.`
(exit 0). 18 = 3 topics × 6 edition trees.

| runtime | current shipped truth | authoritative file pointer | flag |
|---|---|---|---|
| claude | 3 slash **commands** per forge, rendered from the skeletons: `workflow-init`, `workflow-next`, `kaola-workflow-finalize`. github at `commands/`; gitlab/gitea at `plugins/kaola-workflow-<forge>/commands/`. No kaola Skills. | registry `scripts/generate-routing-surfaces.js:66-94` (`COMMAND_EDITIONS` + `TOPICS`); skeletons `templates/routing/{next,init,finalize}.skeleton.md` | CURRENT |
| codex | 3 directory-form **SKILLs** per forge: `kaola-workflow-init`, `kaola-workflow-next`, `kaola-workflow-finalize`. Note the basenames are **asymmetric** with the command form for `next`/`init`. | registry `scripts/generate-routing-surfaces.js:71-94` (`SKILL_EDITIONS` + `TOPICS`); same three skeletons | CURRENT |
| opencode | 3 commands, generated from the same routing registry into `.opencode[-<forge>]/command/`, plus 14 agents. Basenames follow the **command** form. | `docs/opencode-edition.md` § "Installer command set" | CURRENT |
| kimi | 3 command **Skills** + 14 role Skills = 17 skill dirs. Command skills keep the canonical **command** basenames (`workflow-next` etc.) so Kimi auto-registers `/workflow-next`. | `docs/kimi-edition.md` § "Installer command set" and § "What gets generated" | CURRENT |

### Measured (tracked tree)

```
commands/                                   3
plugins/kaola-workflow-gitlab/commands/     3
plugins/kaola-workflow-gitea/commands/      3
plugins/kaola-workflow/skills/              3
plugins/kaola-workflow-gitlab/skills/       3
plugins/kaola-workflow-gitea/skills/        3      → 18
```

### Measured (installed on this box)

```
~/.claude/commands/                    3   (kaola-workflow-finalize, workflow-init, workflow-next)
~/.claude/skills/                      0 kaola  (only unrelated wps-* skills)
~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.6.0/skills/   3
~/.config/opencode/command/            3
~/.kimi-code/skills/                  17   (3 command + 14 kaola-role-*)
```

CLAUDE.md's "the installed command surface is three" holds for all four runtimes — but on kimi the
*skill* surface is 17, because roles have nowhere else to live. That asymmetry is itself a row-1
consequence and the table should not let the "three" claim hide it.

**Pointer note:** the count is a live number, not a constant to restate. `docs/conventions.md:136`
already says to read the count off `--check` rather than off a sentence — the table should point at
`scripts/generate-routing-surfaces.js` (the registry), not print `18`.

---

## Row 3 — HOOKS

**Both prior-audit claims verified CURRENT.**

- *"No PreToolUse/PostToolUse hooks exist"* — **CURRENT.** All six tracked `hooks.json` carry exactly
  `['SessionStart', 'SubagentStart']`:
  ```
  hooks/hooks.json                                   ['SessionStart', 'SubagentStart']
  plugins/kaola-workflow/config/hooks.json           ['SessionStart', 'SubagentStart']
  plugins/kaola-workflow-gitlab/config/hooks.json    ['SessionStart', 'SubagentStart']
  plugins/kaola-workflow-gitlab/hooks/hooks.json     ['SessionStart', 'SubagentStart']
  plugins/kaola-workflow-gitea/config/hooks.json     ['SessionStart', 'SubagentStart']
  plugins/kaola-workflow-gitea/hooks/hooks.json      ['SessionStart', 'SubagentStart']
  ```
- *"subagent-dispatch-log is advisory"* — **CURRENT.** `hooks/kaola-workflow-subagent-dispatch-log.sh:3`
  — `# SubagentStart delivers a JSON payload on STDIN; exit 0 always (fail-open).`

There is exactly **one** hook script (`kaola-workflow-subagent-dispatch-log.sh`); the second entry
runs a Node script (`kaola-workflow-compact-context.js`, or the codex twin
`kaola-workflow-codex-compact-resume.js`).

| runtime | current shipped truth | authoritative file pointer | flag |
|---|---|---|---|
| claude | Supported. 2 events (`SessionStart`+`compact`, `SubagentStart`) declared in one JSON, rendered with `$CLAUDE_PLUGIN_ROOT` resolved and **merged into `~/.claude/settings.json`** by the installer. | `hooks/hooks.json` (the declaration); merge at `install.sh:670-711` | CURRENT |
| codex | Supported, same 2 events, but the plugin ships its own copy with a `__KW_PLUGIN_ROOT__` placeholder, and the installer merges it **globally** into `~/.codex/hooks.json` (not a project file). Compact hook is a codex-specific script. | `plugins/kaola-workflow/config/hooks.json`; global-merge target at `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:23-26` | CURRENT |
| opencode | Supported via a **TS/JS plugin adapter**, not shell+settings. `kaola-workflow-hooks.js` maps `tool.execute.before`·`task` → dispatch-log and `experimental.session.compacting` → inline compact. Canonical source is tracked outside the generated tree. | `docs/opencode-edition.md` § "Hooks" (mapping table); canonical plugin `templates/opencode/plugins/kaola-workflow-hooks.js` | CURRENT |
| kimi | Supported via **TOML `[[hooks]]` in the global `config.toml`** only — no project-scoped hooks config, so a project install still activates hooks machine-wide. `SubagentStart` + `PostCompact` (Kimi has no `SessionStart"compact"`). Payload field differs (`agent_name` vs `agent_type`) and is adapted at generation time. | `docs/kimi-edition.md` § "Hooks" (mapping + payload-adaptation tables); event-mapping rationale `docs/decisions/D-703-01.md` | CURRENT |

**Best single pointer for the "no interception hooks" fact:**
`docs/decisions/0011-oracle-test-and-kernel-extraction.md:27-29` — it states it as an established
audit fact across all six `hooks.json`, which is exactly the shape a pointer-only cell wants.

### One observation the table should NOT restate but the implementer should know

The **installed** `~/.codex/hooks.json` carries `"PreToolUse": []` and `"PostToolUse": []` — empty
arrays, i.e. zero registered hooks, so the ADR claim is not contradicted. Neither `install.sh` nor
`uninstall.sh` mentions `PreToolUse` (`git grep -Pn 'PreToolUse' -- install.sh uninstall.sh` → no
output), and the installer's merge preserves pre-existing keys, so these are residue from an older
install. File mtime is 8月 1, predating the 8月 11 four-runtime reinstall — consistent with residue
that the merge preserved rather than rewrote. Not a defect; noted so nobody re-derives it as one.

---

## Row 4 — MODEL & TIER HANDLING *(the row #955 flagged as stale)*

### #944 codex role→tier carrier gap: **STALE — CLOSED, at both authored and installed level.**

Every one of the six Codex SKILL surfaces opens with a `codex-dispatch-model-routing` PIN:

```
plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:5
plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:5
plugins/kaola-workflow-gitlab/skills/{kaola-workflow-next,kaola-workflow-finalize}/SKILL.md:5
plugins/kaola-workflow-gitea/skills/{kaola-workflow-next,kaola-workflow-finalize}/SKILL.md:5
```

Shipped bytes (`plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:6-21`): standard tier =
`model: "gpt-5.6-sol"` + `reasoning_effort: "medium"`; reasoning tier = same model +
`reasoning_effort: "xhigh"`; 7 roles each side.

**Verified in the installed tree**, not only the repo — the identical PIN is present at
`~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.6.0/skills/kaola-workflow-next/SKILL.md:5-22`.

The roster is rendered, not hand-written:
- constants `scripts/kaola-workflow-adaptive-schema.js:46` (`CODEX_PINNED_STANDARD_ROLES`) and `:55`
  (`CODEX_PINNED_REASONING_ROLES`)
- render `templates/routing/slots.js:106` (`SLOTS['codex-tier-roster']`; computed wrap at `:91`)
- guard `docs/conventions.md:213` — `test-route-reachability.js` **T19b** reds if the shipped roster
  and the constants disagree **in either direction**

The codex agent TOMLs carry **no** model key:
`git grep -Pn '^(model|model_reasoning_effort|reasoning|tier)\s*=' -- 'plugins/**/*.toml'` → no
matches. **A cell pointing at `plugins/*/agents/*.toml` for the codex tier would be wrong** — the
installed carrier is the SKILL prompt surface; the source of truth is the kernel constant.

### The four cells

| runtime | current shipped truth | authoritative file pointer | flag |
|---|---|---|---|
| claude | Two tiers, per-dispatch. Source `agents/*.md` frontmatter declares `model: opus\|sonnet` (7 opus / 7 sonnet), but the **installer rewrites every installed agent to `model: inherit`** — so the effective selector is the explicit `model="{...}"` literal the installer fills into each dispatch card from the source profile. Omitting it runs the role on the session's model. | `scripts/kaola-workflow-resolve-agent-model.js:8-21` (the header states the whole chain and its non-applicability to a Claude dispatch); the shipped rule at `commands/kaola-workflow-finalize.md:29-35` (`## Agent Model Dispatch`) | CURRENT |
| codex | Two tiers, per-spawn, fixed: standard → `gpt-5.6-sol`/`medium`, reasoning → `gpt-5.6-sol`/`xhigh`. Carried by the SKILL PIN, rendered from the kernel. Agent profiles carry no model at all. | `scripts/kaola-workflow-adaptive-schema.js:46-63` (source of truth); carrier `templates/routing/slots.js:106` | **STALE** — #944's "no installed carrier" no longer holds |
| opencode | **Inherit.** A subagent runs the model *and* reasoning effort of the dispatching session; opencode's `task` tool has no model or effort parameter. Per-role effort seeding was **removed**, not deprecated. A per-tier **model** pin is opt-in via `KAOLA_OPENCODE_STANDARD_MODEL` / `KAOLA_OPENCODE_REASONING_MODEL` or hand-edited `opencode.json`. | `docs/opencode-edition.md` § "Model and effort — inherited from the session"; env vars at `scripts/sync-opencode-edition.js:95-96` | CURRENT |
| kimi | **Inherit, with no opt-in at all.** No per-dispatch model override, no per-role effort control, no model-pin scaffold. The planner's `reasoning`/`standard` tier survives as **metadata only** and maps to nothing at runtime. | `docs/kimi-edition.md` § "One model tier — every subagent inherits the session model"; enforced declaration `scripts/test-kimi-edition.js:411-414` | CURRENT |

### Measured: installed claude frontmatter

```
$ for f in ~/.claude/agents/*.md; do grep -m1 '^model:' $f; done | sort | uniq -c
  14 model: inherit
```

versus source `agents/*.md`: 7 × `model: opus` (adversarial-verifier, build-error-resolver,
code-architect, code-reviewer, planner, security-reviewer, synthesizer) and 7 × `model: sonnet`
(code-explorer, doc-updater, implementer, investigator, knowledge-lookup, metric-optimizer,
tdd-guide). **That split is byte-for-byte the codex reasoning/standard roster** — one classification,
four renderings. The table should carry that as a single shared fact, not four independent cells.

The installed command still carries the filled literals. `~/.claude/commands/kaola-workflow-finalize.md`
has 3 `Agent(` dispatch cards and exactly 3 filled literals — `model="sonnet"` (:88, :156) and
`model="opus"` (:97). The other four `model=` occurrences in that file (:31-34) are the prose rule
itself, not dispatches.

### #949 "model badge" — what actually shipped

Commit `340351c5`. The heading was **renamed, not deleted**: `## Agent Model Badge` →
`## Agent Model Dispatch`, because the heading string is a live anchor for six code sites and the
opencode/kimi transforms would have **silently no-opped** on a delete. Retired as cosmetic: the badge
explanation, the visibility blockquote, the restart instruction, the troubleshooting entry. Kept as
mechanism: every placeholder, the dispatch rule, `assertEveryDispatchHasModel`, the region directive,
and the edition guidance. A negative pin blocks the old heading's return.

The section ships on **`commands/kaola-workflow-finalize.md` only** (`git grep -Pn 'Agent Model
Dispatch'` finds one tracked command surface) — a REGION directive scopes it to command surfaces, so
it is absent from all six SKILL surfaces. A cell claiming "every claude surface carries the dispatch
rule" would be wrong.

**Also corrected by #949 and now stale in any older note:** `DEFAULT_AGENT_MODELS` used to claim it
was "THE EFFECTIVE TIER OF EVERY INSTALLED AGENT". Its header now states the scope precisely
(`scripts/kaola-workflow-resolve-agent-model.js:12-14`): *"IT DOES NOT DECIDE A CLAUDE CODE
`Agent(...)` DISPATCH."* If any brief still carries the old framing, it is stale.

---

## Row 5 — INSTALL PATH

| runtime | current shipped truth | authoritative file pointer | flag |
|---|---|---|---|
| claude | `./install.sh --forge=github\|gitlab\|gitea`. Agents → `~/.claude/agents`, commands → `~/.claude/commands` (**both forge-independent — the three forges collide there**); support tree → `~/.claude/kaola-workflow[-gitlab\|-gitea]/{hooks,scripts}` (forge-dependent); hooks merged into `~/.claude/settings.json`. | `install.sh:35-36` (agents/commands), `:93-106` (per-forge support dir), `:701` (settings) | CURRENT |
| codex | **Two-part, and neither part is `install.sh`.** (a) Skill pack + plugin: installed by the Codex CLI from the local marketplace into a **versioned cache that prunes** — `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`, today `.../kaolabrother-kaola-workflow/kaola-workflow/7.6.0/`. (b) Agent profiles + hooks + support scripts: `install-codex-agent-profiles.js` → `~/.codex/agents/kaola-workflow/*.toml`, global `~/.codex/hooks.json`, `~/.codex/kaola-workflow/{hooks,scripts}`. | the split is stated at `install-all.sh:248-253`; marketplace registration `.agents/plugins/marketplace.json`; the profile/hook installer `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:18-36` | CURRENT (versioned-prune caveat holds) |
| opencode | `./install-opencode.sh [--forge=…] [--global]`. `--global` → `${OPENCODE_CONFIG_DIR:-~/.config/opencode}/{agent,command,plugins,hooks}` **un-nested** (a nested `.opencode/` there is dead); project → `<project>/.opencode/…`. Scripts → `<config>/kaola-workflow/scripts/`. | `docs/opencode-edition.md` § "Deploy layout — project vs global (scope-dependent)" | CURRENT |
| kimi | `./install-kimi.sh [--forge=…] [--global]`. `--global` → `${KIMI_CODE_HOME:-~/.kimi-code}/skills/<name>/SKILL.md`; project → `<project>/.kimi-code/skills/`. Scripts + hook scripts **always** at `${KIMI_CODE_HOME}/kaola-workflow/{scripts,hooks}`; hooks block always merged into the **global** `config.toml`. | `docs/kimi-edition.md` § "Deploy layout — project vs global (scope-dependent)" | CURRENT |

`./install-all.sh` runs all four in order `RUNTIMES=(claude opencode codex kimi)`
(`install-all.sh:38`) with `--global` and `--forge=github` by default, and ends in a PASS/FAIL table.
Pointer: `README.md:224`.

### Verified installed layout on this box

```
~/.claude/{agents,commands}                       14 / 3
~/.claude/kaola-workflow/{hooks,scripts}          present (hooks.json + dispatch-log.sh)
~/.claude/hooks/                                  EMPTY — scripts live under ~/.claude/kaola-workflow/hooks
~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.6.0/{skills,agents,config,hooks,scripts}
~/.codex/agents/kaola-workflow/                   14 .toml
~/.codex/hooks.json                               2 kaola entries (+ 2 empty legacy keys)
~/.config/opencode/{agent,command,plugins,hooks}  14 / 3 / 1 / 1
~/.kimi-code/skills/                              17
~/.kimi-code/config.toml:107-117                  managed [[hooks]] block, 2 entries
```

Note `~/.claude/hooks/` is empty — a cell pointing there for claude hooks would resolve to nothing.

---

## Cells with NO single authoritative file (the issue's stated hazard)

Ranked by how much work the implementation owes them.

1. **claude / dispatch carrier — no prose home.** The fact is the `agents/` directory's existence.
   Nearest targets: `agents/` itself, `docs/agents-source.md` (provenance, not mechanism),
   `docs/architecture.md:300-306` (§ Agent profiles, which describes the profile *contents*, not the
   dispatch mechanism). None says "claude dispatches named subagents via the Agent tool."
2. **claude and codex have no per-edition doc at all.** `docs/README.md` § "Runtime editions" lists
   only `opencode-edition.md` and `kimi-edition.md`. Two of four columns therefore have no
   per-edition doc to point at, and their facts are scattered across `README.md`,
   `docs/architecture.md`, `install.sh`, and the plugin manifest. **This is the structural cause of
   the re-derivation #955 names**, and it is the single most important thing the premise pass found.
3. **codex / model & tier — one cell, two files.** Source of truth is
   `scripts/kaola-workflow-adaptive-schema.js:46-63`; the *installed carrier* is the SKILL PIN
   (`templates/routing/slots.js:106` → the six SKILL surfaces). A single pointer loses half the fact.
4. **codex / install path — no single file.** The two-part install is described in a *comment block*
   at `install-all.sh:248-253` and executed across the marketplace manifest and the profile
   installer. The comment is the closest thing to an authoritative statement, and pointing a doc at a
   shell comment is fragile.
5. **kimi / dispatch carrier — the enforced record is a test file.** See row 1's note: the readable
   target and the enforced target are different files, and the issue's "name the issue or ADR" escape
   hatch does not cover an edition doc.

---

## Doc placement recommendation

**Put it in `docs/architecture.md` as a new subsection `### Runtime capability divergence` under the
existing `## Editions and runtimes` (line 285), placed before `### Agent profiles` (line 300).**
Do not create a new doc.

Reasons, in order:

1. **That section already owns three of the five rows, in scattered prose.** `## Editions and
   runtimes` (285-298) holds the edition/runtime split; `### Agent profiles` (300-322) holds the
   dispatch-carrier facts; `### Model resolution` (324-349) holds the model/tier facts *including a
   verbatim restatement of the codex tier mapping*. A new doc would make this the **second** place
   per-runtime divergence lives, which is the failure #955 exists to end.
2. **`docs/README.md` already indexes `architecture.md`** under Core, so acceptance ("docs/README.md
   indexes it") costs a sub-pointer on an existing line rather than a new entry that competes with
   the two per-edition docs.
3. A new short doc would sit *beside* `### Model resolution` with no mechanism keeping the two in
   agreement — and `### Model resolution` is exactly where a stale restatement already exists (below).

**The placement carries an obligation.** `docs/architecture.md:346-348` currently restates the codex
tier mapping as prose:

> Codex keeps the same role classification but maps it at spawn time: `standard` to `gpt-5.6-sol` /
> `medium`, and `reasoning` to `gpt-5.6-sol` / `xhigh`.

That is a **third copy** of a fact whose source is `CODEX_PINNED_*` and whose carrier is the SKILL
PIN. Adding a pointer-only table above it without repointing that paragraph would leave the very
rot-by-restatement the issue forbids, one screen from the table forbidding it. The implementation
should repoint (not duplicate) lines 346-348.

---

## Findings for a per-edition doc — NOT table content

Per the issue: "facts a per-edition doc should hold and does not are findings for that doc." Four of
these are worse than absences — they are **stale claims**.

1. **`README.md:1231-1233` — STALE.** The "Matcher note" describes `PreToolUse`/`PostToolUse`
   matchers (`Bash`, `Write|Edit`) that do not exist in any edition, and tells the reader they "may
   need adjustment" in `~/.codex/hooks.json`. All six tracked `hooks.json` carry only `SessionStart`
   + `SubagentStart`; the interception hooks were retired in #372/#725
   (`docs/decisions/0011-oracle-test-and-kernel-extraction.md:27-29`). This paragraph instructs a
   reader to tune something that is not there.

2. **`docs/opencode-edition.md:374` — STALE, and cross-runtime.** The "How it differs from the Codex
   edition" table says Codex models are "baked per-agent". False at `483a5e5e`: every Codex agent
   TOML omits `model` and `model_reasoning_effort` (verified by grep; also stated at
   `docs/architecture.md:303-304`), and the tier is supplied per spawn by the SKILL PIN. This is
   precisely the class of defect #955 exists to prevent — a per-edition doc restating *another*
   runtime's mechanism, and rotting.

3. **`docs/architecture.md:287` — axis conflation.** "**Four forge editions** … the canonical GitHub
   tree in `scripts/` plus `plugins/kaola-workflow/` (Codex), …". Codex is a **runtime**, not a
   forge; the sentence counts a runtime tree as a forge edition. This is the same runtime-vs-forge
   confusion the table has to avoid, sitting two lines above where the table would go.

4. **`docs/architecture.md:346-348` — restated mechanism fact.** See the placement obligation above.

5. **No claude or codex per-edition doc exists.** `docs/README.md` § "Runtime editions" (lines 15-18)
   lists opencode and kimi only. Two of the four columns have no per-edition doc to point at. This
   is a structural finding, not something the table can fix — but it explains why the claude and
   codex cells have the weakest pointer targets in every row, and it is worth filing separately.

6. **`docs/README.md:17` — STALE.** The opencode index line advertises a "provider-open **two-tier
   effort mapping**". That mapping was **removed, not deprecated**: `docs/opencode-edition.md`
   § "Model and effort — inherited from the session" records that the per-role effort tier (the
   `provider.*.variants` block and `agent.<role>.variant`/`.options` entries) was deleted because it
   overrode inheritance rather than repairing it, and that the installer now *names* such entries as
   drift. What survives is an opt-in two-tier **model** pin, which is a different axis. The index
   line sells a capability the edition no longer has.

---

## What remains unmeasured

- I did not run any edition suite (`test-opencode-edition.js`, `test-kimi-edition.js`,
  `test-route-reachability.js` T19b). The roster/constant agreement is asserted from
  `docs/conventions.md:213` plus a direct byte read of the shipped PIN, not from a green T19b run.
- The opencode and kimi generated trees (`.opencode/`, `.kimi/`) are gitignored and **absent from
  this worktree**; they exist in the main tree. Opencode/kimi generated-tree facts are established
  from the edition docs, the generators, and the **installed** trees under `~/.config/opencode` and
  `~/.kimi-code` — not from an in-worktree generated tree.
- Runtime dispatch behaviour itself (does kimi's `explore` actually honour the role Skill?) is not
  measured here; only the shipped filesystem surface is.

---

## Independent verification pass (second agent, rows 2/3/5 + pointer resolution)

A second premise agent was dispatched for rows 2, 3 and 5 and found them already written above. Rather
than duplicate them, it re-measured the falsifiable claims independently and then did the check the
rows themselves could not do: **resolve every pointer target the table proposes.** A pointer that does
not resolve is precisely the failure #955 exists to end, so the pointer set is the load-bearing part.

- Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955`, commit
  `483a5e5e`, clean. Read-only: no tracked file edited.

### Re-measured independently — all agree

| Measurement | Command | Result |
|---|---|---|
| routing surfaces | `node scripts/generate-routing-surfaces.js --check` | `all 18 surfaces byte-match the skeleton.` **exit 0** |
| the 18, enumerated | `node -e` over the exported `GENERATED_SURFACES` | 3 topics × (3 `COMMAND_EDITIONS` + 3 `SKILL_EDITIONS`) = 18 |
| tracked command/skill dirs | `ls` ×6 | 3 / 3 / 3 / 3 / 3 / 3 |
| kimi skill dirs | `ls ~/.kimi-code/skills \| wc -l` | 17 (3 command + 14 `kaola-role-*`) |
| installed claude | `ls ~/.claude/{commands,agents}` | 3 / 14 |
| installed codex profiles | `ls ~/.codex/agents/kaola-workflow` | 14 `.toml` |
| installed codex plugin cache | `ls ~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/` | `7.6.0` — **a single version dir; the prune claim is visible, not inferred** |
| installed opencode | `ls ~/.config/opencode/{agent,command,plugins,hooks}` | 14 / 3 / 1 / 1 |
| `~/.codex/hooks.json` keys | `python3 -c json.load` | `PostToolUse→0, PreToolUse→0, SessionStart→1, SubagentStart→1` |
| tracked hook inventory | `git ls-files \| grep -i hook` | exactly 2 hook artifacts + 5 per-edition `hooks.json` copies; **no PreToolUse/PostToolUse anywhere** |

### Pointer resolution — every cited target was opened

All 14 cited files exist. Every cited **heading** exists verbatim:
`docs/opencode-edition.md` § "Installer command set" (:141), § "Hooks" (:155), § "Model and effort —
inherited from the session" (:88), § "Deploy layout — project vs global (scope-dependent)" (:273);
`docs/kimi-edition.md` § "Installer command set" (:149), § "Hooks" (:164), § "One model tier …" (:80),
§ "Deploy layout …" (:263). Every cited **line anchor** says what the row claims — spot-checked at
`install-all.sh:38` and `:248-253`, `README.md:224` and `:1231-1233`, `docs/README.md:15-18`,
`docs/architecture.md:285-287` and `:346-348`, `docs/conventions.md:136` and `:213`,
`scripts/kaola-workflow-resolve-agent-model.js:8-21`, `commands/kaola-workflow-finalize.md:29-35`,
`scripts/test-kimi-edition.js:411-414`, `scripts/sync-opencode-edition.js:95-96`,
`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:18-36`,
`docs/decisions/0011-oracle-test-and-kernel-extraction.md:27-29`, `docs/decisions/D-703-01.md`.

**No dead pointer found.** The two STALE flags above were re-derived from the primary text and both
hold: `docs/README.md:17` advertises a "provider-open two-tier effort mapping" that
`docs/opencode-edition.md:103-108` records as *"**removed**, not merely deprecated"*; and
`README.md:1231-1233` tells the reader to tune `PreToolUse`/`PostToolUse` matchers that exist in no
edition.

### Three refinements the rows above should absorb

1. **Row 5 / codex — the destination is scope-dependent, and the cell reads as if it is not.**
   `install-codex-agent-profiles.js:8-13`: `--global` targets `~/.codex`; **without it the profiles
   go to project-local `<project>/.codex/agents/kaola-workflow/`**. `install-all.sh` passes
   `--global` by default, which is why the box shows the global path. The opencode and kimi cells
   correctly say "project vs global"; the codex cell states the global path unconditionally. Same
   axis, two treatments — exactly the half-truth the table must not ship. (Hooks *are*
   unconditionally global for codex — `globalCodexDir` at `:25-26` ignores the flag — so the cell
   needs the scope split applied to profiles but **not** to hooks.)

2. **Hazard #3 undercounts: the codex tier fact has four authoring sites, not two.** Beyond the
   kernel constants and the six SKILL PINs there are two more *independent literal copies*:
   `scripts/kaola-workflow-codex-preflight.js:83` (authored `require`-free, so it cannot import the
   schema) and `plugins/*/scripts/install-codex-agent-profiles.js:82` (×3). This makes
   **`docs/conventions.md:195-216` a better pointer for that cell than
   `scripts/kaola-workflow-adaptive-schema.js:46-63`** — it is one file that enumerates every copy
   *and* names the guard binding them, where the kernel citation silently drops half the carrier set.

3. **New finding for `docs/architecture.md:295-296` — a half-true absolute.** It says the two
   additive editions are not wired into "`npm test`, `edition-sync.js`, `install.sh`, or the
   **routing-surface propagation set**". The first three are exact. The fourth is true only of the
   18-surface byte-compare set: both sync scripts render their commands **from the same routing
   registry** (`scripts/runtime-edition-forge.js:103` `commandSources()`, called at
   `sync-opencode-edition.js:162,166` and `sync-kimi-edition.js:117,121`), and
   `generate-routing-surfaces.js:143-149` documents that consumption as deliberate — *"a downstream
   runtime edition (opencode / Kimi Code) renders its own tree FROM these rows instead of reading a
   hardcoded `commands/` directory"*. A routing-prose edit therefore reaches **24 surfaces across
   four runtimes** (18 tracked + 6 generated), not 18. A reader who trusts the sentence will skip the
   two sync steps. Add to the findings list as a per-doc repair.

### One incidental observation (not table content, not row scope)

`scripts/sync-opencode-edition.js:485-494` and `scripts/sync-kimi-edition.js:467-470` both carry
strip logic for a `> **Codex hooks note:** …` blockquote. `git grep -n "Codex hooks note"` finds that
string in **no live surface or skeleton** — only in these two strippers and in archived run records.
The strip predicates are vacuous at `483a5e5e`. Flagged for #952 (subtraction audit), not for #955.

### Verification-pass residue

- Row 4's claude / opencode / kimi model-tier cells were written by the first agent after this second
  agent's brief was cut (the brief listed row 4 as settled for codex only). They are present above
  and were **not** independently re-measured by the second pass, except `~/.claude/agents/*.md` →
  14 × `model: inherit`, which reproduces.
- No edition suite was run by either pass. `test-route-reachability.js` T19b, `test-opencode-edition.js`
  and `test-kimi-edition.js` remain unrun; the roster/constant agreement is read from shipped bytes
  and from `docs/conventions.md:213`, not from a green guard.
