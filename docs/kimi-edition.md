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
| `commands/<file>.md` | `.kimi/skills/<command>/SKILL.md` | Directory-form Skill (5 commands — canonical `commands/` shrank from 11 to 5 when the `fast`/`full` paths were retired, #725). Kimi auto-registers an activated directory skill as the slash command `/<name>`, so command skills keep their canonical basenames (`/workflow-next` works). Claude install-time `model="{...}"` placeholders and all "pass `model=`" instructions are rewritten to inherit-the-session-model prose; the canonical Path Intent section is stripped so adaptive is the unconditional default (see [Path selection](#path-selection--adaptive-is-the-unconditional-default) below). |
| `agents/<name>.md` | `.kimi/skills/kaola-role-<name>/SKILL.md` | Role-contract Skill (16 roles). Frontmatter is `name` + `description` only — **no `model:`/`tools:` fields**. Generated reviewers preserve their canonical normalized behavior core and identity; reviewer gate roles additionally carry their schema-2 identity — `behavior_contract_version` / `behavior_contract_hash` preserved from canonical and a fresh `resolved_profile_hash` re-stamped over the final kimi bytes — in a body `<!-- kimi-reviewer-identity -->` comment block, so the frontmatter stays `name` + `description` only. `agents/profiles/higher/` is skipped (meaningless under inherit). |
| `hooks/<script>.sh` | `.kimi/hooks/<script>.sh` | The 1 runtime-neutral hook script — payload-adapted at generation time where the Kimi payload field name differs (dispatch-log; see [Hooks](#hooks)). |
| `hooks/hooks.json` (the mapping) | `.kimi/hooks/kimi-hooks.toml` | The two canonical hook entries re-expressed as a Kimi `[[hooks]]` TOML fragment with a `__KIMI_HOME__` placeholder, merged by the installer into the global Kimi `config.toml` as a managed block (see [Hooks](#hooks)). `hooks.json` itself is Claude-shaped and is never copied. |

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

For the reviewer gate roles the transform also emits a `<!-- kimi-reviewer-identity:start|end -->`
comment block (body, column zero) holding `behavior_contract_version` /
`behavior_contract_hash` from the canonical frontmatter plus a fresh `resolved_profile_hash`
re-stamped over the final kimi bytes (the canonical Claude hash never binds post-transform
bytes — the opencode renderAgent discipline). At runtime `reviewerProfilePath` resolves the
kimi-native skill — project `<project>/.kimi-code/skills/kaola-role-<role>/SKILL.md` first,
then global `<kimi-home>/skills/kaola-role-<role>/SKILL.md`, then the self-dev canonical
path — while `detectReviewRuntime` recognizes the `<kimi-home>/kaola-workflow/scripts/`
install layout (realpath-compared, before the opencode pattern), so a review-gated plan
binds the kimi profile identity instead of hard-refusing `review_profile_unavailable`.

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
**adaptive-core** command skills — which, since canonical `commands/kaola-workflow-fast.md` and
`commands/kaola-workflow-phase{1..5}.md` were retired (#725; see `docs/decisions/D-725-01.md`), is
now all 5 surviving commands, not a subset. `install-kimi.sh` itself still parses
`--with-fast`/`--with-full` (unowned by this retirement pass — see the Known residual note in
`docs/decisions/D-725-01.md`), but the fast / full-phase command skills those flags used to add no
longer have a matching canonical source to deploy. **All 16 `kaola-role-*` skills are always
installed**:

| Flag | Command skills added | Recorded in `installed_paths` |
| --- | --- | --- |
| *(default, and currently the only reachable outcome)* | kaola-workflow-adapt, kaola-workflow-finalize, kaola-workflow-plan-run, workflow-init, workflow-next | `[]` |
| `--with-fast` | *(no matching canonical source — see above)* | `["fast"]` |
| `--with-full` | *(no matching canonical source — see above)* | `["full"]` |
| `--with-fast --with-full` | *(no matching canonical source — see above)* | `["fast","full"]` |

**No longer in lockstep with `install.sh`.** `install-kimi.sh` still records its opt-in flags into
the **shared** `~/.config/kaola-workflow/config.json` `installed_paths` field via a UNION
read-modify-write (implemented in **node**, not python3) — but `install.sh` itself no longer
participates in this union: since #725 it never writes `installed_paths` and strips any stale value
it finds on that shared file instead. A `--with-fast` recorded here is therefore visible only to
readers that still tolerate the field (e.g. the classifier's defensive parse); it grants no
capability, because there is no `fast` command left to reach.

**Reset to adaptive-only is real (not additive-only).** `copy_skills` is **self-healing**:
before re-copying it PRUNES every kaola-owned skill dir not in the EFFECTIVE opt-in set — a
no-op today (there is nothing beyond the 5 adaptive-core skills left to prune). `--enable-adaptive`
is retired and accepted-but-ignored (adaptive is always installed).

**The generator now emits only the 5 surviving commands.** `sync-kimi-edition.js` produces one
command skill per canonical `commands/*.md` file into the in-repo `.kimi/skills/` tree (the single
source the installer copies from); since canonical no longer has `kaola-workflow-fast.md` or
`kaola-workflow-phase{1..5}.md` (#725), the generator cannot emit skills for them regardless of any
install-time flag. The partition is still an **install-time** selection of which skills to COPY to
the user's dest; the test pins the partition as exhaustive over the surviving 5 — a new canonical
command unassigned to a partition still fails both the test and the installer (fail-closed).

## Hooks

Kimi's hook model is **TOML `[[hooks]]` rules in `config.toml`** — not Claude Code's
`settings.json` shell hooks, and not opencode's TS/JS plugin. The kimi edition ships the
**same runtime-neutral shell script** the other editions use (single source of truth)
plus a generated `kimi-hooks.toml` fragment that
re-expresses the two canonical `hooks/hooks.json` entries:

| Claude/Codex hook | Kimi `[[hooks]]` mapping | Script |
| --- | --- | --- |
| `SubagentStart` (dispatch attestation) | `event="SubagentStart"` (matcher omitted) | `kaola-workflow-subagent-dispatch-log.sh` |
| `SessionStart` compact (resume state) | `event="PostCompact"` | `node kaola-workflow-compact-context.js` |

The advisory pre-commit and write-lane hooks are retired across every edition — canonical
`hooks/` no longer ships either script, and the kimi edition carries no residual reference
to them. The surviving script stays fail-open everywhere (a missing script, malformed
payload, or non-git cwd never breaks the session).

**Payload-field adaptation (verified against kimi-code 0.26.0).** Kimi's hook payload uses
a different field name than Claude's for one event, and an unadapted script would silently
fail-open on every trigger:

| Event | Claude payload | Kimi payload | Adaptation |
| --- | --- | --- | --- |
| `SubagentStart` | `agent_type` | `agent_name` | dispatch-log accepts `agent_type \|\| agent_name` |
| `PostCompact` | `cwd` | `cwd` | none — compact-context stays as-is |

The generator applies this as an anchored single-string rewrite (`HOOK_ADAPTATIONS` in
`scripts/sync-kimi-edition.js`) and marks the adapted file with a
`# kimi-edition: payload-adapted copy` header; a drifted canonical anchor is a hard error
at generation time, never a silently unadapted hook. The K7 test block re-derives the
expected bytes from canonical + adaptation for every byte-copied/adapted hook script.

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

> The Kimi runtime is also covered by the top-level **`./install-all.sh`**
> ("install/refresh every runtime" — see [README](../README.md#installation)),
> which invokes this installer unchanged (`--global` by default) as the fourth
> leg of its four-runtime sequence. Kimi was historically the silently-dropped
> runtime on manual "reinstall the runtimes" passes; `install-all.sh` closes
> that gap with a per-runtime PASS/FAIL summary. It stays a thin orchestrator —
> it does **not** fold Kimi into `install.sh`/`edition-sync.js`/`npm test` (the
> additive-edition boundary, D-530-02, is preserved).


```bash
./install-kimi.sh                         # adaptive-core only (default, and currently the only outcome)
./install-kimi.sh --with-fast             # opt-in flag still parsed; no fast source left to deploy (#725)
./install-kimi.sh --with-full             # opt-in flag still parsed; no full-phase source left to deploy (#725)
./install-kimi.sh --with-fast --with-full # same as a bare install today
./install-kimi.sh --target /path/to/repo  # deploy into a specific project
./install-kimi.sh --global                # skills → ${KIMI_CODE_HOME:-~/.kimi-code}/skills (all projects)
./install-kimi.sh --regenerate            # refresh in-repo .kimi/ from canonical
./install-kimi.sh --uninstall             # remove the kaola-deployed edition (see Uninstall)
```

Add `--yes` for non-interactive use. The install deploys the **adaptive-core** command skills — all
5 that canonical still has; `--with-fast` / `--with-full` are still accepted (see
[Installer command-set partition](#installer-command-set-partition--with-fast---with-full)) but,
since the `fast`/`full` canonical command sources were retired (#725), have nothing left to add.
The flags still record their opt-in into the shared `~/.config/kaola-workflow/config.json`
`installed_paths` (UNION, never removes), even though the recorded value now grants no capability.
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

The edition is covered by `scripts/test-kimi-edition.js` (**440 assertions** — was 577 before the
`fast`/`full` P2/P3 installer probes and the stale "11" count references were retired alongside
their canonical sources, #725), which regenerates the tree itself (`--write`) before asserting:

- **K1 — count/structure parity:** exactly 5 command skills + 16 `kaola-role-*` skills;
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
  render. Each reviewer skill's re-stamped `resolved_profile_hash` verifies against its
  own bytes (exactly one hash line; never the reused Claude hash).
- **K7 — hooks:** the generated fragment carries the two `[[hooks]]` entries with legal
  event names; dispatch-log equals canonical with exactly the pinned payload-field
  adaptation applied (see [Hooks](#hooks)).
- **K8 — route reachability:** every receipt-emitted command target resolves under
  `.kimi/skills/`.
- **K9 — reviewer profile resolution end-to-end:** hermetic installs (real `install-kimi.sh`
  with temp `HOME` + `KIMI_CODE_HOME` + `--target`) prove a review-gated plan resolves the
  kimi-native reviewer SKILL.md — project candidate wins over global, global fallback when
  no project candidate exists, a stray `.opencode/agent/` profile never hijacks the kimi
  identity, and a typed `review_profile_unavailable` refusal when no kimi profile exists.
- **P0 / P1 / P4 / U1 / A1 — installer contract** (P2/P3, the `--with-fast`/`--with-full` opt-in
  deploy-set probes, were retired alongside their canonical sources, #725): partition
  exhaustiveness (canonical commands == adaptive-core exactly, fail-closed on a new command);
  default deploy set; re-install idempotency (exactly one managed hooks block);
  `--uninstall` zero-residue; zero Claude-path leaks across the **deployed** tree. Each
  sub-case runs the real `install-kimi.sh` hermetically — its own temp `HOME`, temp
  `KIMI_CODE_HOME`, and temp `--target`, so the real `~/.kimi-code` is never touched — and
  `kimi doctor config` validates the merged config where a kimi binary exists.

The existing `test-route-reachability.js` / `validate-vendored-agents.js` /
`validate-script-sync.js` / `test-edition-sync.js` suites and the four `npm test` forge
chains stay green — this edition adds a surface without altering the others.
