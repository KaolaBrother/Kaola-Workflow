# Documentation update pass — bundle-952-953-954-955

Worktree: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955
No files were edited or committed by this pass (verification-only pass — see per-item findings
below; nothing required a change beyond what the orchestrator already wrote).

## Commands run

```
git status
git log --oneline -5
git diff --stat HEAD
git diff docs/architecture.md docs/README.md docs/decisions/0017-the-mission-list.md
git diff agents/implementer.md agents/code-architect.md agents/planner.md
grep -rn -i "role pin|ROLE_PINS|consensus baseline|solution ladder" docs/ CHANGELOG.md
grep -n -i "solution ladder|minimalism|ROLE_PINS|test-agent-profile-parity|implementer|code-architect|planner" docs/api.md
grep -n -i "minimalism|simplest architecture|reuse or extend|ladder|ROLE_PINS|watch list|watch-list" README.md
grep -n "test-agent-profile-parity" docs/api.md docs/conventions.md docs/architecture.md README.md
grep -n "SELF_HOST_TEST_CONSUMED|TEST_CONSUMED_PATHS" scripts/kaola-workflow-adaptive-schema.js scripts/kaola-workflow-validation-runner.js
ls docs/audits/ && wc -l docs/audits/2026-08-11-subtraction-audit.md
```

## Checklist item by item

### 1. README.md (repo root) — NO IMPACT, verified

Read the full role table (`## Workflow roles`, lines 143-207) and grepped the whole file for every
term this bundle could have touched: `minimalism`, `simplest architecture`, `reuse or extend`,
`ladder`, `ROLE_PINS`, `watch list`/`watch-list` — zero hits. The role table lists only
`Agent | Role kind | Tier`; it carries no prompt-internal content (the new `## Solution ladder`
section, the two removed `code-architect` minimalism bullets, the `ROLE_PINS` mechanism, or the two
new ADR 0017 watch-list rows are all agent-facing / doc-internal, none of them README-facing). The
installed command surface (`/workflow-init`, `/workflow-next`, `/kaola-workflow-finalize`) and every
install path/flag in README are untouched by this bundle's diff. Confirmed no impact — no edit made.

### 2. docs/api.md — NO IMPACT, verified, NOT edited

Read the full section index (`grep -n "^##\|^#" docs/api.md`, 60 sections: Claim API, Finalize
transaction, Validation, Sink API, Closure Contract, Worktree maintenance, Roadmap Operations,
Installation and edition sync, Configuration, Environment Variables, Module Exports). None of these
sections documents `agents/*.md` prompt content, `test-agent-profile-parity.js`'s `ROLE_PINS`
mechanism, or the ADR 0017 watch list. The only hit for `implementer|code-architect|planner` in the
whole file is line 1067-1069, and it is about a *retired attestation field*
(`claim_planner_attested`, dropped with `checkDispatchAttestations`/`--attest-planner-spawn`) — an
unrelated, already-settled topic that this bundle does not touch. `docs/api.md` genuinely needs no
edit here, so per instructions I did **not** make one — the chain receipt this run just produced
stays valid; no re-run of the four validation chains is needed on this account.

### 3. Does any doc describe `ROLE_PINS` in a way the three new pins make stale? — NO IMPACT, verified

Two doc sites describe the `ROLE_PINS` mechanism, and both describe it *generically* (the design
rule, not an enumeration of current pins), so neither is stale:

- `docs/conventions.md:344-348` — "A threshold cannot see a rule beneath its bar. … a small
  reciprocal obligation gets an explicit pin (`ROLE_PINS`), never a derivation." This is a policy
  statement about *why* `ROLE_PINS` exists as a mechanism; it names no specific pin and needed no
  update.
- `docs/conventions.md:311` (the "Aiming a guard" table) — cites `test-agent-profile-parity`
  consensus specifically for the **test-custody** example ("test custody is shared by 2 roles —
  below the bar by construction, not by tuning"). That example is still true (test custody is still
  shared by exactly the same 2 roles, `implementer`/`tdd-guide`); the bundle's new pins are a
  *different* rule (the solution ladder's reuse rung, shared by 3 roles) and do not touch this row.

The three new `ROLE_PINS` entries (`planner`, `code-architect`, `implementer` — "Reuse or extend an
existing mechanism before writing a second one.") are self-documented in
`scripts/test-agent-profile-parity.js`'s own header comment (lines 56-67), which I read and confirms
the count and reasoning (3 of 11 profiles, below the 2/3 consensus threshold, matches
`docs/conventions.md:311`'s existing test-custody precedent for *why* a pin is used instead of
derivation). No doc surface needed a change on this account.

## Verification of the three sections the orchestrator already wrote (not rewritten, checked against
## the diff and against source I read)

- **CHANGELOG.md `[Unreleased]`** — read in full (lines 1-98). Cross-checked against
  `git diff agents/{implementer,code-architect,planner}.md`: the described `## Solution ladder`
  section (5 rungs: nothing / what is already here / standard library / a dependency the project
  already installs / minimum code that works) matches the actual added prose byte-for-byte in intent
  and matches across all three files. Cross-checked the `#953` claim that `code-architect` lost two
  minimalism bullets ("choose the simplest architecture that meets the requirement",
  "avoid speculative abstractions unless the repo already uses them") against the diff — confirmed,
  both lines were removed from `### 2. Architecture Design`. No inaccuracy found; not edited.
- **docs/architecture.md** — read the new `### Runtime capability divergence` subsection and the
  repointed `### Model resolution` paragraph via `git diff`. Table structure (5 rows × 4 runtime
  columns, tier-label-plus-pointer cells) matches the CHANGELOG's `#955` description. No inaccuracy
  found; not edited.
- **docs/README.md** — read the new sub-pointer under `## Core` → `- [Architecture]`. It points at
  `architecture.md#runtime-capability-divergence`, which matches the actual new heading slug in
  `docs/architecture.md`. No inaccuracy found; not edited.
- **docs/decisions/0017-the-mission-list.md** — read the two new watch-list rows via `git diff`.
  Matches the CHANGELOG's `#954` description (subagent-never-receives-a-project-rule row;
  agent-held-a-rule-in-context-and-did-not-follow-it row, citing `#524`). No inaccuracy found; not
  edited.
- **docs/audits/2026-08-11-subtraction-audit.md** — confirmed the untracked file exists (240 lines,
  17607 bytes) and opens with the "Report-only. No cut is applied by this audit." framing the
  CHANGELOG's `#952` entry describes. Per explicit instruction, its findings (including the two
  named-stale lines: `docs/README.md`'s opencode index line and `docs/conventions.md`'s
  `FEATURE_TOKENS` paragraph) were **not** acted on — left exactly as the audit left them.

## Files edited by this pass

None. Every checklist item resolved to "no impact" or "already accurate, verified only."

## BLOCK

None hit.
