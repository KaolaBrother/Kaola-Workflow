# Premise check — issue #946: `{INVESTIGATOR_MODEL}` is a dead placeholder

## VERDICT: QUALIFIED

The **mechanical claim is CONFIRMED and measured**: both registration sites exist at the exact
line numbers the issue cites, nothing consumes the placeholder, and removing both changes **zero**
rendered bytes (proven by an A/B install into two sandbox `$HOME`s, path-normalised hash-identical
across all 37 installed files).

It is **QUALIFIED, not CONFIRMED outright**, on three counts the issue gets wrong or understates:

1. **`{INVESTIGATOR_MODEL}` is not specially dead — 8 of the 11 registered placeholders are dead.**
   Only `TDD_GUIDE`, `BUILD_ERROR_RESOLVER` and `DOC_UPDATER` have a consumer. Singling out
   `investigator` misdescribes the shape of the thing.
2. **The issue's grep never looked at a skill surface, and missed two rendered command surfaces.**
   `skills/` does not exist at repo root (`git grep -- skills/` → exit 1, no matches); the real
   skill surfaces are `plugins/*/skills/`. It also omitted `plugins/kaola-workflow-{gitlab,gitea}/commands/`,
   which are rendered by the same installer. The conclusion survives both holes, but the method did
   not establish it.
3. **If "investigator's tier reaches no rendered surface" is the real assertion, that is REFUTED.**
   Investigator's tier reaches shipped bytes through **four** other carriers, none of which uses a
   `{*_MODEL}` placeholder. The placeholder is a *disused channel*, not the role's tier carrier.

---

## Setup

- Commit: `a339e5dfb816428f3c62e477ee1a8dcba53c409b` (branch `main`, clean apart from the untracked
  `kaola-workflow/bundle-945-946-947-948/`)
- Platform: darwin 25.6.0; `grep` is ugrep (dot-directory-skipping) — all repo searches used
  `git grep -P`; installed-tree searches used explicit absolute paths.
