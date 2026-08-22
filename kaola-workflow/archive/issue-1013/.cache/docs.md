# Issue #1013 documentation docking

## Scope and premise

- Read the live issue body and comments with `gh issue view 1013 --json number,title,body,comments,labels,state,assignees`.
- Reconciled the docs to the issue's shipped-intent contract and the concurrent suite premise: canonical standard/`sonnet` classes map to raw, unquoted `model: grok-4.6[effort=medium]`; reasoning/`opus` classes map to raw, unquoted `model: grok-4.6[effort=high]`; canonical class tokens remain the roster authority; generated Cursor `Task` cards omit per-call `model`; Cursor has no separate effort field.
- Kept the declared cold-start, one-family picker clamp, resume, and cloud/local limitations, with no workaround, config seeding, inline override, or second pin path.

## Documentation changes

Updated only these assigned documentation surfaces:

- `README.md` — replaced Cursor's inherit-only model/effort claims in the overview, runtime summary, installation/runtime paragraph, and Cursor section with generated medium/high frontmatter pins, model-free `Task` cards, and pointers to the declared runtime limits.
- `docs/README.md` — updated the Cursor edition index entry to describe canonical-class-derived unquoted medium/high frontmatter pins, model-free `Task`, and runtime limits.
- `docs/cursor-edition.md` — changed generated-agent output and model handling to the two raw frontmatter pins; documented canonical roster authority, fail-closed unknown classes, model-free `Task` dispatch, the `frontmatter_tier_pin` declaration, and the four runtime-limit/typed-deferral boundaries.
- `docs/architecture.md` — changed only the Cursor `model & tier handling` cell from `inherited` to `partial — docs/cursor-edition.md § Tiered frontmatter pins and runtime limits`. The runtime table remains tier-label-plus-pointer and does not restate the mechanism.
- `CHANGELOG.md` — added a concise `[Unreleased]` #1013 entry and reworded the historical initial-Cursor entry so the retired `CURSOR_RUNTIME_NATIVE.inherit_session_model` symbol is not presented as current.

## Deliberately unchanged surfaces

- `docs/api.md` — no API/export contract changed; the Cursor change is generator/edition behavior documented in the assigned README and Cursor edition docs.
- Environment/setup documentation — no dedicated environment-doc surface exists under `docs/`, and installer flags, paths, and environment variables are unchanged.
- Consumer-facing `CLAUDE.md`, `AGENTS.md`, canonical `templates/`, `commands/`, and `agents/` prompt surfaces — deliberately untouched; the vendor literals remain confined to the runtime-edition docs/changelog and generated implementation path.
- The concurrent `scripts/test-cursor-edition.js` edit belongs to the test custodian and was preserved; no production or test file was edited by this docs mission.

## Checks run

From `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1013`:

- `git diff --check` — PASS.
- Cursor-doc/index obsolete-claim scan for `inherit-only`, `One model tier`, `inherit_session_model`, and `model: inherit` — PASS (no Cursor-specific matches; the shared Kimi `inherit-only` entry is unrelated).
- Cursor-specific README/architecture/changelog scan for inherited model wording — PASS.
- Retired-symbol scan for `CURSOR_RUNTIME_NATIVE.inherit_session_model` and `Every subagent inherits the session model and effort` — PASS (absent).
- Canonical-surface safety check `git diff --name-only -- CLAUDE.md templates commands agents .cursor .grok` — PASS (no changed paths).
- `git status --short --branch` / `git diff --name-only` — documentation paths are exactly the five paths listed above; concurrent `scripts/test-cursor-edition.js` remains visible and unmodified by this mission.

## Remaining documentation risks

- The close evidence still depends on a fresh Cursor session and the implementation's generated tree; runtime family-clamp, resume-drop, and cloud/local behavior remain typed limitations rather than claims of universal live success. Run the Cursor edition suite and live close-evidence mission after the generator lands.
- The architecture pointer assumes the Cursor edition heading `Tiered frontmatter pins` remains stable; future heading changes should update that pointer rather than duplicating the mechanism in the table.
