# Code review: #1059 frozen candidate

## Verdict

**PASS**

- `findings_blocking`: 0
- reviewed_sha: `e6c1d809e245c50da04e876e3eab14169a19b1ee` (`e6c1d809`)
- base: `main` `cc1c9a2e34a70e9af8f430dd3edfcb57b1c9842b` (`cc1c9a2e`)
- branch: `docs/retire-reviewer-heavy-escalation`
- commits reviewed:
  - `a5c005f5fa104b9222ab1e0e14b60be0aa72e370` — ADR 0019 retirement draft
  - `e6c1d809e245c50da04e876e3eab14169a19b1ee` — 8/10/140 + remaining acceptance
- `git merge-base main HEAD` equals `main` (`cc1c9a2e34a70e9af8f430dd3edfcb57b1c9842b`)
- `git diff --check main...HEAD` clean (exit 0)
- `git diff --stat main...HEAD`: 14 files, +127 / −83. No template, agent-body, routing-skeleton, or generated-surface edits.

Unpushed branch, no PR, and no sink-merge are runner constraints and are not findings.

`npm test` and `node scripts/simulate-workflow-walkthrough.js` were not run (later mission). `node scripts/generate-agent-profiles.js --check` was treated as an already-recorded fact, not re-executed.

## Findings

None.

## Acceptance against rewritten #1059

### 1. ADR 0019 retirement record — holds

`docs/decisions/0019-the-heavy-reasoning-tier.md` on `e6c1d809` vs `main`:

- Status remains **Accepted** for the three-tier model. A 2026-09-11 partial-supersession note records reviewer→Heavy/`fable` re-dispatch as **retired** since #1032 / `7e116d6c`, Yanlei confirmation, and the orchestrator-does-the-hard-work rationale (header lines 3–9 and 17–20).
- §3 heading is now “Role defaults (reviewer→heavy escalation retired)”. Planner-class (`planner`, `code-architect`) remains the only frontmatter heavy default. Reviewer-class stays at reasoning with **no** workflow-owned reviewer→`fable` path. The former “one sanctioned escalation” is labeled Retired (lines 62–80). On `main` this section still described current re-dispatch.
- §2 three-tier matrix is byte-unchanged vs `main` (Claude `fable` / Codex historical Sol/high / Grok `xhigh` / Cursor `grok-4.6[effort=xhigh]`). The #1049 current-mapping note is unchanged.
- §4 measurement table is unchanged; a following paragraph now states the grok/cursor no-per-call-override rows are capability measurements, not a remaining named escalation divergence (lines 100–103).
- §5 keeps the reviewer scope clamp and adds “Retired as an upgrade trigger”: the clamp is not an auto-escalation clause and must not restore reviewer→`fable` re-dispatch (lines 115–118). On `main` §5 had no such retirement.
- §6 first bullet is now “No runtime carries a workflow-owned reviewer→heavy escalation (retired 2026-09-11)” instead of “grok and cursor cannot escalate dynamically” as a live named divergence.
- §7 watch-list items for auto-escalation inspectors and extra-role escalation are marked superseded / do-not-rebuild, not as work to add.
- §8 blast-radius sentence now says the former escalation carve-out is retired rather than listing it as current skeleton content.

Heavy remains planner-class in live sources (unchanged by this candidate): `templates/agents/behavior-contracts.json` `planner` and `code-architect` are `intent_class: heavy`; `agents/planner.md` and `agents/code-architect.md` have `model: fable`; `agents/code-reviewer.md` remains `model: opus`.

### 2. Escalation surfaces not restored — holds

`git diff --stat main...HEAD -- templates/ agents/ commands/ plugins/ .cursor/ .claude/` is empty.

Grep of `templates/routing/` (`finalize.skeleton.md`, `next.skeleton.md`, `dispatch-contract.md`) found no `fable` / `escalat` / reviewer-heavy upgrade. `dispatch-contract.md` still has the existing cost sentence and no auto-escalation.

`templates/agents/behavior-contracts.json`: `fable`/`escalat`/`upgrade`/`re-dispatch` are absent from role bodies. Reviewers stay `reasoning`; only `planner` and `code-architect` are `heavy`.

`templates/agents/runtime-capabilities.json`: the only `fable` hits are the Claude heavy-tier model token (`"heavy": "fable"`), not a reviewer upgrade path.

No new inspector for the retirement. The only test edit is assertion-message wording in `scripts/test-runtime-agent-architecture.js` (A6/A9 “seven” → “eight” families). The asserts already compared `declaredRuntimes` to the eight-name `RUNTIME_NAMES` roster (`claude` … `devin`); this is not an escalation inspector.

### 3. Live edition/index leftovers — holds

