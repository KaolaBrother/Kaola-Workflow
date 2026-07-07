evidence-binding: n5-docs 5d431fe5f80a

## n5-docs — bundle-629-637 doc-updater

**Pre-check:** confirmed both decision-record ids were free before writing —
`ls docs/decisions/ | grep -E 'D-629|D-637'` returned no matches (exit 1).

**House style read:** `docs/decisions/D-630-01.md` and `docs/decisions/D-636-01.md` (Title / Date /
Status / Issue / Related / Context / Decision / Consequences / Non-goals[-/accepted residual] /
Alternatives considered).

**Grounding sources read (no fabrication):** `git status --short`, `git log --oneline`,
`git show --stat f5c502a6` (the reconciled octopus merge for this bundle), plus the four upstream
node evidence files — `kaola-workflow/bundle-629-637/.cache/n1-guards.md`,
`.cache/n2-manifest.md`, `.cache/n3-review.md`, `.cache/n4-adversary.md`.

**Files written (exactly 2 of the declared 3):**
- `docs/decisions/D-629-01.md` — the #629 edition-guard-net decision: `HOOKS_JSON_FAMILY` +
  `normalizeHooksJson()` (hooks/hooks.json parity, extending the existing `CONFIG_HOOKS_FAMILY`
  pattern), a `config/agents.toml` triple `BYTE_IDENTICAL_GROUPS` entry, the shared
  `checkNormalizedFamily`/`checkByteIdenticalGroup` primitive extractions (behavior-preserving), and
  the `edition-sync.js` `syncIfDrift` create-on-missing fix for `runWrite()` steps (b)/(c). Grounded
  in `n1-guards.md` (RED/GREEN evidence, verification exit codes) and cross-checked against
  `n3-review.md` §"#629 (n1-guards)" and `n4-adversary.md` §"#629 guards bite (all 4 directions)".
  Non-goals/accepted-residual section references the `edition-sync --check` vs `--write` universe
  asymmetry as "a filed follow-up" (n4-adversary.md finding R1, `action=follow_up ... will FILE`) —
  no issue number was visible in the evidence, so none was fabricated.
- `docs/decisions/D-637-01.md` — the #637 `fn-closure-audit` vacuous-guard hardening: added
  `sink_incomplete` as a third, non-substring, distinctive `content_token`, plus the RED-PROOF test
  case in `scripts/test-route-reachability.js` (gut-the-interior-keep-the-marker fixture against the
  LIVE manifest block). Grounded in `n2-manifest.md` (RED 1/282 → GREEN 283/283 transition, the
  6-surface `grep -c` provenance table) and cross-checked against `n3-review.md` §"#637 (n2-manifest)"
  and `n4-adversary.md` §"#637 guard bites" (the live plant-and-restore proof + the R2 whole-file-vs
  -block-interior scoping note, folded into the ADR's Non-goals as a design note, not a defect).

**`docs/conventions.md` — NOT edited.** Judgment call: both #629 and #637 extend or harden
*existing*, already-documented mechanisms (the `validate-script-sync.js` guard-family pattern
already described for `CONFIG_HOOKS_FAMILY` #418.1 and `BYTE_IDENTICAL_GROUPS` #422; the Layer-1
manifest/`content_tokens` pattern already described under "Twelve of the six-surface set are
GENERATED" #630) rather than introducing a new durable policy or rule a future contributor would
need conventions.md to learn. No new convention is created by either change, so a conventions.md
note was not genuinely warranted; per the task's optionality, only the 2 ADRs were written.

**Write-set discipline confirmed:** `git status --short` shows exactly the 2 new files
(`docs/decisions/D-629-01.md`, `docs/decisions/D-637-01.md`) plus this node's own `.cache/n5-docs.md`
— no `CHANGELOG.md`, no `docs/conventions.md`, and no code file (`scripts/*.js`,
`templates/routing/*.js`) was touched by this node.
