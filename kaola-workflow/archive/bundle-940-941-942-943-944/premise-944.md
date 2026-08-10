# Premise check — issue #944

> Codex ships the tier-to-effort mapping but not the role-to-tier membership, so the split is
> unreachable at dispatch

**Verdict in one line:** the *consequence* #944 reports is real and Codex-specific, but two of its
six supporting claims are wrong as written — the role→tier enumeration is **not** confined to an
uninstalled README, and one piece of TOML evidence is misattributed.

---

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow`, branch `main`, HEAD `d2ab06c2`.
  Working tree clean apart from this untracked run folder.
- Date of measurement: 2026-08-10.
- **No tracked file modified. Nothing under `~/.codex` modified.** This file is the only write.

### Tooling constraint honoured (this is the load-bearing methodology note)

`rg` is **not installed** on this box:

```
$ which rg
rg not found
```

`grep` in this shell is a **function wrapping ugrep**, and the memory-recorded hazard is that a
naive recursive `grep` over `~/.codex` — a dot-directory — can return silently empty and read as
confirmation. Every search below therefore used **`/usr/bin/grep` (BSD grep 2.6.0-FreeBSD)** driven
by an explicit `find … -print0 | xargs -0` file list, never a bare recursive walk:

```bash
$ command -v /usr/bin/grep && /usr/bin/grep --version | head -1
/usr/bin/grep
grep (BSD grep, GNU compatible) 2.6.0-FreeBSD
```

**A second trap fired during this investigation and is recorded because it produced a false
CONFIRMED.** The first whole-surface sweep was written as:

```bash
ROOTS="$HOME/.codex/agents $HOME/.claude/agents …"
find $ROOTS -type f -print0 | xargs -0 /usr/bin/grep -linE 'standard[- ]tier|…'
```

This shell is **zsh**, which does **not** word-split an unquoted `$VAR`. `find` received the whole
string as **one** path, matched nothing, and the sweep returned a single hit — which looked exactly
like "the enumeration is nowhere." Every sweep in this report was re-run under `bash -c` with a
proper array:

```bash
bash -c 'ROOTS=("$HOME/.codex/agents" "$HOME/…" …)
         find "${ROOTS[@]}" -type f -print0 | xargs -0 /usr/bin/grep -linE …'
