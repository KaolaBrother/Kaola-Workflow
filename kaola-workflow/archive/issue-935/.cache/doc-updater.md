# doc-updater report — issue #935 (tier move: build-error-resolver, adversarial-verifier → reasoning)

No `RECEIPT-STALING EDIT` in this pass. No `BLOCK`. No file was edited by me — the sweep found
nothing left stale beyond what was already done before I started.

## 1. Verified the "ALREADY DONE" list

All four claims checked out against the actual worktree diff (`git diff` against the pre-#935 tree):

- **`CHANGELOG.md`** — `[Unreleased]` carries `### Changed` (the tier move, with the Claude/Codex/
  opencode/Kimi per-runtime consequences spelled out and the cost tradeoff stated) and `### Removed`
  (the `install.sh` `default_agent_model()` fallback, with the drift it had already accumulated:
  standard for `code-architect`/`code-reviewer`/`security-reviewer`, which the canonical map had
  already resolved to reasoning). Correct and complete.
- **`README.md:152` / `:156`** — role table `Tier` column for `build-error-resolver` and
  `adversarial-verifier` now reads `reasoning`. Correct.
- **`README.md` badge-visibility lists (~`:209-215`)** — both roles moved out of the
  Sonnet-dispatched (silent) list into the Opus-dispatched (badged) list, which now reads
  `planner`, `synthesizer`, `code-architect`, `code-reviewer`, `security-reviewer`,
  `build-error-resolver`, `adversarial-verifier` — 7 entries. Correct.
- **`docs/opencode-edition.md:122-123`** — "five" → "seven" and the enumerated list now reads
  `adversarial-verifier`, `build-error-resolver`, `code-architect`, `code-reviewer`, `planner`,
  `security-reviewer`, `synthesizer` (alphabetical, 7 entries). Correct. I also checked the
  `opencode.json` scaffold comment and commented-out `agent.<role>` block (not in your list, but
  the same fact) — both already carry the same 7-role list, consistent with the doc.

## 2. Sweep for remaining stale role→tier statements

Grepped the whole repo (`build-error-resolver`, `adversarial-verifier`, `tier`, `standard`,
`reasoning`, `default_agent_model`, plus the exact phrase pairs `<role> ... standard` /
`standard ... <role>`) across every `*.md` file, then read every hit in context. Files checked in
full or by grep-with-context: `README.md` (all ~30 tier/reasoning/standard hits), `docs/api.md`,
`docs/architecture.md`, `docs/conventions.md`, `docs/opencode-edition.md`, `docs/kimi-edition.md`,
`docs/README.md`, `docs/workflow-state-contract.md`, `docs/decisions/*.md` (all 60 files, 0001-0017
+ every `D-*-01.md`), `templates/axioms.md`, `templates/routing/*.skeleton.md`, `commands/*.md`,
`kaola-workflow/ROADMAP.md`, `kaola-workflow/.roadmap/*.md`.

**Nothing else needed a change.** Every remaining mention of "standard"/"reasoning" tier language is
one of:

- Generic tier **mechanics** (the fixed pair mapping: `standard`→`gpt-5.6-sol`/`medium`,
  `reasoning`→`gpt-5.6-sol`/`xhigh`), never role membership — e.g.
  `docs/api.md:1533-1541`, `docs/architecture.md:345-348`, `docs/conventions.md:45-50`,
  `templates/routing/{next,finalize}.skeleton.md:6-12`. These are true before and after #935 and
  needed no edit.
- A **different sense of "tier"** entirely — priority-label tiers (`docs/api.md:1513-1518`,
  `README.md:1108-1128`, `templates/routing/init.skeleton.md:181`), which have nothing to do with
  agent model classification.
- Role **capability** language that happens to name one of the two roles but says nothing about its
  tier — e.g. `templates/routing/init.skeleton.md:162` and `finalize.skeleton.md:88,107` route
  build/type/lint failures to `build-error-resolver` by function, not by tier.
- **Historical decision records** (`docs/decisions/D-*.md`) narrating a role's behavior or a past
  incident at the time it happened — none asserts a *current* tier fact for either role. The closest
  candidate, `docs/decisions/D-687-01.md:93` ("the standard-tier temporary override introduced by
  #924 are retired"), is itself already describing a retirement that predates and is unrelated to
  #935 — nothing to update.
- `install.sh`'s removed `default_agent_model()` — I grepped for any remaining prose reference to it
  outside `CHANGELOG.md`'s own new entry (which correctly describes it in the past tense as removed)
  and found none.

I ran `node scripts/generate-routing-surfaces.js --check` as a cross-check on the skeleton-derived
surfaces: **all 18 surfaces byte-match the skeleton** — confirms the rendered command/SKILL surfaces
agree with the skeletons I read, so there is no divergence to report there either.

## 3. Verdict on `docs/api.md` and `docs/architecture.md` — AGREE, no change

Read both in full around every tier-related passage
(`docs/architecture.md:300-348`, `docs/api.md:1520-1542`). Both describe **only the tier→pair
mapping** — `standard` always resolves to `gpt-5.6-sol`/`medium`, `reasoning` always resolves to
`gpt-5.6-sol`/`xhigh`, and that the mapping itself is fixed and unconditional. Neither file
enumerates *which* roles sit in which tier — that enumeration lives solely in `README.md`'s role
table (per `docs/conventions.md:215`: "the Agent/Tier table, which is **not** machine-checked — keep
it in step by hand", already done in item 2 above) and the code-level constant tables (off-limits to
me, already updated per your ALREADY DONE list / the diff I inspected).

Your reading is correct: #935 changed a mapping's **input** (which roles select `reasoning`), not
the **mapping** itself. `docs/api.md` and `docs/architecture.md` describe the mapping, so they are
unaffected and need no edit. No `RECEIPT-STALING EDIT` applies.

I separately confirmed `docs/api.md`'s test coupling: `scripts/test-forge-finalize-findings.js` and
`scripts/test-run-chains.js` read it, but only for the finding-type table/counts, which #935 does not
touch — moot here since I made no edit, but noted for completeness. `docs/architecture.md` is
explicitly asserted "inert narrative" (content-invisible to validation) by
`scripts/test-validation-allowband.js:108`.

## 4. Deliberately left alone

- **`kaola-workflow/archive/**`** (754 files matching `build-error-resolver`/`adversarial-verifier`)
  and **`docs/investigations/**`** (85 files matching tier language) — per your instruction, these
  are historical run/design records and I did not open or touch any of them. I did not read them
  individually; the grep counts above are presence-checks only, not a claim that any given hit is
  "wrong" — they are simply out of scope.
- **`kaola-workflow/ROADMAP.md`** and **`kaola-workflow/.roadmap/issue-935.md`** — these are the
  live run/plan record for this very issue (the `next_step` field narrating stages A1-A10). They
  accurately describe the work as planned and are orchestrator-owned per `CLAUDE.md`'s Durable State
  Contract ("do not hand-edit the mirror"), not a product-doc surface — I read them for scope
  confirmation but made no edit.
- **A judgment call beyond your two named exclusions**: `docs/audits/opencode-edition-audit.md`
  (dated 2026-06-19, self-marked "Superseded (#927, 2026-08-03)" on the passage I checked) and
  `kaola-workflow/.origin/dead-exports-audit.md` + `kaola-workflow/.origin/877/*.md` (dated
  investigation snapshots pinned to a specific commit) are the same *kind* of artifact as
  `docs/investigations/**` — dated, point-in-time records where a retroactive edit would falsify
  what was true when written — even though they don't live under that literal path. I applied the
  same "don't rewrite a historical record" principle and left them alone. I checked their
  `build-error-resolver`/`adversarial-verifier` hits and none of them asserts a *current* tier fact
  (they describe roles by function/behavior in a past investigation, not by tier), so nothing there
  would have needed a fix even if in scope. Flagging this as a judgment call for your confirmation,
  since it extends your stated exclusion list rather than following it literally.

## Files changed by me

None. Everything the "ALREADY DONE" list claimed was verified correct, and the sweep found no
additional stale surface to fix.

## Commands run

- `git status`, `git diff CHANGELOG.md README.md docs/opencode-edition.md install.sh opencode.json`
- Targeted `grep -rn` sweeps (role names, `tier`, `standard`, `reasoning`, `default_agent_model`)
  across `*.md`, scoped away from `kaola-workflow/archive/` and `docs/investigations/` for the
  "still stale" pass, then re-run without that scoping to confirm the excluded-path hit counts
  reported in §4.
- `Read` on `docs/architecture.md:290-359`, `docs/api.md:1500-1550`, `docs/conventions.md:195-259`,
  `docs/kimi-edition.md:75-144`, `README.md:139-220`, `README.md:780-846`, `agents/*.md` frontmatter
  (read-only, off-limits to edit), `scripts/kaola-workflow-resolve-agent-model.js` (read-only, grep
  for the two roles' entries — `opus` confirmed for both).
- `node scripts/generate-routing-surfaces.js --check` → "all 18 surfaces byte-match the skeleton".
- `grep -rln ... kaola-workflow/archive/ docs/investigations/ | wc -l` — presence counts only, to
  report scope, not content review.
