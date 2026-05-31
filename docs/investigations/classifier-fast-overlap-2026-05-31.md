# Design: Classifier fast-project overlap parity (#207)

Date: 2026-05-31
Status: Accepted — implemented in 3.17.2. Format decision: reuse the `Write Set:`
convention in the `fast-summary.md` `## Scope` section; classifier reads that
section only.
Issue: #207 — `scanClaimedOverlap` ignores `fast-summary.md` → wrong-GREEN parallel-overlap for fast projects

## Problem

`scanClaimedOverlap` builds a *claimed* project's in-flight file-set by reading
`phase3-plan.md` + `phase1-research.md` only (`scripts/kaola-workflow-classifier.js:212-218`).
A fast-path project never produces those files — its only file-set-bearing
artifact is `fast-summary.md`. So a claimed fast project contributes an **empty
claimed set** and its in-flight files are invisible to overlap detection.

Consequence: a candidate issue whose paths overlap a fast project is classified
**GREEN**, while the byte-identical overlap with a *full* project is correctly
**RED**. GREEN is exactly the signal that tells the agent it may skip the manual
overlap check, so this is a dangerous false-negative on the primary startup
route (`/workflow-next` → `Parallel decision`). Uniform across all 4 editions
(root, codex byte-identical, gitlab, gitea); pre-existing, not from #201/#203/#205.

## Root cause, precisely

The bug is **not** that the classifier lacks a parser for an unstructured field.
`extractFilePaths` is a prose-tolerant regex grep (`classifier.js:97-107`); the
phase files it reads today are *also* freeform prose (e.g. phase3's
`- Write Set: path/to/file, path/to/test-file`, `commands/kaola-workflow-phase3.md:176`).
The bug is simply that the scanner is **never pointed at the fast project's
artifact**. The fix is parity, not a new format.

This corrects the issue's framing that "a structured, machine-parseable field is
*necessary*." It is not necessary — the existing extractor already greps
path-like tokens out of prose. What *is* required is (a) pointing the scanner at
`fast-summary.md`, and (b) guaranteeing real repo paths actually land in the
section the scanner reads (today the Scope placeholder is `[files changed, ...]`,
which an agent may fill with pathless prose).

## Convention decision: reuse `Write Set:`, not `touches:`

Two path-declaration conventions already exist, and both are read by the same
`extractFilePaths`:

- **`touches:`** — author-declared paths in an *issue / `.roadmap` body* (the
  *candidate* side, and the OFFLINE roadmap path). `normalizeRepoPath` strips a
  leading `touches:` (`classifier.js:82`); gitlab/gitea tests use
  `body: 'touches: .../scripts/new-file.js'`. This is a **candidate-side / body**
  convention.
- **`Write Set:`** — planned files in a *claimed-project artifact*
  (`phase3-plan.md:176`, phase4 task rows, sink-merge architect docs). This is
  the **claimed-side / artifact** convention.

`fast-summary.md` is a claimed-project artifact and is the fast analogue of
`phase3-plan.md`. The idiomatic, lowest-redundancy choice is therefore the
**`Write Set:`** convention — the same line phase3 already emits and the
classifier already greps. No new field semantics, no new parser. The fast
planner already produces this list ("files to touch — the declared write set",
`skills/kaola-workflow-fast/SKILL.md` Step 1).

## Design (5 surgical changes)

### 1. Classifier — read the `## Scope` section of `fast-summary.md`

In `scanClaimedOverlap`, for each active folder also read `fast-summary.md` and
append **only its `## Scope` section** to `combined` before extraction.
Extraction (`extractFilePaths` / `extractCoarseAreas` / `parseAreaLabelsFromText`)
is unchanged.

Scope-section-only (not whole-file) is deliberate: `fast-summary.md` accumulates
`## Implementation Evidence` (commands run, test-output summaries) and `## Review`
through execution. Those sections are *denser* with incidental path-tokens than
any planning prose, and reading them whole-file would manufacture false overlaps
→ over-RED, which blocks legitimate parallel work (a regression in the other
direction). `phase3-plan.md` does not have this problem because it is written
before execution. Restricting to `## Scope` makes the `Write Set:` line
load-bearing and keeps over-RED minimal.

Helper (shared, ~8 lines): `sectionBody(content, 'Scope')` returns the text
between `## Scope` and the next `## ` heading (or EOF).