```

The corrected sweep returned **22 files**. The uncorrected one returned 1. Claim 5 is REFUTED below
purely on evidence the broken form could not see.

### Installed Codex tree, enumerated first

```bash
$ find ~/.codex/plugins/cache -maxdepth 3 | grep kaola
/Users/ylpromax5/.codex/plugins/cache/kaolabrother-kaola-workflow
/Users/ylpromax5/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow
/Users/ylpromax5/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.5.5
```

- Exactly **one** cached version, `7.5.5` (the cache prunes). Directory mtime **Aug 9 16:03**.
- Skills: `skills/kaola-workflow-{next,init,finalize}/SKILL.md` — 3 files.
- Role profiles: `~/.codex/agents/kaola-workflow/*.toml` — **14 files**, mtime **Aug 10 18:24**,
  byte-identical to the 14 in `…/7.5.5/agents/` (`cmp -s` → IDENTICAL ×14).
- **Shadowing check:** `~/.codex/skills/` contains 14 entries, **none** named `kaola-workflow-*`.
  `find ~/.codex -type d -name 'kaola-workflow*'` returns no standalone skill dir. **No stale
  standalone skill shadows the plugin.**
- Managed-profile receipt `~/.codex/agents/kaola-workflow/.kaola-managed-profiles.json` declares
  `plugin_version 7.5.5`, `installed_at 2026-08-10T10:24:42Z`, 14 roles.

---

## Claim 1 — the installed skill instructs a per-spawn tier→effort mapping

**Verdict: CONFIRMED** (and it ships on *two* skills, not one).

```bash
$ diff <(sed -n '6,13p' templates/routing/next.skeleton.md) \
       <(sed -n '8,15p' ~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.5.5/skills/kaola-workflow-next/SKILL.md)
# (no output — identical)
```

Installed text, `…/skills/kaola-workflow-next/SKILL.md:5-16`:

```markdown
<!-- PIN: codex-dispatch-model-routing -->
## Codex Per-Spawn Model Routing

Keep every installed role's existing standard-tier or reasoning-tier classification, and set the
model and reasoning effort explicitly on each spawn. Standard-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "medium"`. Reasoning-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`.

These mappings are fixed for every spawn. Do not escalate, downgrade, or otherwise override a
standard-tier role's model or reasoning effort based on task breadth, latency, prior results, risk,
or any other condition. The role classification remains unchanged.
<!-- /PIN -->
```

Reinforced at `…/kaola-workflow-next/SKILL.md:246-249` (the `## Delegation` section):

> For every spawn, follow the Codex Per-Spawn Model Routing contract above and pass both `model`
> and `reasoning_effort` explicitly on the spawn call as the pair selected by the role's existing
> tier. Per-task model or reasoning-effort exceptions are not allowed.

**Amplification the issue omits:** the same PIN block also ships in
`…/skills/kaola-workflow-finalize/SKILL.md:8-14`. The instruction reaches the orchestrator on two of
the three installed Codex skills.

**Incidental defect noticed, out of scope, recorded not built:**
`…/kaola-workflow-next/SKILL.md:251-253` says *"The Codex Profile Freshness Gate above is
authoritative for profile availability"*. There is **no** section by that name anywhere in that
file — `grep -in 'profile freshness'` over all three installed skills returns exactly that one
self-reference. A dangling cross-reference, not a tier problem.

---

## Claim 2 — "No installed Codex surface says which roles are in which tier"

**Verdict: PARTIALLY-CONFIRMED.** True of every installed **prompt** surface. **False** of the
installed Codex tree as a whole: three installed Codex `.js` files carry the complete enumeration.

### 2a. Prompt surfaces — confirmed silent

```bash
$ S=~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.5.5/skills
$ /usr/bin/grep -rn -E 'resolve-agent-model|adaptive-schema|DEFAULT_AGENT_MODELS|CODEX_PINNED|REASONING_FLOOR' \
    "$S"/kaola-workflow-{next,init,finalize}/SKILL.md
NO MATCHES in any of the 3 installed Codex SKILL.md
```

No installed skill names a roster, a table, or a script that would produce one.

### 2b. Installed scripts — the enumeration IS there

```bash
$ bash -c 'ROOTS=("$HOME/.codex/agents" "$HOME/.codex/plugins/cache/kaolabrother-kaola-workflow" \
    "$HOME/.codex/kaola-workflow" …)
   find "${ROOTS[@]}" -type f -name "*.js" -print0 \
     | xargs -0 /usr/bin/grep -l "CODEX_PINNED_STANDARD_ROLES = Object.freeze"'
…/7.5.5/scripts/install-codex-agent-profiles.js
…/7.5.5/scripts/kaola-workflow-adaptive-schema.js
…/7.5.5/scripts/kaola-workflow-codex-preflight.js
```

All three define, verbatim:

```js
const CODEX_PINNED_STANDARD_ROLES = Object.freeze([
  'code-explorer', 'investigator', 'knowledge-lookup', 'tdd-guide', 'implementer',
  'doc-updater', 'metric-optimizer',
]);
const CODEX_PINNED_REASONING_ROLES = Object.freeze([
  'planner', 'code-architect', 'build-error-resolver', 'code-reviewer',
  'security-reviewer', 'adversarial-verifier', 'synthesizer',
]);
```

That is a **complete, current, 14-role, two-tier membership list, installed inside the Codex plugin
cache**, and it already reflects #935 (`build-error-resolver` and `adversarial-verifier` both in
REASONING). `git log -L` on that region shows it was last changed at `8f0b481d` (#797/#798/#799) —
#935 never touched it, because Codex already had them in the reasoning tier.

**Why a plain grep misses it, and why the issue's author plausibly did:** the tier lives in the
*constant name* on one line and the roles on the *next* line, so any line-oriented search for
"a role name near a tier word" returns nothing. Confirmed:

```bash
$ … | xargs -0 /usr/bin/grep -lE "code-explorer.*(standard|sonnet)|knowledge-lookup.*(standard|sonnet)"
…/.claude/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
…/7.5.5/scripts/kaola-workflow-resolve-agent-model.js
…/.config/opencode/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
…/.kimi-code/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
```

Four hits — and the three `CODEX_PINNED_*` files are **not** among them, despite carrying the same
information. A line-scoped grep is structurally blind to this shape.

### 2c. But nothing *emits* the tier

Both Codex consumers use the lists for a **union-membership existence check only** — never to
report which side a role is on:

`…/7.5.5/scripts/install-codex-agent-profiles.js:733` (and the identical
`kaola-workflow-codex-preflight.js:1705`):

```js
if (!CODEX_PINNED_STANDARD_ROLES.includes(role) && !CODEX_PINNED_REASONING_ROLES.includes(role)) {
  reasons.push(`role "${role}" has no Codex profile-tier policy`);
}
```

```bash
$ /usr/bin/grep -n "tier" …/kaola-workflow-codex-preflight.js
1706:    reasons.push(`role "${role}" has no Codex profile-tier policy`);
```

One hit in a 4000-line file. `CODEX_STANDARD_EFFORT` / `CODEX_REASONING_EFFORT` (`:89-92`) are used
at exactly one site each — `:1737`, classifying a legacy pinned profile — and never printed.

**So the honest statement of claim 2 is:** the membership ships, in machine-readable form, inside
the Codex plugin cache; nothing renders it, prints it, or points the orchestrator at it.

---

## Claim 3 — per-TOML match counts, and `^model|^reasoning_effort` finding nothing

**Verdict: CONFIRMED**, both halves, over exactly 14 files.

```bash
$ find ~/.codex/agents/kaola-workflow -maxdepth 1 -name '*.toml' | wc -l
      14
```

### Full per-TOML table

`A` = `/usr/bin/grep -c -E '^(model|reasoning_effort)'` (the issue's own pattern)
`B` = `/usr/bin/grep -ci 'tier'` (raw substring — see claim 4)
`C` = `/usr/bin/grep -ciE 'reasoning[- ]tier|standard[- ]tier|reasoning[- ]class|model tier|reasoning_effort|xhigh'` (model-tier self-declaration)
`M` / `E` = `^model *=` / `^model_reasoning_effort *=` (Codex's actual key names)

| TOML | A | B (raw "tier") | C (tier **declaration**) | M | E |
|---|---|---|---|---|---|
| `adversarial-verifier.toml` | 0 | 2 | **0** | 0 | 0 |
| `build-error-resolver.toml` | 0 | 0 | 0 | 0 | 0 |
| `code-architect.toml` | 0 | 0 | 0 | 0 | 0 |
| `code-explorer.toml` | 0 | 0 | 0 | 0 | 0 |
| `code-reviewer.toml` | 0 | 2 | **0** | 0 | 0 |
| `doc-updater.toml` | 0 | 0 | 0 | 0 | 0 |
| `implementer.toml` | 0 | 4 | **0** | 0 | 0 |
| `investigator.toml` | 0 | 0 | 0 | 0 | 0 |
| `knowledge-lookup.toml` | 0 | 0 | 0 | 0 | 0 |
| `metric-optimizer.toml` | 0 | 0 | 0 | 0 | 0 |
| `planner.toml` | 0 | 0 | 0 | 0 | 0 |
| `security-reviewer.toml` | 0 | 0 | 0 | 0 | 0 |
| **`synthesizer.toml`** | 0 | 2 | **2** | 0 | 0 |
| `tdd-guide.toml` | 0 | 0 | 0 | 0 | 0 |
| **totals (14 files)** | **0** | 10 | **2** | **0** | **0** |

`synthesizer`'s two, verbatim:

```
synthesizer.toml:2:  description = "… reasoning-class, held to a non-lowerable reasoning-tier floor, never invoked for cleanly-disjoint work."
synthesizer.toml:18: - You are reasoning-class and held to a non-lowerable reasoning-tier floor (REASONING_FLOOR_ROLES): the conflict path needs intent-level reasoning, so dispatch this role on a reasoning-tier model rather than a cheaper one.
```

Exactly as the issue states: reasoning-class + the non-lowerable floor. The other 13 → 0.

The same measurement over the plugin-cache copies `…/7.5.5/agents/*.toml` gives the identical 14×0
for `A`, and `cmp -s` proves all 14 pairs byte-identical.

### Note on the issue's grep pattern (it is sound, but narrowly)

Codex's key is `model_reasoning_effort`, **not** `reasoning_effort`. The issue's
`^model\|^reasoning_effort` still catches it — via the `^model` alternative, not the second one. An
author who wrote `^reasoning_effort` alone would have gotten a vacuous zero. Measured separately
(`M`/`E` columns above): both genuinely 0 across all 14.

### The mechanism that *forces* this zero — the issue does not mention it

Both installed Codex validators actively **forbid** those keys:

`install-codex-agent-profiles.js:736-737` / `kaola-workflow-codex-preflight.js:1708-1709`:

```js
if (modelLines.length > 0)  reasons.push("top-level 'model' must be omitted to inherit the parent session");
if (effortLines.length > 0) reasons.push("top-level 'model_reasoning_effort' must be omitted to inherit the parent session");
```

The 0/14 is **designed, not accidental**. Any fix that emits a tier into the TOMLs as `model =` /
`model_reasoning_effort =` would be rejected by the installer's own profile validator. (Stated as a
constraint on the remedy space, not as a remedy.)

---

## Claim 4 — `adversarial-verifier`'s "tier" hits are `verification tier` and review-scope prose

**Verdict: PARTIALLY-CONFIRMED — conclusion right, evidence misattributed.**

The conclusion (`adversarial-verifier.toml` carries no model-tier declaration) is correct: column C
is 0. But the stated evidence is wrong. Its two raw hits are:

```
adversarial-verifier.toml:58:- Obey the review scope the context assigns. During discovery, inspect the complete declared surface once and establish the full admitted counterexample frontier before returning.
adversarial-verifier.toml:62:- During closure, account for every prior finding identity as open or resolved, reproduce the prior frontier, and inspect the supplied repair delta. Emit repair regressions bound to that delta as canonical findings.
```

Both are the substring **`tier` inside `fron-tier`**. Neither is the phrase "verification tier",
and neither is even a use of the *word* "tier".

The phrase **`verification tier` is in `implementer.toml`**, not `adversarial-verifier.toml`, four
times (`:28`, `:33`, `:38`, `:41`), e.g.:

```
implementer.toml:28:3. Run the appropriate check and record it as your verification tier -- exactly one of:
```

`code-reviewer.toml`'s 2 hits are likewise both `frontier` (`:59`, `:60`).

So: three files (`adversarial-verifier`, `code-reviewer`, `implementer`) have a "different sense of
the word", and the issue attributed `implementer`'s sense to `adversarial-verifier` while missing
that `adversarial-verifier`'s own hits are not the word at all. Immaterial to the verdict; material
to whether a reader can re-derive it.

---

## Claim 5 — "The sole role→tier enumeration that exists anywhere is `README.md:143-158`"

**Verdict: REFUTED.**

The README part is right. `README.md:143-158` is a 14-row `| Agent | Role kind | Tier |` table, and
it is **not installed**:

```bash
$ bash -c 'ROOTS=(… all 11 installed roots …)
   find "${ROOTS[@]}" -type f -name "README*"'
(no output)

$ … | xargs -0 /usr/bin/grep -l "| Agent | Role kind | Tier |"
(none)
```

"Sole … anywhere" is false. A positive search across the whole installed surface plus the repo
finds **five distinct role→tier enumerations**, four of them installed:

| # | Enumeration | Form | In repo | Installed into Codex? | Agrees with README? |
|---|---|---|---|---|---|
| 1 | `README.md:143-158` | markdown table | yes | **no** | — |
| 2 | `CODEX_PINNED_STANDARD_ROLES` / `_REASONING_ROLES` in `kaola-workflow-adaptive-schema.js` | JS frozen arrays | yes | **yes** (`…/7.5.5/scripts/`) | yes |
| 3 | same two constants in `kaola-workflow-codex-preflight.js:79-86` | JS frozen arrays (own copy) | yes | **yes** | yes |
| 4 | same two constants in `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:78-85` | JS frozen arrays (own copy) | yes | **yes** | yes |
| 5 | `DEFAULT_AGENT_MODELS` in `kaola-workflow-resolve-agent-model.js:16-45` | JS object, `opus`/`sonnet` per role | yes | **yes** | see below |
| 6 | `agents/*.md` frontmatter `model:` (14 files) | YAML per-role | yes | **no — stripped at install** | yes |

Enumeration 6 is worth its own line. The repo's authored Claude agents carry the tier directly:

```
adversarial-verifier   model: opus        code-explorer      model: sonnet
build-error-resolver   model: opus        doc-updater        model: sonnet
code-architect         model: opus        implementer        model: sonnet
code-reviewer          model: opus        investigator       model: sonnet
planner                model: opus        knowledge-lookup   model: sonnet
security-reviewer      model: opus        metric-optimizer   model: sonnet
synthesizer            model: opus        tdd-guide          model: sonnet
```

…and `install.sh:261` erases it on the way out:

```js
const rewritten = source.replace(/^model:\s*\S+\s*$/m, 'model: inherit');
```

Measured on the installed side: **all 14** of `~/.claude/agents/*.md` read `model: inherit`.

### The installed enumeration is not merely present — it is *runnable*

`kaola-workflow-resolve-agent-model.js` has a CLI. Executed read-only, it emits the tier per role:

```bash
$ for r in code-explorer … metric-optimizer; do
    node ~/.config/opencode/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js "$r" --raw
  done
code-explorer sonnet | investigator sonnet | knowledge-lookup sonnet | planner opus
code-architect opus  | tdd-guide sonnet    | implementer sonnet      | build-error-resolver opus
code-reviewer opus   | security-reviewer opus | doc-updater sonnet   | adversarial-verifier opus
synthesizer opus     | metric-optimizer sonnet
```

A working, current, installed role→tier oracle exists on this box today. What does **not** exist is
anything telling a Codex orchestrator that it does.

### One installed Codex enumeration is STALE

```bash
$ cmp -s scripts/kaola-workflow-resolve-agent-model.js <each installed copy>
IDENTICAL  ~/.claude/kaola-workflow/scripts
DIFFERS    ~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.5.5/scripts
IDENTICAL  ~/.config/opencode/kaola-workflow/scripts
IDENTICAL  ~/.kimi-code/kaola-workflow/scripts
```

```diff
$ diff scripts/kaola-workflow-resolve-agent-model.js …/7.5.5/scripts/kaola-workflow-resolve-agent-model.js
-  'build-error-resolver': 'opus',
+  'build-error-resolver': 'sonnet',
-  'adversarial-verifier': 'opus',
+  'adversarial-verifier': 'sonnet',
```

The Codex plugin cache (mtime **Aug 9 16:03**, i.e. v9.5.5 / `660fec1d`) predates #935's merge
(`54cbe8d3`, Aug 10). The role TOMLs *were* refreshed today (Aug 10 18:24); the plugin cache was
not. So within one Codex install, two shipped enumerations now disagree about
`adversarial-verifier` and `build-error-resolver`: `CODEX_PINNED_*` says reasoning (correct),
`DEFAULT_AGENT_MODELS` says standard (pre-#935). Reinstalling the Codex plugin resolves it; this is
a resync fact, not part of #944's thesis, but it directly undercuts any remedy that would route the
orchestrator to `DEFAULT_AGENT_MODELS`.

Also measured: the repo's `plugins/kaola-workflow/scripts/` copies of both
`kaola-workflow-resolve-agent-model.js` and `kaola-workflow-adaptive-schema.js` are byte-identical
to `scripts/` — the drift is only between repo and installed cache.

---

## Claim 6 — `CODEX_PINNED_*` in `adaptive-schema.js`, unread by any Codex prompt surface, recorded dead

**Verdict: PARTIALLY-CONFIRMED.** Every sub-assertion holds under a precise reading; two would
mislead a reader taken loosely.

**(a) They live in `kaola-workflow-adaptive-schema.js` — CONFIRMED.**

```bash
$ /usr/bin/grep -n 'CODEX_PINNED_STANDARD_ROLES\|CODEX_PINNED_REASONING_ROLES' scripts/kaola-workflow-adaptive-schema.js
46:const CODEX_PINNED_STANDARD_ROLES = Object.freeze([
55:const CODEX_PINNED_REASONING_ROLES = Object.freeze([
1558:  CODEX_PINNED_STANDARD_ROLES,
1559:  CODEX_PINNED_REASONING_ROLES,
```

Also true — and unstated by the issue — that two *other* files carry independent copies, which is
what makes the constants reachable in the Codex tree at all (claim 2b).

**(b) "which no Codex prompt surface reads" — CONFIRMED, and stronger than stated.** No installed
Codex skill mentions the schema by name (claim 2a), *and* no Codex-side script requires it:

```bash
$ P=…/7.5.5/scripts
$ for f in kaola-workflow-codex-preflight.js install-codex-agent-profiles.js kaola-workflow-resolve-agent-model.js; do
    printf '%s adaptive-schema requires: %s\n' "$f" "$(/usr/bin/grep -c "require(.*adaptive-schema" "$P/$f")"; done
kaola-workflow-codex-preflight.js       adaptive-schema requires: 0
install-codex-agent-profiles.js         adaptive-schema requires: 0
kaola-workflow-resolve-agent-model.js   adaptive-schema requires: 0
```

The kernel *is* required by ten other installed cache scripts (`claim.js`, `run-chains.js`,
`sink-merge.js`, …) — none of which touches the pinned lists.

**(c) The audit "records them as having no shipping consumer" — CONFIRMED, but only of the
*split*, and only of the *kernel's* copies.** Exact lines from
`kaola-workflow/.origin/dead-exports-audit.md`:

`:100-101`
```
| `CODEX_PINNED_STANDARD_ROLES` | 88-96 | C | TEST-PIN ONLY — plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:494 (+5 more) |
| `CODEX_PINNED_REASONING_ROLES` | 97-105 | C | TEST-PIN ONLY — plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:497 (+5 more) |
```

`:313-314`
```
**20 whose only consumers are tests or contract validators.** These are C — a real file breaks if they go —
but the implementer should know none of them is read by shipping code:
```

`:327-330`
```
- **`CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES`** exist in the kernel *only* so the four
  contract validators can assert the kernel's copy equals `codex-preflight.js`'s and
  `install-codex-agent-profiles.js`'s copies. The kernel's copy is a third duplicate whose sole purpose is to
  be compared against the other two.
```

`:53`
```
| `CODEX_PINNED_STANDARD_ROLES`, `CODEX_PINNED_REASONING_ROLES` | `kaola-workflow-codex-preflight.js:4006`, `install-codex-agent-profiles.js:3033` | **local duplicates** (`codex-preflight.js:79/:83`; that file never requires the kernel). The kernel's copies are nonetheless live — the contract validators compare the two |
```

Two qualifications a careful reader needs:

1. The **local duplicates** in `codex-preflight.js` and `install-codex-agent-profiles.js` **are**
   live shipping consumers — they gate whether an installed profile is valid. It is the *kernel's*
   third copy that is test-pin-only.
2. Those live consumers read only the **union**
   (`if (!STANDARD.includes(role) && !REASONING.includes(role))`), never the **split**. So the
   issue's exact phrasing — *"no shipping consumer of the standard-vs-reasoning split"* — is
   **accurate**, and is the sharper claim.

Provenance caveat: the audit was written at commit `0532e684` (an ancestor of HEAD; `merge-base
--is-ancestor` → YES). `git log -L` over the pinned-list region shows no change since `8f0b481d`,
so the audit's finding is still current.

---

## The question #944 does not ask: is this gap Codex-specific?

**Answer: the *absence* is general; the *consequence* is Codex-only.** Two independent measurements.

### Measurement 1 — does any runtime's installed role definition carry a tier?

```bash
$ for f in ~/.claude/agents/*.md; do sed -n '1,25p' "$f" | /usr/bin/grep -E '^model:'; done
model: inherit     ← ×14, all identical
$ for f in ~/.config/opencode/agent/*.md; do sed -n '1,25p' "$f" | /usr/bin/grep -E '^(model|mode|reasoningEffort):'; done
mode: subagent     ← ×14; no model:, no reasoningEffort:
$ for f in ~/.kimi-code/skills/kaola-role-*/SKILL.md; do sed -n '1,25p' "$f" | /usr/bin/grep -E '^(model|reasoning|tier):'; done
(empty ×14)
$ for f in ~/.codex/agents/kaola-workflow/*.toml; do /usr/bin/grep -c '^model *=' "$f"; done
0 ×14
```

**No runtime's installed role definition carries a tier.** Claude's is authored (`model: opus`) and
stripped by `install.sh:261`; opencode's was removed on purpose (`162135a8 fix(opencode): remove
per-role effort tiering — subagents inherit the session's model and effort`); kimi never had one;
Codex's validator forbids it.

### Measurement 2 — does any runtime's orchestrator surface *demand* one?

```bash
$ for f in ~/.claude/commands/workflow-next.md ~/.config/opencode/command/workflow-next.md \
           ~/.kimi-code/skills/workflow-next/SKILL.md; do
    /usr/bin/grep -inE 'reasoning_effort|per-spawn|model routing|standard-tier|reasoning-tier|xhigh|gpt-5' "$f"; done
(no hits in any of the three)
```

Only Codex's skill asks the orchestrator to select a per-spawn model and effort. On the other three
runtimes the subagent inherits the session's model, so there is nothing to resolve and no gap.

**That is the precise shape of #944: it is not that Codex lost something the others kept. It is
that Codex is the only runtime whose prompt asks a question none of the four runtimes ships the
answer to.**

### Per-runtime table — what carries role→tier membership at dispatch

| Runtime | Installed role definitions | Tier in the role definition? | Orchestrator asked to pick a tier? | What (if anything) carries membership | Gap at dispatch? |
|---|---|---|---|---|---|
| **Claude Code** | `~/.claude/agents/*.md` ×14 | **No** — `model: inherit` ×14 (`install.sh:261` rewrites the authored `opus`/`sonnet`) | **No** — `~/.claude/commands/workflow-next.md` has zero model-routing prose | `~/.claude/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js` `DEFAULT_AGENT_MODELS` (installed, **current**); also `…/kaola-workflow-adaptive-schema.js` + `…-codex-preflight.js` `CODEX_PINNED_*` | **No** — nothing to resolve |
| **Codex** | `~/.codex/agents/kaola-workflow/*.toml` ×14 (+ byte-identical cache copies) | **No** — 0/14 `model=`, 0/14 `model_reasoning_effort=`; the installer *rejects* both keys. Only `synthesizer` says so in prose | **Yes** — `kaola-workflow-next/SKILL.md:5-16` + `:246-249`, and `kaola-workflow-finalize/SKILL.md:8-14` | `CODEX_PINNED_*` in 3 installed cache scripts (**current**) and `DEFAULT_AGENT_MODELS` in the cache's resolver (**stale, pre-#935**) — none rendered, printed, or referenced by any prompt | **YES — the question is asked, the answer ships only as unreferenced JS constants** |
| **opencode** | `~/.config/opencode/agent/*.md` ×14 | **No** — `mode: subagent` only; per-role effort tiering removed deliberately at `162135a8` | **No** — `command/workflow-next.md` has zero model-routing prose | `~/.config/opencode/kaola-workflow/scripts/` resolver (**current**) + `CODEX_PINNED_*` in its `adaptive-schema.js`/`codex-preflight.js` | **No** — by design |
| **Kimi Code** | `~/.kimi-code/skills/kaola-role-*/SKILL.md` ×14 | **No** — no `model:`/`tier:` frontmatter at all | **No** — `skills/workflow-next/SKILL.md` has zero model-routing prose | `~/.kimi-code/kaola-workflow/scripts/` resolver (**current**) + `CODEX_PINNED_*` in its two script copies | **No** — nothing to resolve |

### A related measured fact about the Codex dispatch hook

`~/.codex/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh:24-40` resolves and logs
`model_planned` per spawn — the closest thing to a tier carried *at* dispatch. It searches three
layouts in order. Measured on this box:

```bash
$ ls ~/.codex/kaola-workflow/scripts/
kaola-workflow-codex-compact-resume.js        ← candidate 1: resolver ABSENT
$ ls ~/.config/opencode/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
-rwxr-xr-x  19565  Aug 10 18:24                ← candidate 3: PRESENT
```

So a Codex spawn's `model_planned` is resolved through the **opencode** tree's copy. Two
consequences: (i) it works here only because opencode happens to be installed — on a Codex-only box
candidates 1-3 all miss and `model_planned` is silently empty (the hook is documented fail-open);
(ii) it fires at `SubagentStart`, i.e. **after** the orchestrator has already chosen the model, so
it records the intended tier rather than supplying it. It is a log, not a carrier.

---

## Summary of verdicts

| Claim | Verdict | Why |
|---|---|---|
| 1 — installed skill instructs per-spawn tier→effort | **CONFIRMED** | Text is byte-identical to `next.skeleton.md:6-13`; also ships in the finalize skill |
| 2 — no installed Codex surface says which roles are in which tier | **PARTIALLY-CONFIRMED** | True of every prompt surface; false of the tree — 3 installed `.js` files carry the full list |
| 3 — synthesizer 2, other 13 zero; no TOML sets model/effort | **CONFIRMED** | 14 files; C-column 2/0×13; `^model=` and `^model_reasoning_effort=` both 0/14. The installer *forbids* those keys |
| 4 — `adversarial-verifier`'s hits are `verification tier` + review prose | **PARTIALLY-CONFIRMED** | Conclusion right; both hits are actually `fron**tier**`, and `verification tier` is `implementer.toml`'s |
| 5 — the sole enumeration anywhere is the uninstalled README | **REFUTED** | README right; "sole" wrong — 5 more enumerations, 4 installed into Codex, one of them runnable |
| 6 — kernel constants unread, audit records them dead | **PARTIALLY-CONFIRMED** | Exact as worded ("no consumer of the *split*"); loosely read it hides two live union-membership consumers |

**The issue's headline holds.** Codex is the only runtime that asks its orchestrator to resolve a
role's tier per spawn, and no Codex prompt surface — nor anything a prompt surface points at —
supplies the answer. What the issue gets wrong is the scarcity: the membership is not confined to
an uninstalled README, it is installed three times over as JS constants that nothing renders.

---

## Open / not measured

- **Not measured: whether a Codex orchestrator would in practice find the constants.** It can read
  files, so the enumeration is reachable in principle; whether it does is behavioural, not
  measurable from the tree.
- **Not measured: `kaola-workflow-codex-preflight.js --doctor --json` actual output.** Determined
  by reading that the pinned lists feed only a membership check and that no code path prints a
  per-role tier. Running it was declined because it would execute against `~/.codex`, which this
  task forbids mutating and I could not prove read-only from inspection alone.
- **Not measured: the gitlab/gitea plugin twins.** `dead-exports-audit.md:402-403` records they
  carry the same `CODEX_PINNED_*` assertions; not independently verified here, and neither forge is
  installed on this box.
- **Not measured: whether the stale Codex plugin cache affects anything beyond
  `DEFAULT_AGENT_MODELS`.** Only `kaola-workflow-resolve-agent-model.js` was diffed across all four
  installed trees; a full cache-vs-repo diff was out of scope.
- **Flagged, out of scope:** the dangling "Codex Profile Freshness Gate" cross-reference at
  `kaola-workflow-next/SKILL.md:251-253` points at a section that does not exist in that file.
