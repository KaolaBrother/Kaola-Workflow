evidence-binding: n3-docs 37cf0f86fd47

## Record authored

`docs/decisions/D-606-01.md` — "Report-only Claude agent-teams detection, and a
teammate-mode dispatch subsection on the plan-run surfaces" (142 lines). Sole file
touched (`git status --short` in the leg shows only `?? docs/decisions/D-606-01.md`).

Content sourced from `gh issue view 606 --json title,body` (the ratified design; plain
`gh issue view` fails on this box) — no code from n1-detect/n2-prose was available yet at
authoring time (both legs' `git status --short` were clean), so the record follows the
issue's fixed design directly rather than reverse-engineering an implementation.

## Structure matched against

Read D-598-01.md (Codex dispatch-posture pattern — the explicit precedent this decision
mirrors), D-597-01.md, and D-593-01.md as precedents, plus skimmed the `D-59x-01.md`
line-count spread (92-216 lines) to size the record. Matched:

- Header block: `# D-{issue}-01. <title>` / `Date:` / `Status: Accepted` / `Issue: #606` /
  `Related:` with indented multi-line continuation, mixing `docs/decisions/D-XXX-01.md`
  refs (for issues that have a decision doc, e.g. D-598-01) and bare `#NNN` refs (for
  issues that don't, e.g. #601, #604 — confirmed no D-600 through D-605 files exist).
- Four `##` sections: Context, Decision (numbered list, 5 items mirroring D-598-01's 5),
  Consequences, Alternatives considered (each with a **Rejected:** clause).
- Confirmed D-606-01 is the correct next-free number under the observed convention that
  `D-NNN-NN`'s NNN is the issue number, not a separate sequential counter (verified via
  the `Issue:` field in D-599-01/D-597-01/D-596-01/D-592-01, all matching their filename).

## Key sections

- Context: the two dispatch transports, the verified detection facts (env-var probe,
  no model-tier gating, TeamCreate removal, undocumented idle-notification ordering with
  the observed-twice race), and the gap (nothing detected/taught it).
- Decision: report-only `claude_dispatch_posture` derivation + emission sites
  (install.sh, workflow-init config-audit), the report-never-write boundary reusing the
  #601 lead-with-classic wording, the six-surface teammate subsection (named spawns,
  SendMessage repair-nudge routing, sync-spawn exception, required one-nudge idle-race
  sentence, transport-independent contracts), machine guards (contract-validator needles,
  PROVENANCE_BAN), and the load-bearing non-goals (no script/gate/scheduler ever reads
  the flag; not a new lane or grammar).
- Consequences: behavior split by operator posture, forward-compatibility framing for a
  still-changing experimental surface, the #307 cross-edition obligation (six + six
  surfaces plus install.sh), and the #602-605 sequencing dependency.
- Alternatives considered: rejected auto-writing settings, rejected coupling any
  scheduler/barrier decision to the posture, rejected modeling teams as a new lane, and
  rejected making the report fatal when the flag is off — each with a one-line rationale.
