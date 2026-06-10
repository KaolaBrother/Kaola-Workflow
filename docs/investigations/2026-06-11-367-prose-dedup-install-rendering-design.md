# Design: deduplicate orchestration boilerplate via install-time partial rendering

**Date:** 2026-06-11
**Status:** Design (design-first deliverable for issue #367)
**Builds on:** install.sh's existing line-by-line command rendering (model-placeholder substitution,
`install.sh:522-559`); the #365 `sync:editions` generator (the natural render host); #276 (pin
fragility on cosmetic reflow).
**Sequencing:** the implementation tranche lands after #372 (which deletes a large slice of the
duplicated prose — the advisor gate sections — so rendering only the survivors avoids enshrining
soon-deleted text) and alongside/after #365 (the generator that renders the forge/codex copies).

---

## 0. Thesis

~25–35% of orchestrator-facing prose is restatement maintained in lockstep by hand, policed only by
token pins (which already broke once on cosmetic reflow, #276). Every wording change is an N-way
hand-edit, and the duplication inflates per-invocation context (~25k tokens of instruction prose for
a full adaptive run). install.sh ALREADY renders command files line-by-line at install time; extend
that to **shared partials expanded at install/sync time**, so the repo holds ONE copy of each block
and the *installed* artifacts stay self-contained (no runtime include machinery needed).

## 1. Dedup inventory (the exact set, with counts)

| # | Block | Copies | Where |
|---|---|---|---|
| D1 | `## Agent Model Badge` boilerplate | 27 | 9 command files × 3 editions |
| D2 | `kaola_script()` resolver one-liner (~450 chars) | 27 | inlined ~9× per edition |
| D3 | Validation Delegation Policy / Validation De-Duplication / Trivial Inline Edit Exception | ~27 | 9 files × 3 editions |
| D4 | Prompt Defense Baseline | 16 | 16 agent files (~1.8k words) |
| D5 | "decision:ask is audit metadata, not a gate" | ≥7 | scattered |
| D6 | worktree-resolution one-liner | 5 | scattered |

The implementation issue must re-run these counts at land time (D3 in particular shrinks after #372
removes the advisor-gate prose). D1+D2 are the **first tranche** (issue acceptance) — highest copy
count, most mechanical, and the source of the #344/#345 bugs (the one-liner was inconsistently
applied).

## 2. Mechanism — shared partials + an install/sync-time include directive

- **Partials live in `commands/_partials/*.md`** (and `agents/_partials/*.md` for D4). One file per
  block: `model-badge.md`, `kaola-script.md`, `validation-delegation.md`, `prompt-defense.md`, etc.
- **Include directive:** `{{> model-badge}}` on its own line in a command/agent file. At
  install/sync time the renderer replaces the directive line with the partial's contents (verbatim,
  preserving surrounding blank lines). The directive grammar is deliberately minimal — no
  parameters, no nesting in v1 (a partial may itself NOT contain a `{{> }}` directive; flat only).
- **Render host:** the SAME line-by-line pass install.sh already runs (`:522-559`, where model
  placeholders are substituted) gains a directive-expansion step. `sync:editions` (#365) renders the
  codex/gitlab/gitea copies from canonical through the identical expander (so partials are
  single-sourced across all four editions; the forge token-rename map applies AFTER expansion).
- **`_partials/` is NOT shipped** (added to an install-exclude list + `.npmignore`/`files` so the
  published plugin contains only rendered command/agent files — the directive never reaches a
  consumer machine).

## 3. The repo-readability tradeoff (the key decision)

Today "the command files ARE the documentation" — a reader opens `commands/kaola-workflow-plan-run.md`
and sees the final text. Two options:

- **Option A — directives in repo, rendered at install/sync.** The in-repo command file contains
  `{{> model-badge}}`, not the final badge text. *Pro:* one copy, zero drift by construction.
  *Con:* the repo file is no longer the final documentation; a reader must mentally expand
  directives (or read the rendered output under a consumer install).
- **Option B — rendered files in repo, validated against partials.** The in-repo command file keeps
  the final text; a `sync:editions --check` step (and a CI/contract assertion) re-expands the
  partials and asserts byte-equality with the in-repo rendered block. *Pro:* repo stays readable
  documentation. *Con:* the duplication still physically exists in-repo (but is now machine-enforced
  to match, eliminating the *drift* even if not the *bytes* — and per-invocation context is
  unchanged since the consumer still gets the full text either way).

**Recommendation: Option B for the in-repo command/agent files, Option A for the codex/gitlab/gitea
generated copies.** Rationale: the canonical command/agent files are the human-facing documentation
and the thing reviewers read in PRs — keep them final-text + machine-validated against the partials
(this directly fixes the #276 failure mode: the pin becomes "rendered == partial", which a cosmetic
reflow cannot silently break because the reflow must happen in the single partial). The generated
forge/codex copies are NOT primary documentation (they are mechanical ports) — render them from the
partials (Option A) so they cannot drift from canonical at all. This makes the per-invocation
context identical to today (consumers always get full text) while removing the N-way hand-edit.

## 4. Validator strategy

- Each block's token pins **move to the partial** (pin once, at the single source) where the pin is
  block-local (D1/D2/D4/D5/D6). A pin that asserts a token's presence *in a specific command file*
  becomes "the file includes `{{> name}}` (Option A copies) OR the rendered block matches the
  partial (Option B canonical)".
- New **render-parity assertion** in `validate-script-sync` / `sync:editions --check`: for every
  in-repo file with a partial-rendered block (Option B), re-expand and assert byte-equality; for
  every generated copy (Option A), assert the directive expands to the canonical partial. A planted
  1-char edit to a rendered block (not the partial) fails the chain — closing the #276 reflow gap
  permanently.
- D3 (multi-section policy blocks) stay token-pinned until #372 settles their final shape, then move
  to a partial.

## 5. Implementation order (incremental, per the issue)

1. **Tranche 1 (issue acceptance):** `kaola_script()` one-liner (D2) + `## Agent Model Badge` (D1).
   Create `commands/_partials/kaola-script.md` + `model-badge.md`; replace the 27+27 inline copies
   with rendered blocks (Option B canonical) / directives (Option A generated); add the render-parity
   assertion; confirm rendered output is byte-identical to today's text; all existing pins green.
2. Tranche 2: D4 (Prompt Defense Baseline, 16 agents) once `agents/_partials/` is wired.
3. Tranche 3: D5/D6 one-liners; D3 after #372.

## 6. Acceptance-of-design checklist (issue #367)

- [x] Inventory of the exact dedup set with counts — §1.
- [x] Chosen mechanism (partials + install/sync-time `{{> }}` expansion, reusing install.sh's
      line-renderer + #365's generator) — §2.
- [x] Repo-readability tradeoff decided (Option B canonical + Option A generated copies) — §3.
- [x] Validator strategy (pins move to partials; render-parity assertion closes the #276 gap) — §4.
- [x] Incremental implementation order (kaola_script + model badge first) — §5.

## 7. Non-goals
Runtime include support (consumers always get fully-rendered files); parameterized/nested partials
(flat, parameterless v1); deduping prose that is genuinely edition-specific (forge CLI names, MR vs
PR vocabulary — those are the token-rename map's job, not partials).