Per-edition shape (must match each file's existing style):
- `scripts/` and `plugins/kaola-workflow/scripts/` — **byte-identical**
  (enforced by `validate-script-sync.js`; classifier is in `COMMON_SCRIPTS`).
  Uses `path.join(root, 'kaola-workflow', folder.project)`.
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
  and the gitea twin — use `folder.project_dir` and `combined += readFileSync(...)`.

The existing `anyClaimedAtPhaseLeTwo` flag (set when no `phase3-plan.md`) is
left unchanged: a fast project legitimately has no phase3, so treating it as
"phase ≤ 2" remains conservative and correct.

### 2. Fast template — declare the write set with `Write Set:` in `## Scope`

Change the `## Scope` body in **all** fast surfaces from the freeform
`[files changed, acceptance criteria]` placeholder to a structured, grep-ready:

```markdown
## Scope
- Write Set: path/to/file, path/to/test-file
- Acceptance: <command>
```

Surfaces (6 files): `commands/kaola-workflow-fast.md` + the gitlab/gitea command
twins, and `skills/kaola-workflow-fast/SKILL.md` × 3 editions. Instruct the skill
to write the `Write Set:` line when it **first creates `fast-summary.md`
(IN_PROGRESS)** from the planner's declared write set — not only at PASSED — so
the scope is visible to the classifier for the whole life of the claim.

### 3. Tests — fast-overlap coverage (currently zero), all 4 editions

Add to the walkthrough chain (root `simulate-workflow-walkthrough.js`, which
also drives the gitlab/gitea `test-*-workflow-scripts.js` via `run()`):
- **RED**: active fast project with `## Scope` `- Write Set: scripts/foo.js`;
  candidate issue body touching `scripts/foo.js` → expect `red` (was `green`).
- **GREEN**: same fast project; candidate touching a disjoint path → `green`.
- **Section isolation**: a path that appears only in `## Implementation Evidence`
  / `## Review` (not in `## Scope`) must **not** trigger overlap (guards against
  the whole-file over-RED regression).

### 4. Contract drift-guard — lock both sides (#203 pattern)

In `scripts/validate-workflow-contracts.js` assert:
- the fast command/skill `## Scope` contains the `Write Set:` token, and
- the classifier source reads `fast-summary.md`.

This makes the template↔classifier coupling un-droppable, matching the existing
`fast-summary.md` drift guards (validators lines 121-124).

### 5. Docs / CHANGELOG

- `README.md` parallel-classifier section: note fast projects' declared write set
  participates in overlap detection.
- `CHANGELOG.md`: entry under the appropriate version.

## Regression analysis

- **No new false-REDs from evidence/review noise** — Scope-section-only read.
- **Early-claim window is symmetric with full projects** — a fast project claimed
  before its planner returns (no Scope yet) contributes empty, exactly as a full
  project claimed before `phase1-research.md` exists does today. Not a new gap.
- **Over-RED is bounded and is the safe direction** — fast scope is ≤ 5 paths,
  single area.
- **Other `fast-summary.md` consumers unaffected** — `fast-audit` parses the
  compliance table + status; `repair-state` checks existence + status; neither
  reads `## Scope`. Adding a `Write Set:` line to Scope changes none of their
  inputs (verified against the fast-summary vocab-coupling surface).
- **root↔codex stay byte-identical** — same diff applied to both;
  `validate-script-sync.js` will catch drift.
- **Existing walkthrough GREEN assertions** — re-examine each after the change;
  any that encoded a fast-overlap-as-GREEN expectation was encoding the bug and
  should flip to RED, not be auto-preserved.

Verification gate: `node scripts/simulate-workflow-walkthrough.js` exits 0, and
`node scripts/validate-workflow-contracts.js` / `validate-script-sync.js` pass.

## Why this is minimal (no redundancy, no regression)

- **No new parser** — reuses `extractFilePaths`.
- **No new format** — reuses the existing `Write Set:` claimed-side convention.
- **No new data structure** — `fast-summary.md` is mutually exclusive with the
  phase files; this is a union read symmetric with the existing one.
- **~30 lines of classifier change across 4 editions + a template line + tests.**

## Out of scope (separate, shared limitation)

`extractFilePaths` only extracts tokens containing `/` (`classifier.js:104`), so
a repo-root file with no directory (e.g. `install.sh`) is invisible to overlap
detection. This is shared by the phase-file path and the fast path equally and
is not a fast-specific regression; track separately if it matters.

## Open decision for maintainer

The path-declaration **format** in `fast-summary.md` `## Scope` is the design
fork the issue flagged for maintainer input. Recommended: reuse `Write Set:`
(idiomatic, already parsed). Alternatives: a new `touches:`-style line (couples
to the candidate-side convention instead), or whole-file read (rejected:
over-RED from evidence/review sections).
