# Run gaps — manually declared

The scanner found 0 because this run's agents wrote prose reports rather than gap-shaped lines.
These are the real defects and coverage facts the run itself discovered, declared here so the
`--check` gate sweeps what the summary maps.

gap: coverage — `--sink` never runs the `run_not_finalized` measurement the legacy path runs. Found while investigating #893's `projStateFiles` question: `assertNoLiveWorkflowFolder` (`kaola-workflow-claim.js:274-300`) is wired only into the legacy path at `:2488`, so the `--sink` transaction can reach a shape where an unfinalized run's live folder still exists. Not triggered by this run; measured, not hypothesised.

gap: coverage — three plausible `issueIsClosed` regressions survive the new #895 scenario: an unreachable issue treated as closed, an empty answer treated as closed, and removal of the OFFLINE short-circuit. The last is notable because OFFLINE handling is the entire reason the scenario spawns a subprocess driver. The parity gap found alongside them was fixed in this run; these three were not.

gap: coverage — re-introducing the exact mechanism #888 deleted is invisible to every authored suite. A narrow re-added carry-over (ancestor + gap confined to `RELEASE_FILES`) flips both entry points to pass and lets a tag be created, while walkthrough, finalize-door, test-release, test-run-chains, oracle-kernel and both contract validators all stay green. A broad relaxation IS caught, but by exactly one test — the `#651 (4)` walkthrough scenario — which the fast gate samples at a rotating 1/12.

gap: design — the #892 dead-pointer class is unguarded in both directions. The new pins defend the format's PRESENCE, but nothing forbids the pointer's RETURN: re-inserting `docs/mission-list.md` into all 12 next surfaces, and re-adding it to the consumer `CLAUDE.md` template's Documentation Map, both keep a full fast gate green. Mutation-proven on git-backed mirrors.

gap: design — `CONTRACT_VERSION_PIN_SITES` is a hand-typed list with no completeness guard, so an eighth declaration at an unlisted path would be invisible to the #889 sweep; and the sweep pins the declaration, not the use. Today the list is complete — every reference was enumerated.

gap: design — #893's own-archive exemption is a directory prefix, so a stray file under the run's own archive directory is committed along with the mirror rather than refused, as it was before this bundle. Owner-ruled: the sink reports every path it commits instead of adjudicating, because no sound discriminator exists between a stray and the mirror.
