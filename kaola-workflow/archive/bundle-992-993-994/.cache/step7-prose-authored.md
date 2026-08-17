# Authored Step 7 prose — CANONICAL WORDING, do not paraphrase

Orchestrator-authored. Both the manifest author (tdd-guide) and the implementer read THIS file.
One rule, one wording. If you believe a word is wrong, say so — do not silently improve it.

## Placement

`templates/routing/finalize.skeleton.md`, inside the existing `<!-- PIN: forge-is-the-backlog -->`
span (currently `:237`–`:248`). Insert BOTH new paragraphs between the existing filing paragraph
(ends `...so what is written was actually swept.`) and the existing correction paragraph
(begins `When this run's own findings contradict...`), separated by blank lines.

Do NOT touch: the filing paragraph, the correction paragraph, the `independent slices` paragraph
(outside the pin), the `KAOLA_GOAL` advisory, the bash fence, or the `## Run gaps` heading.

## Paragraph A — #994, the typed body contract

Structure the body of the issue you file so the next run can separate evidence from inference. In
that body, `## Measured` carries
only what this run observed, and every figure there names the commit it was measured at and the
command or artifact it came from — an unstamped number does not belong in that section.
`## Hypothesis` carries attributions no run has confirmed; a cause derived by reading code lands
there by default, phrased as a claim to test. `## Proposed remedy (non-binding)` is optional and
carries that label when it appears. Add one `searched:` line recording the duplicate probe you
actually ran — its query and its hit count, at the mechanism or symbol level, since a title-word
search will not find a symbol the forge has tokenized. This adds no measurement obligation: it
forbids exactly one thing, an unstamped figure or an unrun attribution presented as established fact.

## Paragraph B — #992 layer 1, the filing verification

After filing, confirm the issue exists and its body is non-empty, and record the issue number and
the body length you saw in this run's own record — a create that failed silently leaves a
`filed: #N` pointing at nothing. That record is the mission list's result line, never the
`## Run gaps` row, whose grammar the scanner owns.

## Constraints that bind both readers

- Forge-neutral: neither paragraph names a forge CLI. `RENAMES` in `templates/routing/rename-table.js`
  is EMPTY, so a CLI name written into prose would ship unrenamed to all three forges. All three
  forges can express the paragraph-B check, so there is no capability difference and therefore NO
  `<!-- REGION -->` is warranted here — per the renderer's own rule, a region whose reason cannot name
  a runtime difference is drift, not divergence.
- The five existing `content_tokens` on block `fn-forge-is-the-backlog`
  (`templates/routing/required-blocks.js:347-364`) must keep their word sequences EXACTLY. Inserting
  whole paragraphs between them is safe; token matching is whitespace-normalized `includes()` per
  token (`scripts/test-route-reachability.js:23`, `:915`), so re-wrapping is safe and word-level
  edits inside a token are not.
- No new PIN marker. A new marker without its own manifest entry reds `orphan-surface` across 12
  finalize surfaces.
- Line wrap: match the file's existing ~99-column wrap.
