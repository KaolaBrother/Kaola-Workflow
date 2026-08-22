# Independent code review - issue #1013 closure

finding: id=R1 scope=in_scope action=none status=resolved severity=medium fix_role=investigator rationale=durable-raw-stream-now-proves-the-distinct-resolved-efforts

## Prior finding closure

### R1 - Resolved

- Prior failure class: acceptance-evidence gap.
- Repair delta: `kaola-workflow/issue-1013/.cache/live-cursor-stream.ndjson` now retains the complete raw stream from a second brand-new cold session, and `live-cursor.md:24-36` plus `validation.md:26-32` bind their summaries to that artifact.
- Trigger rechecked: verify acceptance item 3 from durable evidence rather than a prose-only summary.
- Expected: a fresh xhigh parent is instructed to author two fresh model-free custom Tasks; the raw carrier exposes `implementer` resolving to medium and `code-reviewer` resolving to high; both complete with their expected markers.
- Observed: raw line 1 initializes session `533e84fc-63e5-4d6a-8a98-75984684a06f` as `Cursor Grok 4.6 Extra High`; line 2 explicitly requests fresh parallel custom Tasks, omission of the authored `model` argument, and no resume. Lines 12/14 bind the `implementer` started/completed pair to `cursor-grok-4.6-medium`, stable launch id `e73c5992-8fd1-4271-a11f-eec300d37db7`, and successful `STANDARD_CHILD_2`. Lines 13/15 bind the `code-reviewer` pair to `cursor-grok-4.6-high`, stable launch id `a31dcaab-f0ba-4368-a66e-50dd845b583d`, and successful `REASONING_CHILD_2`. Line 25 records final success.
- Independent machine check: all 25 non-empty lines parsed as JSON; all events share the expected session; there are exactly two started and two completed Task events; names, resolved models, launch ids, call ids, completion results, and final success all match. No additional Task event is present.
- Resolution: the durable raw carrier now distinguishes both tier pins from the xhigh parent and from each other. The family-clamp PASS is supported, so no typed deferral is required. R1 is closed.

## Candidate verification retained

- `scripts/sync-cursor-edition.js:113-140` derives medium/high from canonical `sonnet`/`standard` and `opus`/`reasoning` tokens and emits the model line raw rather than through `yamlScalar`.
- Direct read-only probes confirmed all four supported tokens render the expected exact line and absent/unknown tokens throw agent-specific errors.
- `scripts/test-cursor-edition.js:277-330` derives rosters from canonical agent frontmatter and exercises the unknown-token fail-closed branch; `:348-375` pins exact unquoted line shape and rejects separate effort fields.
- Read-only `--check` runs passed for `.cursor`, `.cursor-gitlab`, and `.cursor-gitea`: each has 14 agents, 3 commands, and 2 hook files in canonical parity. All generated agents carry the expected raw pin, and generated commands/hooks contain no per-call model assignment.
- The generator reports the main checkout as the generated-tree root from the linked issue worktree, matching installer and test root semantics.
- Focused scans found no stale Cursor inherit-only declaration on current tracked surfaces. Canonical consumer prompts contain no new Cursor/Grok literal.
- The additive boundary is unchanged: the candidate does not touch `package.json`, `install.sh`, `scripts/edition-sync.js`, or chain-selection machinery.
- Documentation matches the shipped mapping, model-free Task cards, and declared runtime limits.

## Final validation receipt

- Candidate remains 8 tracked paths with 187 insertions and 63 deletions; `git diff --check` passes.
- Cursor edition suite: 550 assertions pass, including all three present generated-tree parity checks.
- Routing surfaces: 18 generated surfaces match their skeletons.
- Full workflow walkthrough: 186/186 scenarios pass with 0 failures.
- Runtime close evidence: independently parsed 25/25 raw stream events with successful medium/high Task envelope pairs.
- Remaining findings: none.

verdict: pass
findings_blocking: 0
review_conclusion: The durable cold-session stream closes R1, and the unchanged candidate now passes independent review with no remaining findings.