On `main`, `docs/README.md` ADR 0019 blurb, `docs/grok-edition.md`, and `docs/opencode-edition.md` still treated “one bounded `fable` escalation” / “omit Claude’s one-bounded reviewer heavy re-dispatch” as current. On `e6c1d809` those sentences say the carve-out is **retired** (ADR 0019 / #1059) and that there is no workflow-owned fable escalation to omit or mirror.

Live-doc grep for `bounded reviewer`, `one-bounded`, `omit Claude`, `dynamic reviewer`, `reviewer heavy` as current behavior: remaining hits are ADR 0019’s retirement record, CHANGELOG `[Unreleased]`, the annotated #1018 historical paragraph, and archive. `docs/cursor-edition.md`, `docs/kimi-edition.md`, `docs/zcode-edition.md`, `docs/devin-edition.md`, `docs/architecture.md`, `docs/api.md` (aside from unrelated classifier `escalate` tokens), and `docs/conventions.md` do not treat bounded reviewer escalation as current.

### 4. Live 8/10/140; historical 7/9/126 annotated — holds

Manifest on disk (`agents/generated-agent-manifest.json`, unchanged by this candidate): 14 roles, 8 runtimes (`claude`, `codex`, `opencode`, `kimi`, `grok`, `cursor`, `zcode`, `devin`), 10 variants, 140 profiles (14×10). `scripts/generate-agent-profiles.js:703` (also unchanged) prints `agent profiles current: 14 roles, eight runtimes, 140 native renders`. Recorded in `kaola-workflow/issue-1059/.cache/docs.md` as `--check` exit 0.

Live docs updated from 7/9/126 to 8/10/140 (or equivalent): `docs/architecture.md` (families/adapters/renders plus the “installed file” runtime count), `docs/agents-source.md`, `docs/runtime-capabilities.md`, `docs/api.md` (126-render → 140-render; five → six additive generators), `docs/conventions.md`. Grok/OpenCode/Cursor `install-all.sh` “seven-runtime sequence” → “eight-runtime sequence”; ordinals still match `install-all.sh` (`RUNTIMES=(claude opencode codex kimi grok cursor zcode devin)`; grok is the fifth leg, cursor the sixth; comment lines 111–112).

Historical annotate-not-rewrite:

- ADR 0020 inventory paragraph keeps seven families / nine adapters / 126 renders, with a 2026-09-11 / #1059 note that live inventory is eight / ten / 140. Consequences “nine adapter variants” keeps the then-current number plus “Later inventory: ten adapter variants / #1059.”
- CHANGELOG `[10.0.0]` #1033 census keeps 7/9/126 with an at-10.0.0 / later Devin 8/10/140 annotation.
- CHANGELOG `[9.15.0]` #1018 keeps the then-current bounded-`fable` shipping sentence, with a later #1032/`7e116d6c` + #1059 retirement note.

### 5. CHANGELOG `[Unreleased]` — holds

`CHANGELOG.md` lines 3–16 record both the ADR 0019 retirement (Yanlei 2026-09-11, #1032/`7e116d6c`, Heavy stays planner-class, surfaces not restored) and the live 8/10/140 correction with historical 7/9/126 kept annotated.

## Out of scope (not findings)

Follow-ups B–E (telemetry retire, compact dual-load measurement, optional elapsed/tokens, extra cost-language sentence) are recorded in `kaola-workflow/issue-1059/.cache/follow-ups.md` and were not landed. Per the rewritten issue they must not fail this candidate.

Required `npm test` / walkthrough receipts belong to the next mission.

## Observations (non-blocking)

1. ADR 0022 body still says “Declare the nine real host surfaces” (`docs/decisions/0022-machine-global-workflow-contract.md:20`) without the annotate-not-rewrite note used on ADR 0020/0021. This is a different census from 8/10/140. The candidate did update the live API row to nine local surfaces / ten receipt rows, which matches `templates/global/runtime-contract-adapters.json` (10 targets; `cursor-cloud` is the remote row). Not named in #1059 item 4.

2. ADR 0024 still mentions “126 renders” in a #1054 validator paragraph. That is a historical ADR, not a live inventory page, and was not in the named drift list.

3. ADR 0019 §1 still narrates the original habit as “the top tier is the escalation.” That is the 2026-08-24 problem statement, not a current-behavior row. Item 1 named §3 / §5 / validation rows, which were rewritten.

## How this was established

- `git rev-parse HEAD` = `e6c1d809e245c50da04e876e3eab14169a19b1ee`
- `git log --oneline main..HEAD` = `e6c1d809`, `a5c005f5` only
- `git diff main...HEAD` for all 14 paths; `git show --stat` on each commit
- GitHub issue #1059 body (rewritten 2026-09-11) and owner comment `issuecomment-5632815442`
- File reads of ADR 0019 (HEAD vs `main`), ADR 0020, CHANGELOG `[Unreleased]` / 10.0.0 / 9.15.0, edition docs, templates, reviewer/planner frontmatter
- Grep of live `docs/` and `templates/` for leftover escalation-as-current and 7/9/126-as-current
- Python count of `agents/generated-agent-manifest.json`: 14 / 8 / 10 / 140

finding: none
verdict: PASS
findings_blocking: 0
reviewed_sha: e6c1d809e245c50da04e876e3eab14169a19b1ee
