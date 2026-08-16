# m984: contract validators pinning retired roadmap fields

Follow-up to `m984-stop-reading.md`. Scope per this dispatch: `scripts/validate-workflow-contracts.js`,
`scripts/validate-kaola-workflow-contracts.js`, and the plugin copy `validate-script-sync.js` demands.
Nothing else touched — `docs/api.md`, `scripts/simulate-workflow-walkthrough.js`,
`scripts/test-forge-bundle-lane.js`, `scripts/test-forge-finalize-findings.js` all left alone as
instructed. Nothing committed.

## The third copy, and the relationship it must hold

**`plugins/kaola-workflow/scripts/validate-workflow-contracts.js`** — byte-identical to
`scripts/validate-workflow-contracts.js`. This relationship is enforced **twice, independently**:

1. `scripts/validate-kaola-workflow-contracts.js` itself, in its `sharedScripts` loop
   (lines 142-148), which iterates a list of shared filenames including
   `'validate-workflow-contracts.js'` (line 138) and asserts
   `read(rootScript) === read(pluginScript)` for each — this is what threw first when I fixed only
   the canonical copy (`Error: plugins/kaola-workflow/scripts/validate-workflow-contracts.js must
   match scripts/validate-workflow-contracts.js`).
2. `node scripts/validate-script-sync.js`'s byte-identical-groups check (one of its 27 groups).

Both had to be satisfied, so the fix was applied to the canonical file first, then copied
byte-for-byte to the plugin file, then both were re-verified.

**The gitlab/gitea files under `plugins/` (`validate-kaola-workflow-{gitlab,gitea}-contracts.js`) are
a different mechanism, out of scope, correctly**: I checked before assuming — neither references
`docs/api.md` at all. Their `assertConcept` calls check concept terms against their own forge's
`scripts/kaola-{gitlab,gitea}-workflow-roadmap.js` and `test-{gitlab,gitea}-workflow-scripts.js`
files (which are the live roadmap MODULE and its own tests — untouched by this retirement, per the
brief). Confirms team-lead's framing: there are exactly three copies of *this* validator, not five.

## What was removed, and what was verified still-live

Both `scripts/validate-workflow-contracts.js:389` and `scripts/validate-kaola-workflow-contracts.js:202`
carried the identical single line `'roadmap_source_removed',` inside their
`assertConcept('docs/api.md', 'closure contract invariants and receipt schema', [...])` call. Removed
from both (plus the plugin mirror). Confirmed absent from `docs/api.md` first (`grep -c
roadmap_source_removed docs/api.md` → 0) before touching either validator, per the instruction not to
re-add anything to the doc.

**Checked every other candidate from the list, against the current scripts, before concluding no
further edit was owed**:

| Candidate | Status | Found in either validator? |
|---|---|---|
| `roadmap_source_removed` | retired (claim.js envelope + closure-contract.js `CLOSURE_RECEIPT_FIELDS`) | yes — removed (both files) |
| `roadmap_regenerated` | retired (same) | no |
| `roadmap_removed` | retired (dual-root roadmap receipt) | no |
| `roadmap_residue` | retired (same) | no |
| `roadmap_sources_removed` | retired (bundle field) | no |
| `roadmap_regenerated_by_root` | retired (same) | no |
| `main_roadmap_mirror_not_regenerated` | retired (claim.js finding — corrected earlier: it's claim.js, not closure-audit.js) | no |
| `stale_roadmap_sources` | retired (closure-audit.js drift class) | no |
| `mirror_lists_closed_issues` | retired (closure-audit.js drift class) | no |
| retired closure invariants (`roadmap-source-absent`, `roadmap-mirror-clean`, `keep-open-roadmap-preserved`, `roadmap-residue-clean` — named in `kaola-workflow-closure-contract.js:88-90`'s retirement comment) | retired, already removed from `CLOSURE_INVARIANTS` | no |

None of the other nine were referenced by either validator to begin with — `roadmap_source_removed`
was the only stale token either file carried. I did not stop at the first miss: I re-ran both
validators after the fix (the second, `validate-kaola-workflow-contracts.js`, threw on the
byte-identity check above, which I then also resolved and re-ran), and separately grepped both files
case-insensitively for every remaining `roadmap` mention to confirm none of the survivors reference
anything retired — every hit is either `scripts/kaola-workflow-roadmap.js` (the live roadmap module,
untouched per the brief), `simulate-workflow-walkthrough.js` concept checks naming still-live test
names (`testRoadmapGenerateMissingSourceGuard`, `testRoadmapGenerateAtomicReplace`,
`testRoadmapInitIssueConcurrentExclusive` — none of which I deleted), or unrelated prose/comments.

`assertIncludes('scripts/kaola-workflow-closure-contract.js', 'remote-members-closed')`
(`validate-workflow-contracts.js:785`) is unaffected — that invariant ID is still live in
`CLOSURE_INVARIANTS`.

## The timing note, for the record

Team-lead's observation, confirmed by reading both validators' mechanism: `assertConcept` only checks
that a token **appears somewhere in the target file's text** — nothing checks that the token still
names a live field. So retiring `roadmap_source_removed` from the code could never have reddened
these validators; only editing `docs/api.md` to remove the token could, and did, once that edit
landed. The validators were green the entire time the doc referenced a token with no producer — the
same shape as the two silent-vacuity finds already in the run record (`testFinalize`'s neutralization
assertions riding on an unrelated side effect; the `archive_stage` healthy control riding on
`regenerateRoadmap`'s incidental file write). A check that passes for a reason unrelated to what it
claims to enforce is now three-for-three in this run.

## Gates, each run separately, exit code not read through a pipe

| Gate | Result |
|---|---|
| `node scripts/validate-workflow-contracts.js` | **exit 0** — `Workflow contract validation passed` |
| `node scripts/validate-kaola-workflow-contracts.js` | **exit 0** — `Kaola-Workflow Codex contract validation passed` |
| `node scripts/validate-script-sync.js` | **exit 0** — "OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync. committed kernel parity: 4 Oracle Kernel copies identical at HEAD." |

`node -c` clean on all three touched files (`scripts/validate-workflow-contracts.js`,
`scripts/validate-kaola-workflow-contracts.js`, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`).

## Files changed

- `scripts/validate-workflow-contracts.js` — removed `'roadmap_source_removed',` from one `assertConcept` term list (line 389, now gone).
- `scripts/validate-kaola-workflow-contracts.js` — same, line 202.
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — same edit, to restore byte-identity with the canonical copy.

Nothing else touched. Nothing committed.
