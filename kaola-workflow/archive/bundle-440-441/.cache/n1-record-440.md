evidence-binding: n1-record-440 fef5a62c5581

# Node n1-record-440 — Evidence

## Task

Author `docs/decisions/D-440-01.md` — a durable ADR transcribing the binding settlements from
GitHub issue #440 (D-420 Part 2: consent-halt triage payloads — classified `class` + structured
`proposed_repair` on write-halt AND barrier_failed envelopes). TRANSCRIBE, not redesign.

## Declared write set

- `docs/decisions/D-440-01.md`  (CREATED — sole write)

## What was written

`docs/decisions/D-440-01.md` — an ADR-style decision record in the D-442-01 sibling style (the
implementation-settlement record for D-420 Part 4). It is the implementation-settlement record for
D-420 **Part 2**, closing OQ-P2-a/b/c from D-420-02.

Settlements transcribed from the #440 issue body:

1. **Pattern source (OQ-P2-a)** — the subtype classification table lives in
   `scripts/kaola-workflow-adaptive-schema.js` (the byte-identical forge-neutral constants home /
   cross-edition drift anchor); never a forge token.
2. **Repair-diff format (OQ-P2-b / settlement 2)** — `proposed_repair` is a STRUCTURED object
   `{ kind: write_set_swap|add_to_write_set|revert_overflow|repair_node, node, paths[] }` reusing
   the #434 (D-434-01) primitives vocabulary; NOT a literal diff.
3. **test_thrash delta source (OQ-P2-c / settlement 3)** — from the #432 chain receipt
   (`.cache/chain-receipt.json`, D-432-01) when present, else the node-evidence RED/GREEN lines.
4. **Threading (settlement 4)** — `write-halt --triage-json <path|->` consumes the `barrierOut`
   envelope that `close-and-open-next` already returns at `adaptive-node.js:1586-1591`.
5. **barrier_failed triage (settlement 5)** — the overflow `barrier_failed` refusal envelope carries
   the SAME `triage` shape as the write-halt payload; ONE shape on both channels.
6. **Do-not-fork-the-taxonomy** — the three subtypes `lockfile_write` / `mirror_write` / `count_bump`
   NARROW `write_set_overflow` in the precedence-ordered `reason` envelope; never a fifth precedence
   family (the D-419-02 [INV-13] lesson). Precedence order unchanged.
7. **Forge-neutral JSON + ×4 edition propagation** — cross-edition diff; all four chains green (#307).

## Grounding / source-of-truth reads

- `.cache/n1-record-440.md` (seeded skeleton — binding header confirmed: `n1-record-440 fef5a62c5581`)
- `docs/decisions/D-420-02.md` — the parent Part-2 design (triage shape, [INV-13]..[INV-18],
  OQ-P2-a/b/c)
- `docs/decisions/D-420-01.md` — Part 1 autopilot + [INV-6] repair-consent boundary (the
  `proposed_repair` consumer)
- `docs/decisions/D-419-02.md` — [INV-13] do-not-fork-the-emit-taxonomy precedent
- `docs/decisions/D-434-01.md` — `revert-overflow` / `repair-node` sanctioned-repair primitives (the
  `proposed_repair.kind` vocabulary)
- `docs/decisions/D-432-01.md` — `.cache/chain-receipt.json` chain receipt (test_thrash delta source)
- `docs/decisions/D-442-01.md` — sibling Part-4 implementation-settlement record (style model)
- `scripts/kaola-workflow-adaptive-node.js` — confirmed `revert-overflow`/`repair-node` subcommands,
  the `runWriteHalt` reasons `['consent','security','test_thrash']`, and the `barrier_failed` close
  return `{ result, reason: 'barrier_failed', nodeId, barrierOut }` at lines 1586-1591

## Verification

- Sole declared-write-set file created; no other files touched.
- Header conventions match the dated-D-NNN-01 ADR house style (D-442-01 / D-432-01 / D-434-01).
- Every settlement in the #440 body is transcribed, with each open question (OQ-P2-a/b/c) explicitly
  marked closed and cross-referenced to the originating D-420-02 invariant.
- Design transcribed, not redesigned: no new mechanics introduced; all claims grounded in the issue
  body + the cited ADRs + the code line references confirmed by read.

RED→GREEN: documentation node (no test target); evidence-shape complete and binding-bound. build-green.