- Scratch mirror: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad/mirror946/`
  (`git archive HEAD` → `A/`, copy with the two lines deleted → `B/`). **No tracked file was edited.**

---

## 1. The two registration sites — CONFIRMED, line numbers have NOT drifted

### Site 1 — `model_for_placeholder()`, a lookup table (`install.sh:536-550`)

A bash `case` mapping placeholder name → resolved model string. Each arm delegates to
`resolve_agent_model_for_install <role>` (`install.sh:526-534`), which reads the **source** agent's
frontmatter `model:` via `extract_agent_model` and returns empty for `inherit`.

```
install.sh:544:    INVESTIGATOR_MODEL) resolve_agent_model_for_install investigator ;;
```

Full arm list, `install.sh:538-548`: `CODE_EXPLORER_MODEL`, `KNOWLEDGE_LOOKUP_MODEL`, `PLANNER_MODEL`,
`CODE_ARCHITECT_MODEL`, `TDD_GUIDE_MODEL`, `IMPLEMENTER_MODEL`, **`INVESTIGATOR_MODEL`**,
`BUILD_ERROR_RESOLVER_MODEL`, `CODE_REVIEWER_MODEL`, `SECURITY_REVIEWER_MODEL`, `DOC_UPDATER_MODEL`.

### Site 2 — `render_command_file()`'s `placeholders` array, the substitution list (`install.sh:565-609`)

```
install.sh:569:  local placeholders=(
install.sh:576:    INVESTIGATOR_MODEL
install.sh:581:  )
```

`render_command_file` reads each source line and, for every name in this array, tests
`[[ "$rendered" == *"{$placeholder}"* ]]`. On a hit it calls `model_for_placeholder` and substitutes.

### What each registration DOES, and what it costs

- **The array is the only thing that drives behaviour.** `model_for_placeholder` is called *only*
  from the array's loop (`install.sh:588`) — verified: no other call site exists in the repo.
  So `:544` is dead **because** `:576` is dead; it is not independently dead.
- **Cost of an unconsumed entry: nothing observable.** No warning, no failed substitution, no
  stdout/stderr line. It is a pure no-op — one extra `[[ == * ]]` substring test per placeholder per
  line, over 3 command files totalling 1086 lines per forge (~12k trivial bash tests). It never
  reaches `model_for_placeholder` because no line contains the token.
- **The pair is coupled, and a partial land IS harmful** (this is the #646 regression shape,
  `CHANGELOG.md:2245`):
  - name in the **array** but no **case** arm → `model` resolves empty → in a `model="{X}"` context
    the whole line is **silently dropped** (`install.sh:590-594`); in any other context install
    **exits 1** with `Install error: placeholder {X} resolved to empty (inherit) in a non-model context`
    (`install.sh:596-599`).
  - name in the **case** but not the **array** → never consulted; pure no-op.
  - name in **neither**, but present in a command file → the literal `{X_MODEL}` **ships
    unsubstituted** into `~/.claude/commands/`. Nothing catches this: `assertEveryDispatchHasModel`
    (`scripts/validate-workflow-contracts.js:70-84`) checks only that an `Agent(` block carrying a
    `subagent_type=` also carries *some* `model="{[A-Z_]+_MODEL}"` line — it never checks that the
    name is registered.

---

## 2. Full `{*_MODEL}` census — whole repo, all install scripts, agents, templates, dot-dirs

Command: `git grep -ohP '\{[A-Z_]+_MODEL\}' -- . | sort | uniq -c` (whole repo, 16 distinct names,
228 occurrences). The table below splits **live** surfaces from run-record/history residue.

### 2a. The 11 registered placeholders

| placeholder | case arm | array entry | live consumer files (rendered surfaces) | status |
|---|---|---|---|---|
| `CODE_EXPLORER_MODEL` | `install.sh:538` | `install.sh:570` | — | **DEAD** |
| `KNOWLEDGE_LOOKUP_MODEL` | `:539` | `:571` | — | **DEAD** |
| `PLANNER_MODEL` | `:540` | `:572` | — | **DEAD** |
| `CODE_ARCHITECT_MODEL` | `:541` | `:573` | — | **DEAD** |
| `TDD_GUIDE_MODEL` | `:542` | `:574` | `templates/routing/finalize.skeleton.md:101`; `commands/kaola-workflow-finalize.md:87`; `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:87`; `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:87` | LIVE |
| `IMPLEMENTER_MODEL` | `:543` | `:575` | — | **DEAD** |
| **`INVESTIGATOR_MODEL`** | **`:544`** | **`:576`** | **— (none anywhere outside run records)** | **DEAD** |
| `BUILD_ERROR_RESOLVER_MODEL` | `:545` | `:577` | `templates/routing/finalize.skeleton.md:110`; `commands/kaola-workflow-finalize.md:96`; gitlab `:96`; gitea `:96` | LIVE |
| `CODE_REVIEWER_MODEL` | `:546` | `:578` | — | **DEAD** |
| `SECURITY_REVIEWER_MODEL` | `:547` | `:579` | — | **DEAD** |
| `DOC_UPDATER_MODEL` | `:548` | `:580` | `templates/routing/finalize.skeleton.md:171`; `commands/kaola-workflow-finalize.md:155`; gitlab `:155`; gitea `:155` | LIVE |

**3 of 11 registrations are live. 8 are dead.** `{INVESTIGATOR_MODEL}` is one of the eight.

### 2b. Unregistered `{*_MODEL}` names appearing in the repo (no install.sh registration at all)

| placeholder | where it survives | live surface? |
|---|---|---|
| `{ISSUE_SCOUT_MODEL}` (39) | `docs/decisions/D-646-01.md:17,39,46`; `scripts/test-kimi-edition.js:606,609`; `scripts/test-opencode-edition.js:971,976,981`; `CHANGELOG.md:2245`; rest in `kaola-workflow/archive/` | **No** — retired; the tests assert its *absence* |
| `{X_MODEL}` (20) | `docs/decisions/D-646-01.md:36,58`; `docs/kimi-edition.md:332`; `scripts/test-kimi-edition.js:295,305`; `scripts/sync-kimi-edition.js:466`; `CHANGELOG.md:1907` | No — a *generic* token in prose/strip logic, never a real placeholder |
| `{ROLE_MODEL}` (5) | `scripts/sync-kimi-edition.js:319`; `scripts/sync-opencode-edition.js:336`; `docs/audits/opencode-edition-audit.md:62` | No — generic |
| `{WORKFLOW_PLANNER_MODEL}` (13) | `docs/decisions/0003-adaptive-front-end-planner.md:51`; rest archive | No — role retired |
| `{CONTRACTOR_MODEL}` (8) | `CHANGELOG.md:3559,3577`; rest archive | No — role retired |
| `{DOCS_LOOKUP_MODEL}` (4) | archive only | No |
| `{SYNTHESIZER_MODEL}` (1) | archive only | No |
| `{ADVERSARIAL_VERIFIER_MODEL}` (1) | archive only | No |
| `{INVESTIGATOR_MODEL}` (8) | `kaola-workflow/archive/bundle-940-941-942-943-944/*` (5) + `premise-943.md` (2) + `test-943.md` (1) | No — **all eight are this issue's own paper trail**, zero product surfaces |

### 2c. Surfaces searched and found CLEAN of any `{*_MODEL}`

`install-all.sh`, `install-opencode.sh`, `install-kimi.sh`, `uninstall.sh` (no placeholder machinery
of any kind — `install-opencode.sh`'s only `_MODEL` hits are the env pins
`KAOLA_OPENCODE_STANDARD_MODEL` / `_REASONING_MODEL`, which are not placeholders);
`agents/*.md` (14 files); `plugins/*/agents/*.toml` (14 × 3 — the "seventh propagation surface"
checked explicitly, zero hits); `templates/` outside `templates/routing/finalize.skeleton.md`;
`hooks/`; `commands/workflow-init.md`; `commands/workflow-next.md`; all `plugins/*/skills/`.

### 2d. Correction to the issue's own evidence

The issue's grep reproduces exactly (`2` each of `TDD_GUIDE`/`DOC_UPDATER`/`BUILD_ERROR_RESOLVER`),
but its pathspec is defective:

- **`skills/` matched nothing.** No `skills/` directory exists at repo root
  (`ls -d skills` → `No such file or directory`; `git grep -ohP ... -- skills/` → exit 1). The issue's
  conclusion "no command **or skill** surface renders investigator's tier" was never tested for skills.
- **`plugins/*/commands/` was omitted** — the gitlab and gitea rendered `kaola-workflow-finalize.md`
  copies. They carry the same three placeholders, so the conclusion survives; the method did not.

---

## 3. Installed trees — no unsubstituted `{INVESTIGATOR_MODEL}` ships anywhere

| tree | `INVESTIGATOR_MODEL` literal | any `{*_MODEL}` literal |
|---|---|---|
| `~/.claude/commands/` (3 files) | none | none |
| `~/.claude/agents/` | none | none |
| `~/.claude/skills/` | none | none |
| `~/.claude/kaola-workflow/hooks/` | none | none |
| `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.5.5/` | none | `{BUILD_ERROR_RESOLVER_MODEL}`, `{TDD_GUIDE_MODEL}` — **inside `scripts/validate-workflow-contracts.js:196,200` assertion strings only**, not prose delivered to a model |
| `~/.config/opencode/` | none | none |
| `~/.kimi/` | none | none |

Rendered proof that the live three DO substitute — `~/.claude/commands/kaola-workflow-finalize.md`:
`:87 model="sonnet"` (tdd-guide), `:96 model="opus"` (build-error-resolver), `:155 model="sonnet"`
(doc-updater). All three match `DEFAULT_AGENT_MODELS`.

The **"consequence: none at runtime" claim STANDS** — nothing leaks. (The `~/.claude/file-history/`
hits are Claude Code's own editor cache of a historical file, not a shipped artifact. The codex
plugin cache is at **7.5.5** while the repo is v9.5.5 — a stale cached version, noted but orthogonal.)

---

## 4. Does investigator's tier reach a rendered surface by another mechanism? YES — four carriers

This is where the issue's broader framing fails. `install.sh:390-395` (`install_managed_agent`)
rewrites **every** installed agent's frontmatter `model:` to `inherit`, so `agents/investigator.md:5`
(`model: sonnet`) never reaches the runtime as frontmatter. The tier is carried instead by:

1. **`scripts/kaola-workflow-resolve-agent-model.js:15` — `'investigator': 'sonnet'`**, plus its three
   byte-mirrors at `plugins/kaola-workflow{,-gitlab,-gitea}/scripts/kaola-workflow-resolve-agent-model.js:15`.
   This file is **installed as a support script** (`~/.claude/kaola-workflow/scripts/`), and its own
   header comment states the case outright: *"THIS MAP IS THE EFFECTIVE TIER OF EVERY INSTALLED AGENT…
   the frontmatter step below can never fire for an installed agent and resolution always lands here."*
   This is the live carrier. The placeholder is not.
2. **Codex SKILL tier tables — six shipped files**, `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-{next,finalize}/SKILL.md:13`:
   `Standard-tier roles: \`code-explorer\`, \`investigator\`, \`knowledge-lookup\`, …` inside the
   `<!-- PIN: codex-dispatch-model-routing -->` block. This is investigator's tier, by name, on a
   rendered surface — with no `{*_MODEL}` placeholder involved.
   (Note: the *installed* codex copy at 7.5.5 carries the PIN block but an **older wording without the
   per-role name lists** — the named-role lines are newer than the cached install. Repo-vs-installed
   divergence, same class as #944; out of scope here but recorded.)
3. **Derived tier machinery, by omission or by frontmatter**:
   `scripts/kaola-workflow-adaptive-schema.js:55-63` — `CODEX_PINNED_REASONING_ROLES` excludes
   investigator (→ standard, `reasoning_effort: "medium"`);
   `scripts/sync-opencode-edition.js:144-146,531-537` — tier derived from the agent frontmatter
   (`opus` → reasoning, else standard), so investigator → standard.
4. **`scripts/test-install-model-rendering.js:3046` — `investigator: 'sonnet'`** in the pinned
   `EXPECTED_ROLE_MODELS` table, asserted against what a fresh install RESOLVES; plus the
   human-facing tier column `README.md:146` (`| \`investigator\` | … | standard |`).

**Note the resolution path used by that test**: `resolveRole` (`test-install-model-rendering.js:3070-3072`)
shells out to `scripts/kaola-workflow-resolve-agent-model.js`, **not** to `model_for_placeholder`. So
even the tier-coverage test that #943 added does not consume the registration.

`investigator` is dispatched by name on **no** command surface — `git grep -n investigator --
commands/ templates/ plugins/*/commands/ plugins/*/skills/` returns only the six SKILL tier lines.
There is no `Agent(` block for it, so `assertEveryDispatchHasModel` never demands a `model=` line
for it either.

---

## 5. Would removing the two registrations change a rendered byte? MEASURED: NO

A/B legs, one axis (the two lines), install into isolated sandbox `$HOME`s:

| leg | tree | command | exit |
|---|---|---|---|
| A (pristine) | `mirror946/A` | `HOME=mirror946/homeA bash install.sh --yes --forge=github --no-settings-merge` | 0 |
| B (`:544` + `:576` deleted) | `mirror946/B` | `HOME=mirror946/homeB bash install.sh --yes --forge=github --no-settings-merge` | 0 |

| measurement | command | result | exit |
|---|---|---|---|
| installed file count | `find home{A,B}/.claude -type f \| wc -l` | 38 / 38 | 0 |
| path-normalised content hash of all 37 non-backup files | per-file `sed "s\|$HOME_leg\|HOME\|g" \| shasum -a 256`, then `diff` | **identical, no differences** | **0** |
| raw `diff -r` | `diff -r homeA/.claude homeB/.claude` | only `hooks.json` absolute paths and the backup filename timestamp — both a function of `$HOME`/clock, not of the change | 1 |
| `backups/.claude.json.backup.*` content | normalised `diff` | one line: `firstStartTime` timestamp (install-time clock) | 1 |
| stdout log | `diff out.A.log out.B.log` | only the `homeA`↔`homeB` path substring | 1 |
| render/tier test on leg B | `node scripts/test-install-model-rendering.js` | `Install model rendering tests passed` (16.4 s) | **0** |
| contract validator on leg B | `node scripts/validate-workflow-contracts.js` | `Workflow contract validation passed` | **0** |

**Conclusion: removing both registrations changes zero rendered bytes and breaks zero existing
assertion.** No test in `scripts/` references `INVESTIGATOR_MODEL`, `model_for_placeholder`, or the
`placeholders` array at all (`git grep -n 'model_for_placeholder\|placeholders=(\|INVESTIGATOR' --
scripts/` → no matches).

---

## Observations vs inferences

**Observations** (each reproducible by a command above): the two sites at `install.sh:544,576`; the
11-entry/3-consumer split; zero `{INVESTIGATOR_MODEL}` on any live product surface or in any
installed tree; byte-identical A/B installs; leg-B green on both the render test and the validator;
the four alternative tier carriers.

**Inferences**:
- *The registration is inert, not merely unused* — confidence **high**; refuted by any surface that
  ships a literal `{INVESTIGATOR_MODEL}` (none found, in repo or in four installed trees).
- *`:544` is dead only as a consequence of `:576` being dead* — confidence **high**; refuted by a
  second call site of `model_for_placeholder` (none exists).
- *Singling out `investigator` misdescribes the defect class; the same statement is true of 7 other
  roles* — confidence **high**; refuted by finding a consumer for any of `CODE_EXPLORER`,
  `KNOWLEDGE_LOOKUP`, `PLANNER`, `CODE_ARCHITECT`, `IMPLEMENTER`, `CODE_REVIEWER`, `SECURITY_REVIEWER`.
- *The registration list is best read as a "roles a command file MAY dispatch" capability surface,
  not as an inventory of live substitutions* — confidence **medium**; this is reading intent from
  shape, and the eight-way symmetry is the only evidence.

## Open / not measured

- Whether the 8-way deadness is deliberate (a standing capability surface) or accumulated residue is
  a **values** question about intent, not measurable here; the repo carries no ADR or comment stating
  either. Deciding it is the user's call.
- The repo-vs-installed divergence in the Codex SKILL PIN block (repo names the roles at `:13`; the
  installed 7.5.5 cache does not) was observed but not chased — it is a stale-cache/version question,
  not #946.
- No full four-chain run or walkthrough was executed; only the two directly relevant suites on leg B.
