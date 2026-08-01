# Documentation docking — bundle-896-897-898

Verdict: **DOCKED**

## Changed files reviewed

All 13 from `6eed9801`, plus the finalize-time doc edits. The four sink-merge editions and the two
`validate-workflow-contracts.js` copies are the only behavioural changes; five test files and one
deletion carry no external surface.

## Documents checked

| document | outcome |
|---|---|
| `CHANGELOG.md` | Seven `[Unreleased]` entries, one per user-visible change, plus the predicate adoption and the two doc corrections folded into the archive entry. |
| `docs/api.md` | Updated twice. First the pre-merge guard table (which path runs which guard, KEEP vs CONVERTED, branch-tip probe) and a new bullet on the confirmed archive. Then the `sink_incomplete` shape table, re-keyed on `archive_refusal`. |
| `docs/architecture.md` | Merge-sink diagram rewritten against the real `SINK_STEPS`. |
| `README.md` | No impact — command surface unchanged. |
| `docs/conventions.md` | No impact — see reasoning below. |
| `docs/workflow-state-contract.md` | No impact — no state field added, removed or re-meaninged. |
| `kaola-workflow/ROADMAP.md` | Generated mirror; closure regenerates it. Not hand-edited. |

## Gaps found and fixed

1. **`docs/api.md` said `sink_incomplete` shapes are "discriminated by `step`" — and this run broke
   that.** The archive fix emits the same `step: 'finalize'` with a different cause and payload, so the
   documented discriminator stopped discriminating. Re-keyed on `archive_refusal`, with
   `archive_incomplete` (carrying `missing` + `mismatched`) separated from
   `archive_exception` / `archive_forced_refusal` / `archive_not_performed`. All four values
   transcribed from source, not inferred.
2. **`mismatched` was undocumented** despite riding the envelope.
3. **`docs/architecture.md`'s sink diagram had the wrong order** — push-main → close → archive, where
   the real order archives at `finalize`, before both. Pre-existing, but this run makes it load-bearing:
   stopping on a failed archive is only safe because nothing has been pushed and no issue closed yet.
   The diagram also listed a non-step; it now names the real `SINK_STEPS` members.
4. **The archive-success test was hand-rolled** beside a shared predicate the docs already call the
   mandatory archive boundary. Adopted, so the boundary has one wording.

## No-impact reasons

- **`README.md`** — the installed command surface is unchanged, and `sink_incomplete` has never been
  enumerated there; this run adds one member to a class the README does not list.
- **`docs/architecture.md` structure** — no new module and no moved boundary. Only the diagram's
  ordering was wrong, and that is corrected above.
- **`docs/conventions.md`** — `CONSUMER_DOCS_PATH` enforces a rule that already has exactly one
  wording, in `CLAUDE.md`'s "One rule, one wording" section, and its derivation lives in the source
  comment at the check. Adding prose here would create a second wording, which is the failure that
  section exists to prevent.

## Anti-fabrication

Every field name, envelope key, exit code and step name in the updated docs was transcribed from
source and re-verified independently: the `sinkEmit(payload, 1)` exit, the stop preceding
`stepDone('finalize')`, the KEEP/CONVERTED split, the branch-tip `cat-file` probe, the OFFLINE gating
on both call sites, and the `SINK_STEPS` array itself. No example value is invented. No `BLOCK` was
raised.
