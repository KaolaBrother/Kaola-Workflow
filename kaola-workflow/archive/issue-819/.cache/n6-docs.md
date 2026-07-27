evidence-binding: n6-docs 78609a6c6101
docs_updated: docs/api.md (new substitute-role reason-code subsection + corrected the two stale SPLIT_GUARDED_SUBCOMMANDS catalog lists), CHANGELOG.md (new [Unreleased] section with a #819 Fixed entry), docs/decisions/D-819-01.md (new decision record) — all three verified against the shipped diff, write set clean.
upstream_read: n1-surface c88971e73a76
upstream_read: n2-mechanism cb782b26822d
upstream_read: n4-scripts 62e0af8d9649
upstream_read: n5-prose 89e5dde2bea3

# n6-docs — recording the #819 mechanism as it actually landed

**task**: document the shipped #819 mechanism in `docs/api.md`, `CHANGELOG.md`, and a new
`docs/decisions/D-819-01.md` — names copied from the tree, not from the spec.

---

## Method: every name verified against the tree before being written into docs

Before writing anything I ran `git diff HEAD -- scripts/kaola-workflow-adaptive-node.js` myself (the
orchestrator's instructed first step) rather than trusting `n4`'s prose summary of its own diff, and
cross-read the unchanged surrounding code (`sed -n` over the full `runSubstituteRole` body, P1–P4,
`buildDispatch`, the `SPLIT_GUARDED_SUBCOMMANDS` / `REPLAN_GUARDED_SUBCOMMANDS` literals, the
`agent_type_frozen`/`role_substituted`/`role_substitution_basis` conditional-attach block, and
`DELEGATION_OUTCOME_VOCABULARY` in `kaola-workflow-adaptive-schema.js`) to confirm every refusal code,
field name, and constant name I documented is the literal identifier shipped, not a paraphrase. Every
code name, JSON field, and set member in the three files below is a substring match against that diff
or that surrounding read — I did not carry forward any name from `## Design` or the node briefs without
re-checking it against code.

## docs_updated

### 1. `docs/api.md` — three changes

**(a) The two stale subcommand-catalog enumerations (`n1` 5D, pre-existing drift, now corrected).**
Re-measured both lists against the shipped `SPLIT_GUARDED_SUBCOMMANDS` literal (16 members,
`scripts/kaola-workflow-adaptive-node.js:94-107`) rather than trusting `n1`'s line numbers, which had
already shifted:

- The `worktree_authority_split` reason-code bullet's subcommand list (previously 12 members) gained
  the 4 missing: `expand-open`, `expand-close`, `substitute-role`, `discard-speculative` — now 16,
  matching the code's declaration order exactly.
- The `scheduler.lock` section's `SPLIT_GUARDED_SUBCOMMANDS` enumeration (previously 12 members) gained
  the 4 missing there: `expand-open`, `expand-close`, `substitute-role`, `record-evidence` — now 16,
  same order.

Confirmed this drift predates #819 and #819 added no new member to either set — `substitute-role` was
**already** registered in both sets before this issue (per `n4`'s finding #3: "the other four
in-file registration lists `n1` PART 3 enumerated ... are correctly unchanged — `substitute-role` is
already a member of the two guard sets"). I did not touch `REPLAN_GUARDED_SUBCOMMANDS`: `docs/api.md`
never enumerates that set explicitly (confirmed by grep — zero hits), so there was no stale list to fix
there.

**(b) A new subsection, `### substitute-role — reason codes and evidence-body classification (issue
#798; recovery repair issue #819)`**, inserted between `record-evidence --verify` and
`--main-session-direct` (both existing subcommand-scoped subsections in the same style). `n1`/`n5` both
confirmed `docs/api.md` carried **zero** prior `substitute-role` material — this is the first entry, not
an amendment. Contents, each checked against the diff:

- A guard-order table: steps 0/1 (pre-existing) through **P0** (`substitute_self_noop`, NEW), P1–P4
  (unchanged refusal codes, now re-ordered above the replay branch — I verified this reordering by
  reading the diff's context, not by trusting the description), **P5a/P5b** (`substitute_node_closed`,
  P5b's classification NEW), and **C1** (`substitute_evidence_reset_failed`, NEW). Every refusal code in
  the table is a literal string copied from a `return refuse('...', {...})` call in the diff or the
  surrounding read.
- `classifyEvidenceBody(content, role)` → `'seeded' | 'capability_gap' | 'deliverable'` — the two marker
  regexes, the value-presence regex shared with `checkEvidenceShape`, and the "stamping the marker over
  real findings still classifies deliverable" behavior, all read directly off the shipped function body.
- The atomic reset paragraph: `seedEvidenceFile(..., forceRotate=true)`, the nonce-preservation rationale
  (verified against `readNonce`'s doc comment and the reset code path), `evidence_reset: true` on both
  the fresh-record (C3) and replay (C2) `ok` branches (confirmed both branches carry the field in the
  diff), and why no standalone reset subcommand exists (`substitute-role` already sits in both
  `SPLIT_GUARDED_SUBCOMMANDS` and `REPLAN_GUARDED_SUBCOMMANDS`).
- The `substitute_self_noop` paragraph: P0's position (above the replay branch), the revert-case
  consequence, and the accepted precedence trade (self-noop over unknown-role) — copied from the P0
  comment block in the diff.
- The task-identity paragraph: `codexTaskNameForNode(nodeInfo, dispatchRole)`'s new optional parameter,
  `buildDispatch` resolving the substitution before the task name, `dispatch.agent_type` (unconditional)
  versus `dispatch.agent_type_frozen` / `role_substituted` / `role_substitution_basis` (conditionally
  attached — confirmed by reading the `if (substitution) { d.agent_type_frozen = ... }` block directly,
  which is UNCHANGED by this diff but was never documented before), and the
  `dispatchSummarySegments`/`role=<role>` non-change (confirmed against `n4`'s "deliberate non-changes"
  claim by grepping the function myself — it still reads `d.role`, not `d.agent_type`).
- The close-time-asymmetry paragraph: `DELEGATION_OUTCOME_VOCABULARY`'s four-member closed vocabulary,
  confirmed present unchanged in `kaola-workflow-adaptive-schema.js:3489` (one line off `n2`'s cited
  `:3490` — I recorded the number I actually measured, not the one quoted upstream).

**(c) Nothing else in `docs/api.md` was touched.** I did not add `agent_type`/`agent_type_frozen` to the
`### opened payload — dispatch sub-object` "Stable field set" code block, even though that block is
missing them entirely (a #798-era gap, not a #819 one) — the two edits above cover the task-identity
derivation fully in the new subsection, and widening the existing stable-field-set table is a separate,
larger documentation debt outside this issue's write set and outside what my node brief asked for.

### 2. `CHANGELOG.md` — one `[Unreleased]` entry, and a new `[Unreleased]` header

The prior `[Unreleased]` section had already been renamed to `## [8.0.1] - 2026-07-27` by the last
release cut (confirmed: `git log --oneline -5 -- CHANGELOG.md` shows `release: 8.0.1` as the most
recent CHANGELOG-touching commit, and the file's current top is `# Changelog` directly followed by
`## [8.0.1]` with no `[Unreleased]` heading anywhere above it). I added a fresh `## [Unreleased]`
section at the top, matching the exact heading pattern `scripts/kaola-workflow-release.js`'s
`unreleasedSection()` regex requires (`^##[ \t]+\[Unreleased\][^\r\n]*`, verified against the regex
source directly, not assumed) — confirmed post-write with a live regex probe against the edited file
(`/^##\s+\[Unreleased\]/m.test(...)` → `true`).

One `### Fixed` entry under it, `#819`, covering: the two structural defects (seed-scaffold-blocks-every-
substitution; self-substitution silently recorded), the `substitute_self_noop` and
`substitute_evidence_reset_failed` refusal codes, the `classifyEvidenceBody` three-way classification and
why a marker cannot launder real work, the atomic reset + nonce preservation, the task-identity
derivation + its byte-identity proof (293 comparisons / 0 mismatches, taken verbatim from `n4`'s
evidence), the unchanged close-time gate, and the four-edition shipment. Points to
`docs/decisions/D-819-01.md`.

### 3. `docs/decisions/D-819-01.md` — new file

Confirmed no existing decision record claims the id before writing (`ls docs/decisions/ | sort`,
highest prior id `D-818-01.md`; #819 is the next free one). Structure follows the two most recent
records' style (`D-814-01`, `D-818-01`: Date/Status/Issue/Related header, `## Context`, `## Decision`
with numbered subsections, `## Explicitly rejected`, `## Consequences`). Covers exactly what the node
brief asked for:

- **§1** — the gap-vs-deliverable classifier chosen, and the rejected `--reset-evidence` force-flag
  alternative, with the same "loses the deliverable-refusal property entirely" argument `n2` §1 gives.
- **§2** — who owns the atomic reset (`substitute-role` itself; no new subcommand) and why a standalone
  `reset-evidence` subcommand was rejected (five registration lists, unnecessarily general capability).
- **§3** — the task-identity derivation and the byte-identity constraint it had to respect
  (`simulate-workflow-walkthrough.js:21452`'s hard equality, outside every write set), stated as a
  constraint the design had to satisfy rather than a side effect.
- **§4**, titled exactly as the brief requested — "What P5 still guarantees, and what it no longer
  guarantees," stated as two explicit paragraphs rather than folded into prose elsewhere.
- **"The honest history of the marker decision"** — a dedicated section, not a footnote, covering: the
  original column-0-`capability_gap:`-key rationale was **measured false** (the real gapping role's
  evidence carried the key only nested inside an indented `outcome:` value, never at column 0; what it
  actually wrote unprompted was `delegation_outcome: capability_gap`); the em-dash/`--` ASCII-normalization
  divergence across the three `.toml` editions, which is why a full-phrase-keyed check would not be
  cross-edition stable while a bare-column-0-key check is; that the CONCLUSION (key on the column-0 form)
  survived while the REASONING that justified it as *sufficient* did not, which is stated as the reason
  the classifier accepts both typed markers rather than either alone; and the seed-scaffold repair to
  `hasEvidenceBodyBelowHeader`, named explicitly as a late discovery in the same investigation rather
  than part of the original framing.
- **Explicitly rejected** — six items, each traced to a real alternative considered in `n2`'s mechanism
  (the force-flag, the standalone subcommand, the key-alone classifier, the literal-string-match seed
  tolerance, the ~56-surface profile-prose expansion left as a named residual, and rotating the nonce in
  the reset).

## Verification performed on the three written files (I am a docs-only node; this is the honest ceiling
of what I can verify — no test suite exercises prose)

- `grep -n "^### \`substitute-role\`\|^### \`--main-session-direct\`\|^### \`record-evidence --verify\`" docs/api.md`
  confirms the new subsection sits between its two declared neighbors, in the order I intended, with no
  duplicate heading collision (a second grep for any pre-existing `substitute-role` heading and for a
  duplicate `# D-819-01` heading both returned exactly one hit each — my own).
- A `node -e` probe against the written `docs/api.md` confirmed every refusal code and constant I claim
  to have added (`substitute_self_noop`, `substitute_evidence_reset_failed`, `classifyEvidenceBody`,
  `evidence_reset: true`, plus the four newly-listed subcommands `expand-open`/`expand-close`/
  `discard-speculative`/`substitute-role`) is present as a literal substring in the file as written.
- A `node -e` probe against the written `CHANGELOG.md` confirmed the `[Unreleased]` heading matches the
  release script's own detection regex, and that the entry cross-references `D-819-01.md` by filename.
- `git status --porcelain -- docs/api.md CHANGELOG.md docs/decisions/D-819-01.md` shows exactly these
  three paths touched (two `M`, one `??` for the new file); the broader `git status --porcelain`
  (tracked files only) shows only these three plus the four `n4`-owned adaptive-node script files — no
  overflow beyond my declared write set.
- `git diff --stat -- docs/api.md CHANGELOG.md` — 2 files changed, 39 insertions(+), 2 deletions(-),
  consistent with two catalog-list edits + one new subsection in `docs/api.md` and one new section +
  entry in `CHANGELOG.md`.

I did not run `simulate-workflow-walkthrough.js` or any of the four chains myself — those are `n4`'s
(already green, unsharded, per its evidence) and `n8`'s to certify; a docs-only diff in this project's
own convention does not itself require re-running them, and I have no code change to validate against a
test suite in the first place.

## Findings for downstream nodes (no action taken by me)

1. **The `### opened payload — dispatch sub-object` "Stable field set" table in `docs/api.md` still
   does not list `agent_type`, `agent_type_frozen`, `role_substituted`, or `role_substitution_basis` at
   all** — a pre-existing #798-era documentation gap that predates #819 and that my node brief did not
   ask me to close (it asked for the reason-code material and the two subcommand catalogs specifically).
   I covered the task-identity derivation fully in the new `substitute-role` subsection instead of
   widening that table. Worth a future doc pass if anyone consults the stable-field-set table directly
   looking for `agent_type`.
2. No test, contract validator, or other machine-checked artifact was touched or needs to be — this
   node's write set is prose-only by design, and nothing in `docs/api.md`, `CHANGELOG.md`, or a new
   `docs/decisions/*.md` file is asserted on by `test-route-reachability.js`, the four
   `validate-*-contracts.js` scripts, or the walkthrough.
