# #1054 documentation custody, part 1 — README.md, docs/README.md, docs/agents-source.md

## Sources checked
- `gh issue view 1054 --json body,comments` — rewritten body (Codex/Fable 31-item audit) plus the
  owner's 2026-09-09 comments: Mission-List-parsing scope correction, the ECC-identity/framing
  correction, the ECC-scope clarification (borrowed ideas vs. reused text/code), and the
  README-confidence direction with the suggested lead sentence.
- `templates/agents/provenance.json` (schema_version 2, current) — all 14 roles `source_kind:
  kaola_authored`; 6 carry a `history` record (`build-error-resolver`, `code-architect`,
  `code-explorer`, `doc-updater`, `planner`, `tdd-guide`) pinned to
  `922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`, each with `measurement: "rewritten body shares 0
  eight-word shingles and at most a 4-word run with the pinned upstream file; the pre-#1054 body
  shared 15-73% (recorded in the #1054 run record)"`.
- `templates/agents/behavior-contracts.json` (schema_version 1) — 14 current role descriptions and
  `coverage` keys (`purpose`, `inputs`, `authority_custody`, `writes`, `deliverable`,
  `verification`, `stop_conditions`).
- `docs/decisions/0017-the-mission-list.md` — Mission List design of record (four fields, three
  write moments, no script required).
- `scripts/generate-agent-profiles.js` — read `ROLES` (14), `RUNTIMES` (7), `validateProvenance`
  (schema 2 checks), `runtimeAppendix` (Claude vs. other-runtime appendix contents).
- `scripts/validate-vendored-agents.js` — full file read; the `source_kind`/`history.source_commit`
  checks it runs over `provenance.json`.
- Current `README.md`, `docs/README.md`, `docs/agents-source.md` — read in full before editing.

## BLOCK
- The path given for the measurement source,
  `kaola-workflow/bundle-1054/.cache/source-classification.md`, does not exist in this worktree
  (`kaola-workflow/bundle-1054/.cache/` holds only `implementation-finalize.md` and
  `acceptance-red-v3.md`; neither contains per-role shingle/percentage figures, and a repo-wide
  grep for "shingle"/"eight-word"/"15-73" found no other file). I used the equivalent data that
  **is** present and authoritative — the per-role `history.measurement` string in
  `templates/agents/provenance.json`, identical across all six roles — for the Measurement table in
  `docs/agents-source.md`, and said explicitly in that doc that the 15–73% figure is one range
  recorded identically for all six roles, not six distinct numbers, and that a more detailed
  per-role figure (if one exists) is not reproduced in this document. No per-role percentage
  breakdown was invented.

## README.md
1. **Opening (lines 1–17).** Replaced "Bookkeeping for coding agents." and its one-sentence
   mechanism summary with the owner's suggested lead ("Kaola-Workflow turns forge issues into
   verified, recoverable software delivery. Agents own the planning and execution; Kaola-Workflow
   preserves the work, its evidence, and the path to completion across coding runtimes.") plus one
   paragraph naming the mechanism already documented later in the file: claim → Mission List →
   candidate-bound validation → finalize/archive/sink. Kept the existing runtime/forge support
   sentence and the Codex dispatch-default paragraph unchanged (both already factual, no ECC or
   competitive framing was present).
