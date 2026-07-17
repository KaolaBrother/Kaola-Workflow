# Kaola-Workflow · kimi Edition

The kimi edition makes the 6-phase Kaola-Workflow runnable from
[Kimi Code](https://www.kimi.com/code), the same way the opencode edition makes it runnable
from opencode. Kimi Code is a coding-agent **runtime** (like Codex and opencode), not a git
forge, so this edition is delivered the Kimi-native way — directory-form **Skills** under a
generated `.kimi/` tree plus a managed `[[hooks]]` block in the Kimi `config.toml` — and is
fully **additive**: it touches none of the existing `claude`/`codex`/`gitlab`/`gitea`/
`opencode` edition machinery.

## What gets generated

Everything under `.kimi/` is **generated from canonical** by
`scripts/sync-kimi-edition.js` and parity-checked by
`scripts/test-kimi-edition.js` (the kimi twin of `test-opencode-edition.js`):

| Canonical source | kimi edition output | Notes |
| ---------------- | ------------------- | ----- |
| `commands/<file>.md` | `.kimi/skills/<command>/SKILL.md` | Directory-form Skill (11 commands). Kimi auto-registers an activated directory skill as the slash command `/<name>`, so command skills keep their canonical basenames (`/workflow-next` works). Claude install-time `model="{...}"` placeholders and all "pass `model=`" instructions are rewritten to inherit-the-session-model prose; the canonical Path Intent section is stripped so adaptive is the unconditional default (see [Path selection](#path-selection--adaptive-is-the-unconditional-default) below). |
| `agents/<name>.md` | `.kimi/skills/kaola-role-<name>/SKILL.md` | Role-contract Skill (16 roles). Frontmatter is `name` + `description` only — **no `model:`/`tools:` fields**. Generated reviewers preserve their canonical normalized behavior core and identity. `agents/profiles/higher/` is skipped (meaningless under inherit). |
| `hooks/<script>.sh` | `.kimi/hooks/<script>.sh` | The 3 runtime-neutral hook scripts — byte-copied where the Kimi payload is field-compatible (pre-commit), payload-adapted at generation time where it is not (write-lane, dispatch-log; see [Hooks](#hooks)). |
| `hooks/hooks.json` (the mapping) | `.kimi/hooks/kimi-hooks.toml` | The four canonical hook entries re-expressed as a Kimi `[[hooks]]` TOML fragment with a `__KIMI_HOME__` placeholder, merged by the installer into the global Kimi `config.toml` as a managed block (see [Hooks](#hooks)). `hooks.json` itself is Claude-shaped and is never copied. |

The generated tree is deliberately model-agnostic, so regenerating it never overwrites a
user's model choices — those live only in the user-owned Kimi `config.toml`.

## Roles as Skills

Kimi Code's Agent tool has **no named custom subagents** — only the three built-in types
`coder` (full tools), `explore` (read-only), and `plan`. The 16 canonical roles therefore
cannot ship as named agent definitions the way they do on Claude Code (`agents/*.md`),
Codex (`.toml` profiles), or opencode (`.opencode/agent/*.md`). Instead each role ships as a
**role-contract Skill** `kaola-role-<role>`, and every canonical dispatch card —
`Agent(subagent_type="<role>", model="{...}", …)` — is rewritten at generation time to the
built-in type for the role's kind:

- **read-only roles** (canonical frontmatter `tools:` lacking Write/Edit) →
  `subagent_type="explore"`;
- **every other role** → `subagent_type="coder"`;
- the prompt is prefixed with the contract-binding instruction: *"First invoke the
  `kaola-role-<role>` Skill and follow its contract for the entire task."*

The role-kind map is **computed from canonical frontmatter, never hand-listed**, so a
canonical role that gains or loses write tools flips kind automatically. `workflow-next`'s
issue-scout dispatch is prose (not an `Agent()` card) and gets its own rewrite to the same
shape (`subagent_type="explore"` + `kaola-role-issue-scout`). Every `kaola-role-*`
reference inside a generated command skill is checked to resolve to a generated role skill,
so a renamed canonical role cannot leave a dangling Skill reference.

Should Skill invocation from a subagent ever prove unreliable in practice, the recorded
fallback is to install the role contracts as plain files under `kaola-workflow/roles/` and
have the dispatch prompt tell the subagent to Read its contract file instead — a
dispatch-prompt change only, still with zero canonical impact.

## One model tier — every subagent inherits the session model

There is **no Reasoning/Standard two-tier mapping** on Kimi. This edition follows the Codex
**inherit** precedent, not the opencode `mapTier` effort-variant one: Kimi Code has no
per-dispatch model override at all, so every subagent inherits the session model.
Consequences, all enforced by the test:

- Generated skills carry **no `model:` field**, and no effort-variant config is seeded
  anywhere. Model choices live only in the user's own Kimi `config.toml`.
- The canonical `model: opus` tier markers and the four Claude Code "higher" profiles
  (`agents/profiles/higher/`) are skipped entirely — meaningless under inherit.
- All "You MUST pass `model=` …" dispatch instructions are rewritten to *"Never pass a
  per-call model override; sub-agents inherit the session model."* The proper nouns
  `Opus`/`Sonnet` never appear in the generated tree (the lowercase `opus`/`sonnet`
  plan-ledger tier tokens are the portable cross-edition contract and remain).
- The adaptive planner's per-node tier (`reasoning`/`standard`) survives as **metadata
  only**: it is recorded in the dispatch packet and ledger, and `modelDisplay()` renders it
  as `parent session (<tier> tier metadata)` — the same semantics as the Codex edition. It
  maps to no variant, effort, or model at runtime.

## Reviewer behavior derivation

`code-reviewer` and `adversarial-verifier` are first rendered into their canonical Claude
roots by `scripts/generate-reviewer-profiles.js` from `templates/reviewers/behavior-contracts.json`
and the closed runtime adapters. `sync-kimi-edition.js` then transforms those generated
roots into role-contract Skills; it does not maintain a second reviewer prompt.

`scripts/test-kimi-edition.js` extracts the delimited reviewer core and proves that role,
`behavior_contract_version`, `behavior_contract_hash`, and every normalized core byte match
the canonical generated source (for `code-reviewer`, `adversarial-verifier`, and
`security-reviewer`). This is deterministic contract equivalence only. Kimi and another
runtime may produce different natural-language findings, explanations, or domain outcomes
because the underlying model execution is stochastic. The transform also makes no claim
about private runtime prompt-loader bytes; it proves the tracked/generated filesystem
surface.

## Path selection — adaptive is the unconditional default

On the kimi edition, the **adaptive path is the unconditional default**; there is no Path
Intent / adaptive-switch step at the router. The canonical `commands/workflow-next.md`
carries a `## Startup Step 0a-1 — Path Intent` section (`KAOLA_ENABLE_ADAPTIVE`
switch-resolution + Branch A/B path-selection prose). It is **stripped at generation time**
by `sync-kimi-edition.js`'s `transformCommandBody` — a section-drop keyed to the stable
**"Path Intent" title**, not the volatile step number, so a canonical renumber cannot
silently un-strip it — so it reaches `.kimi/skills/workflow-next/` already flipped, and
**canonical `commands/*.md` is never touched**. `## Startup Step 0a-2` (the adaptive
front-end entry) stays. The two inline "Step 0a-1" residue mentions the excision would
leave dangling in `workflow-next.md` collapse with it. `commands/kaola-workflow-adapt.md`
needs no kimi-specific fallback strip: canonical itself is adaptive-only — its repair loop
already says **"NEVER downgrade to fast/full — there is no automatic fallback between
paths"** — so the kimi surface inherits the guard verbatim.

## Installer command-set partition (`--with-fast` / `--with-full`)

`install-kimi.sh` is a standalone installer (not `install.sh --forge`) and mirrors
`install-opencode.sh`'s install-time opt-in partition. The **default** install deploys the
**adaptive-core** command skills ONLY (5 of the 11), so adaptive is the unconditional
default both at the router (the transform above) and at the install surface (which commands
exist). The fast / full-phase command skills are opt-ins; **all 16 `kaola-role-*` skills
are always installed**:

| Flag | Command skills added | Recorded in `installed_paths` |
| --- | --- | --- |
| *(default)* | kaola-workflow-adapt, kaola-workflow-finalize, kaola-workflow-plan-run, workflow-init, workflow-next | `[]` |
| `--with-fast` | `kaola-workflow-fast` | `["fast"]` |
| `--with-full` | `kaola-workflow-phase1`..`phase5` | `["full"]` |
| `--with-fast --with-full` | all of the above | `["fast","full"]` |

**Lockstep with install.sh.** The opt-in is recorded in the **shared**
`~/.config/kaola-workflow/config.json` `installed_paths` field — the *same* file
`install.sh` and `install-opencode.sh` read/write — via a UNION read-modify-write
(implemented in **node**, not python3). A re-install **never removes** a prior opt-in still
in `installed_paths`: `--with-fast` once, then a *bare* re-install (no flags) into the same
dest/HOME, preserves the `fast` command **and** `installed_paths:["fast"]`.

**Reset to adaptive-only is real (not additive-only).** `copy_skills` is **self-healing**:
before re-copying it PRUNES every kaola-owned skill dir not in the EFFECTIVE opt-in set, so
a narrowed `installed_paths` converges the on-disk command set back to exactly the 5
adaptive-core command skills. `--enable-adaptive` is retired and accepted-but-ignored
(adaptive is always installed). Canonical order is `["fast","full"]`.

**The generator still emits all 11.** `sync-kimi-edition.js` produces every command skill
into the in-repo `.kimi/skills/` tree (the single source the installer copies from); the
partition is an **install-time** selection of which skills to COPY to the user's dest, and
the test pins the partition as exhaustive — a new canonical command unassigned to a
partition fails both the test and the installer (fail-closed).

## Hooks

Kimi's hook model is **TOML `[[hooks]]` rules in `config.toml`** — not Claude Code's
`settings.json` shell hooks, and not opencode's TS/JS plugin. The kimi edition ships the
**same runtime-neutral shell scripts** the other editions use (single source of truth)
plus a generated `kimi-hooks.toml` fragment that
re-expresses the four canonical `hooks/hooks.json` entries:

| Claude/Codex hook | Kimi `[[hooks]]` mapping | Script |
| --- | --- | --- |
| `PreToolUse` Bash (block multi-project commits) | `event="PreToolUse"`, `matcher="Bash"` | `kaola-workflow-pre-commit.sh` |
| `PreToolUse` Write\|Edit (#376 lane containment) | `event="PreToolUse"`, `matcher="Write\|Edit"` | `kaola-workflow-write-lane.sh` |
| `SubagentStart` (dispatch attestation) | `event="SubagentStart"` (matcher omitted) | `kaola-workflow-subagent-dispatch-log.sh` |
| `SessionStart` compact (resume state) | `event="PostCompact"` | `node kaola-workflow-compact-context.js` |

Kimi matchers are regexes, so the `Write|Edit` alternation carries over verbatim. Kimi
honors the same exit-code contract (0 = allow, 2 = deny); the scripts stay
fail-open everywhere (a missing script, malformed payload, or non-git cwd never breaks the
session), and the write-lane hook stays dormant unless `KAOLA_LANE_CONTAINMENT` is set,
matching canonical behavior.

**Payload-field adaptation (verified against kimi-code 0.26.0).** Kimi's hook payloads use
different field names than Claude's for two events, and an unadapted script would silently
fail-open on every trigger:

| Event | Claude payload | Kimi payload | Adaptation |
| --- | --- | --- | --- |
| `PreToolUse` Write\|Edit | `tool_input.file_path` | `tool_input.path` | write-lane accepts `file_path \|\| path` |
| `SubagentStart` | `agent_type` | `agent_name` | dispatch-log accepts `agent_type \|\| agent_name` |
| `PreToolUse` Bash | `tool_input.command` | `tool_input.command` | none — pre-commit stays byte-identical |
| `PostCompact` | `cwd` | `cwd` | none — compact-context stays as-is |

The generator applies these as anchored single-string rewrites (`HOOK_ADAPTATIONS` in
`scripts/sync-kimi-edition.js`) and marks the two adapted files with a
`# kimi-edition: payload-adapted copy` header; a drifted canonical anchor is a hard error
at generation time, never a silently unadapted hook. The K7 test block re-derives the
expected bytes from canonical + adaptation and functionally probes the generated
write-lane with a Kimi-shaped payload through a staged gate window (deny = exit 2).

**Event-mapping note (`PostCompact`).** Kimi has no `SessionStart"compact"` event;
`PostCompact` is its semantic counterpart — it fires *after a compaction completes* rather
than at a session start that follows a compact. For the resume-state injection the
compact-context script performs, this is the accepted mapping (recorded in
[D-703-01](decisions/D-703-01.md)); the semantic difference is deliberately surfaced here
rather than hidden.

**Hooks are global regardless of install scope.** Kimi reads `[[hooks]]` **only** from the
global `${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml` — there is no project-scoped hooks
config. A project-level (`--target`) install therefore still merges the hooks block into
the **global** config, so installing the kimi edition into one repo activates the hooks for
every Kimi session on the machine. This differs from opencode (whose hooks plugin loads
from the project `.opencode/` tree or the global config dir) and from Claude Code
(per-project `settings.json`). The scripts themselves operate on the current working
directory at runtime, so their effect stays project-scoped; only the activation surface is
global. Skip the merge (and the hook/support scripts) with `--no-scripts`.

**Managed block.** The installer substitutes `__KIMI_HOME__` with the resolved kimi home and
merges the fragment into `config.toml` between the marker comments
`# >>> kaola-workflow kimi hooks` / `# <<< kaola-workflow kimi hooks` — idempotent, exactly
one managed block on re-install. Post-merge the config is validated with
`kimi doctor config` when a `kimi` binary is on PATH; a validation failure restores the
pre-merge config and aborts non-zero.

## Script resolution coupling

Workflow commands invoke `scripts/kaola-workflow-*.js` through a `kaola_script()` locator.
The kimi edition rewrites the canonical Claude resolver to a **kimi-native** form at
generation time: it searches `./scripts/` and
`${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts/` — self-repo first
(`./scripts/` wins when the cwd's `package.json` name is `kaola-workflow`), kimi-home copy
first in consumer projects. There is **no** `$CLAUDE_PLUGIN_ROOT` and **no** `~/.claude/`
token anywhere in the generated tree (the kimi twin of the opencode #544 path-leak fix).

- **Self-dev (this repo)** — `package.json` name is `kaola-workflow`, so `./scripts/`
  resolves first. Nothing else needed; the edition works in place.
- **Consumer project** — `install-kimi.sh` copies the support scripts (the
  install-manifest `--forge=github --scripts` set, 27 scripts) plus the 3 hook scripts to
  `${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/{scripts,hooks}/` (a path
  `kaola_script()` already searches), so commands resolve without editing them. Skip with
  `--no-scripts`.

## Install (into a project)

`install-kimi.sh` is a standalone, additive installer (it does not modify `install.sh` or
`install-opencode.sh`):

```bash
./install-kimi.sh                         # adaptive-core only (default)
./install-kimi.sh --with-fast             # also deploy kaola-workflow-fast
./install-kimi.sh --with-full             # also deploy kaola-workflow-phase1..5
./install-kimi.sh --with-fast --with-full # deploy everything
./install-kimi.sh --target /path/to/repo  # deploy into a specific project
./install-kimi.sh --global                # skills → ${KIMI_CODE_HOME:-~/.kimi-code}/skills (all projects)
./install-kimi.sh --regenerate            # refresh in-repo .kimi/ from canonical
./install-kimi.sh --uninstall             # remove the kaola-deployed edition (see Uninstall)
```

Add `--yes` for non-interactive use. The default install deploys the **adaptive-core**
command skills only (5); `--with-fast` / `--with-full` add the fast / full-phase command
skills (see
[Installer command-set partition](#installer-command-set-partition--with-fast---with-full)).
The opt-in is recorded in the shared `~/.config/kaola-workflow/config.json`
`installed_paths` and is preserved across re-installs (UNION, never removes).
`--enable-adaptive` is retired and accepted-but-ignored.

### Deploy layout — project vs global (scope-dependent)

Kimi resolves skills **differently by scope**, so the installer deploys to a scope-correct
location:

| Scope | Deploy root for skills | Hooks block merged into |
| --- | --- | --- |
| `--target` (project, default `$PWD`) | `<project>/.kimi-code/skills/<name>/SKILL.md` | the **global** `${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml` regardless (see [Hooks](#hooks)) |
| `--global` | `${KIMI_CODE_HOME:-$HOME/.kimi-code}/skills/<name>/SKILL.md` — **directly** under the kimi home | same |

Support scripts + hook scripts **always** land under the kimi home (user-level, shared by
every project): `${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/{scripts,hooks}/`.

## Uninstall

```bash
./install-kimi.sh --uninstall                 # remove from the current project
./install-kimi.sh --uninstall --target DIR    # remove from a specific project
./install-kimi.sh --uninstall --global        # remove the global kimi-home install
```

`--uninstall` removes **only** kaola-deployed artifacts from the resolved scope, by
source-tree filename (never a blind `rm` of a dir you may share): the deployed skills, the
support/hook scripts under `${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/`, the
managed hooks block in `config.toml`, and a **surgical** reset of `installed_paths:[]` in
the shared `~/.config/kaola-workflow/config.json` (`parallel_mode` and the file itself are
kept, so a co-installed Claude/Codex/opencode edition is unaffected). Your own Kimi
`config.toml` content outside the managed block is **preserved**. A subsequent bare install
then deploys the adaptive-only default — the uninstall→reinstall round-trip is verified by
`test-kimi-edition.js` **U1**.

> `uninstall.sh` (the claude/codex/gitlab/gitea uninstaller) is **forge-scoped** and does
> not touch kimi — Kimi Code is an additive runtime, not a forge (D-530-02 precedent), so
> its removal lives in `install-kimi.sh --uninstall`, which owns the deploy layout.

Then in Kimi Code:

```
/workflow-init
/workflow-next
```

## Develop / regenerate

```bash
node scripts/sync-kimi-edition.js --write   # regenerate .kimi/ from canonical
node scripts/sync-kimi-edition.js --check   # parity assert: skills + hooks fragment
node scripts/test-kimi-edition.js           # full structural + parity + route-reachability suite
```

The validator is self-contained (run directly with `node`; it is intentionally **not**
wired into `package.json`'s `test` chain, to keep the change additive — the D-530-02
opencode precedent).

## How it differs from the opencode edition

| Aspect | opencode edition | kimi edition |
| --- | --- | --- |
| Delivery | `opencode.json` + `.opencode/agent` + `.opencode/command` | `.kimi/skills/<name>/SKILL.md` tree + managed `[[hooks]]` block in `config.toml` |
| Roles | named agent definitions (Markdown frontmatter) | **role-contract Skills** (`kaola-role-*`); dispatch uses built-in `coder`/`explore` subagents |
| Models | two tiers as reasoning-effort variants of your inherited model (`mapTier`, provider-adaptive) | **one tier — every subagent inherits the session model** (Codex inherit precedent); planner tier is metadata only |
| Hooks | TS/JS adapter plugin feeding the shell scripts | TOML `[[hooks]]` in the **global** `config.toml` running the same shell scripts directly |
| Config seeded | project (or merged global) `opencode.json` with variant definitions | none — model choices stay in the user's own Kimi config |

## Verification

The edition is covered by `scripts/test-kimi-edition.js` (**545 assertions**), which
regenerates the tree itself (`--write`) before asserting:

- **K1 — count/structure parity:** exactly 11 command skills + 16 `kaola-role-*` skills;
  every `SKILL.md` carries `name` + `description`; role skills are named `kaola-role-*`.
- **K2 — no transform residue:** no `{X_MODEL}` placeholders, no `model="{`, no "MUST pass
  `model=`" prose, no `,,` collapse artifacts; `--runtime kimi` present.
- **K3 — byte-parity:** regenerating from canonical reproduces the committed tree
  (`--check` zero diff).
- **K4 — zero Claude leakage:** no `$CLAUDE_PLUGIN_ROOT`, no `Opus`/`Sonnet` proper nouns,
  no `.claude` token anywhere — one scoped exemption: `workflow-init` keeps only the
  canonical `.claude/rules/` target-project scaffold references (the same lines the
  opencode edition preserves); every generated `kaola_script()` resolver is the
  kimi-native `${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts` form.
- **K5 — dispatch-card rewrite:** per-command, in-order card parity — read-only roles →
  `explore`, write roles → `coder` (kind map computed from canonical), every card invoking
  its matching `kaola-role-<role>` Skill, no dangling role-Skill references, and
  `workflow-next`'s prose scout dispatch rewritten to `explore` + `kaola-role-issue-scout`.
- **K6 — reviewer behavior identity:** `code-reviewer` / `adversarial-verifier` /
  `security-reviewer` keep their deterministic normalized behavior identity (role,
  `behavior_contract_version`, `behavior_contract_hash`, core bytes) through the kimi
  render.
- **K7 — hooks:** the generated fragment carries the four `[[hooks]]` entries with legal
  event names; pre-commit is byte-identical to canonical, while write-lane/dispatch-log
  equal canonical with exactly the pinned payload-field adaptation applied (see
  [Hooks](#hooks)) — including a functional probe that pipes a Kimi-shaped
  `tool_input.path` payload through the generated write-lane inside a staged gate window
  (deny = exit 2).
- **K8 — route reachability:** every receipt-emitted command target resolves under
  `.kimi/skills/`.
- **P0–P4 / U1 / A1 — installer contract:** partition exhaustiveness (canonical commands ==
  adaptive-core ∪ fast ∪ full, fail-closed on a new command); default/`--with-fast`/
  `--with-full` deploy sets; re-install idempotency (exactly one managed hooks block);
  `--uninstall` zero-residue; zero Claude-path leaks across the **deployed** tree. Each
  sub-case runs the real `install-kimi.sh` hermetically — its own temp `HOME`, temp
  `KIMI_CODE_HOME`, and temp `--target`, so the real `~/.kimi-code` is never touched — and
  `kimi doctor config` validates the merged config where a kimi binary exists.

The existing `test-route-reachability.js` / `validate-vendored-agents.js` /
`validate-script-sync.js` / `test-edition-sync.js` suites and the four `npm test` forge
chains stay green — this edition adds a surface without altering the others.
