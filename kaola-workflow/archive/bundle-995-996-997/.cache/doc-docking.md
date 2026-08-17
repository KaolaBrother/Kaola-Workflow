# Documentation docking — bundle-995-996-997

Verdict: **DOCKED**

Docking was done inline by the orchestrator rather than dispatched to `doc-updater`. Reason recorded
rather than assumed: every structured surface this bundle touches is prose about behaviour the run
itself measured, and the one standing caution about that role is that it fabricates schema when it
cannot see ground truth. There was no API shape, config key or enum to transcribe here, and the
figures involved (10 of 19, 6 sections, 18 refs, 7 rows) are ones a doc-writing pass would have had
to take on trust from this same run. No `BLOCK:` condition arose.

## Changed files reviewed

25 files in `d63fe703`. Grouped: the routing skeleton plus its 6 rendered finalize surfaces; the
pin manifest; `gap-sweep.js` and `claim.js` across all 4 editions (8 files); both
`sync-*-edition.js`; three test files; four docs.

## Documents checked

| document | outcome |
|---|---|
| `CHANGELOG.md` | **Updated.** Three entries under `[Unreleased]`, all under the single existing `### Fixed` heading — deliberately not a second one, since 9.10.0 shipped with two `### Fixed` headings in one section. |
| `docs/api.md` | **Updated.** The `sync-opencode-edition.js` / `sync-kimi-edition.js` row now documents the stderr announcement, its gate, and that stdout stays a clean single path. Also corrected "changed **one** there", which carried the same false file-unit the note itself had just shed. |
| `docs/workflow-state-contract.md` | **Updated, and this was the near-miss.** `:296` read "A lane that could not **locate** that section stamps `unknown`" — the pre-#997 two-state semantics, i.e. the exact conflation this bundle fixed, restated in the contract. No token was added, but what `unknown` MEANS widened, and that is documented state. Now covers present-but-unread and the partial case, and states that prose and free text keep their measured `0`. |
| `docs/decisions/0018-the-forge-is-the-backlog.md` | **Updated.** §8 item 8's "invisible to the sorter" corrected in place to what the code does, with cites and a dated correction note. Provenance belongs in an ADR, so the note stays; the same fact reaches the agent-facing skeleton as the rule alone, with no origin. |
| `README.md` | **No impact, verified not assumed.** It documents the *selection* sort order (`P0`→tier 0 … other→tier 99), which is accurate and untouched. #995 changed the *filing* duty, which README never described. Grep for filing-duty language returns nothing. |
| `docs/architecture.md` | **No impact.** Zero hits on any affected symbol (`Run gaps`, `follow_ups_filed`, `priority tier`, `parseGapSection`, `edition tree`). No structure moved; no script added or removed. |
| `.env.example` | **No impact.** No environment surface touched. |
| issue comments | **Updated.** Premise corrections posted on #996 (four corrections) and #997 (two) before closure, per the never-close-quietly rule. #995 needed none — its `## Measured` section was accurate, including its own correction of the ADR wording. |

## Gaps found and fixed

One: `docs/workflow-state-contract.md:296`, above. Found by asking what the *contract* says about a
value whose meaning changed, rather than by diffing changed code against docs — the code change
added no field, so a mechanical changed-symbol sweep would not have surfaced it.

## No-impact reasons

`README.md`, `docs/architecture.md`, `.env.example` — each checked by search against the specific
symbols this bundle moved, with the outcome recorded above rather than inferred from the absence of
a code change in that area.