2. **"What ships" role bullet.** Changed "Fourteen shared role behaviors rendered into native
   profiles for every supported runtime" to name the role design's own dimensions — positioning,
   deliverable, unique custody, stop condition — sourced from `behavior-contracts.json`'s
   `coverage` keys, without calling them ECC roles (they already weren't).
3. **License section.** Replaced "Six shared role contracts retain pinned Everything Claude Code
   provenance under the same license" with the measured fact from `provenance.json`: all fourteen
   current contracts are Kaola-authored; six earlier contracts (superseded through v10.5.0) were
   derived from Everything Claude Code under MIT; that history is kept as a historical origin
   record in `templates/agents/provenance.json` and `docs/agents-source.md`; no upstream text
   remains in the current contracts (measured: zero shared eight-word sequences with the pinned
   upstream files). Kept the MIT statement and the `LICENSE` link.
   No other README section names ECC, presents the roles as following ECC, or contains "prompt
   pack" framing or competitor scoring — none existed before this edit either, so no other change
   was needed there. "Why it exists" already stated the agent-owns/Kaola-Workflow-preserves split
   honestly and was left unchanged.

## docs/README.md
- Changed the one-line description of `agents-source.md` in the "Agent Behavior Sources and
  Provenance" bullet from "...126-render manifest, ECC attribution, and refresh procedure" to
  "...126-render manifest, source classification with historical origin record, and how to add or
  change a role" — matching the rewritten doc's actual sections (below). No other line in
  `docs/README.md` named ECC or provenance.

## docs/agents-source.md
Kept the intro paragraph, "Canonical source graph" (one row corrected — see below), and "Identity
and proof boundary" (extended — see below). Replaced "Upstream provenance", "Local Overrides",
"Kaola-local roles", and "Refresh procedure" with five new sections:

1. **Canonical source graph row for `provenance.json`** — corrected the "Owns" column: the old text
   said "local overrides", a schema-1 field that no longer exists; schema 2 has `source_kind` plus
   an optional `history` object. Updated to match.
2. **"Identity and proof boundary" — added a paragraph** stating, from
   `scripts/generate-agent-profiles.js`'s `runtimeAppendix`, that Claude's render carries
   `behavior_contract_version`/`behavior_contract_hash`/`resolved_profile_hash` in YAML frontmatter
   so its adapter appendix records only `runtime: claude` plus the capability-boundary prose, while
   every other runtime (no frontmatter equivalent) carries the full hash block in its appendix.
3. **New "Source classification" section** — current authority (`behavior-contracts.json` +
   `runtime-capabilities.json` → 126 renders via `generate-agent-profiles.js`; all 14 roles
   Kaola-authored); the `provenance.json` schema 2 fields (`source_kind`, optional `history` with
   its nine possible sub-fields, and the top-level `origins` object); and, transcribed from the two
   scripts, exactly what `generate-agent-profiles.js`'s `validateProvenance` and
   `validate-vendored-agents.js` check (schema/role completeness, required `history` sub-fields,
   `history.origin` resolving to a known `origins` key, and the `everything_claude_code` roles'
   `source_commit` staying pinned to `922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`). Also carried
   forward the existing fact that generated prompt bytes contain no origin/license narration,
   citing the exact regex `validate-vendored-agents.js` asserts against.
4. **New "Historical origin" section** — the six roles, the pinned commit, MIT license and
   copyright holder (both from `provenance.json`'s `origins.everything_claude_code`), the
   upstream-path/blob-SHA table (carried over from the old "Upstream provenance" section, values
   unchanged), and the `relationship`/`retained_material` facts from `provenance.json` stating the
   earlier ECC-derived contracts remain in git history and `kaola-workflow/archive/` under that
   license, while the current body (all fourteen roles) is Kaola-authored. Named the other eight
   roles as carrying no `history` record.
5. **New "Measurement" section** — the table described in BLOCK above, built from
   `provenance.json`'s `history.measurement` field (identical string for all six roles), with an
   explicit note that 15–73% is one range attributed identically to all six roles, not six
   separate figures, and that any more granular per-role record is not reproduced here.
6. **New "Changing a role" section** — replaces "Refresh procedure": edit
   `behavior-contracts.json` (and `runtime-capabilities.json` for runtime carriers), then run
   `generate-agent-profiles.js --write`, `--check`, `validate-vendored-agents.js`,
   `test-runtime-agent-architecture.js`, and `npm run test:kaola-workflow:editions` — no
   re-vendor/reconciliation steps, since none apply to any current role. Verified all five
   commands/scripts exist in the worktree before writing them.

All facts in the new "Source classification" and "Historical origin" sections were transcribed
directly from `templates/agents/provenance.json` and the two named scripts' actual code (not
inferred or invented); none required a BLOCK beyond the one above.

## Files changed
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/README.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/README.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/agents-source.md`

No git operations were run (per instructions); no other files were touched.

## Orchestrator reconciliation (2026-09-09)
The BLOCK above was a path resolution miss: the measurement record exists at the main-root run folder (`kaola-workflow/bundle-1054/.cache/source-classification.md`), not in the worktree. The orchestrator replaced the doc's placeholder Measurement table with the real per-role figures from that record and gave each role's `history.measurement` in `templates/agents/provenance.json` its own numbers (build-error-resolver 73.1%/400 words → 0/4 words; code-architect 40.2%/139 → 0/0; code-explorer 67.4%/157 → 0/0; doc-updater 61.1%/250 → 0/0; planner 60.1%/283 → 0/0; tdd-guide 14.6%/136 → 0/0). generate-agent-profiles --check and validate-vendored-agents remain green. README opening, role bullet, License, and the docs/README index line accepted as written.

## Owner correction applied (19:03 heartbeat)
README's License section now carries only the MIT statement, "the fourteen role contracts are Kaola-authored", and the Agent Sources link. The historical origin and the shingle measurement stay in docs/agents-source.md and provenance.json only; the zero-eight-word result is evidence for that comparison, not product copy.
