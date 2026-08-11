# #952 subtraction audit — the brief, rewritten by its own premise pass

The issue as filed points its readers at a 24% duplication figure. That figure is real (re-measured
23.3%) and **its conclusion is wrong**: 23.2 of those 23.3 points are the four-edition port
structure, which is load-bearing, guarded by `edition-sync.js --check`, and named in `CLAUDE.md` as
the cross-edition drift anchor. Non-port duplication is 0.04% of the tree, and even that single group
is a rename-normalized forge port.

So the audit runs, but **duplication is struck from the finding classes**. Full measurement:
`reports/premise-952.md`.

## Scope

| in | out |
|---|---|
| `scripts/` — 81 canonical `.js` | the 86 ported copies under `plugins/*/scripts/` |
| `docs/` — 198 files, 34,359 lines | `kaola-workflow/archive/**` |
| | `scripts/kaola-workflow-adaptive-schema.js` (excluded by the issue) |
| | ADR 0017's "built once, removed, recoverable" rows (excluded by the issue) |

A ported file is audited **once, in its canonical copy**. A finding against a ported file states its
multiplier.

## Finding grammar — five classes, duplication is not one

`delete:` `stdlib:` `native:` `yagni:` `shrink:`

**Every finding carries its measurement, and a finding without one is not filed.**

- `delete:` — must show the **zero-consumer search**: the exact command, run over `scripts/`,
  `plugins/`, `templates/`, `hooks/`, `package.json`, `install*.sh`, and the docs. `grep` here is
  ugrep and skips dot-directories; a search that missed `.opencode*`/`.kimi*` is not a search.
- `shrink:` — must show **the shorter form running**, not asserted. Paste the run.
- `stdlib:` / `native:` — must name the replacement and show it produces identical output.
- `yagni:` — must show the capability has **no caller and no test that would fail**, or name the test
  that dies with it.

## The ranking rule the issue does not specify

Findings rank by **net deletable lines**. That is ambiguous for ported files and the ambiguity is
not cosmetic: one line cut from a ported canonical file is cut ×3 or ×4 downstream, so without a rule
the ranking is decided by whether a file happens to be ported rather than by whether the cut is a
good idea.

**Rule: rank by canonical lines. State the multiplier separately.** A 10-line cut in a ×4 file is
`10 lines (×4 = 40 shipped)` and sorts at 10.

## Two hard constraints

1. **Test custody.** A finding on a test names **the mechanism whose removal takes it**. A test is
   deleted with its mechanism, never repaired ahead of it. A finding that proposes deleting a test on
   its own merits is out of order and will be struck.
2. **Test-consumed docs.** `docs/api.md` is test-consumed — editing it stales the chain receipt.
   **The full test-consumed set is not yet established**, and no doc may be called deletable until it
   is. This is the audit's first task, not an aside.

## Report-only

No cut is applied in this run. Each accepted finding becomes its own escalated follow-up. A finding
is a measured claim about what *could* go, and the decision to cut is the user's.

## What a reader must not do

- Do not file against the four-edition duplication. It is the architecture.
- Do not file against `kaola-workflow-adaptive-schema.js` byte-identity.
- Do not treat a low line count as low value, or a high one as high value — a 400-line dead script
  and a 3-line stale rule are both findings, ranked by lines but judged on their own.
- Do not propose a rewrite. This audit subtracts; it does not redesign.
