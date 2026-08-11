# Premise pass — #952 subtraction audit

Run inline by the orchestrator after three subagent dispatches died on a transport fault. Measured in
the worktree at `workflow/bundle-952-953-954-955`, 2026-08-11.

## Premise 1 — "the 84-file scripts/ count" → CORRECTED (minor)

`find scripts -type f | wc -l` = **82**, not 84: 81 `.js` plus one `.json`
(`prose-census-baseline.json`). `scripts/` is flat — no subdirectories, no per-forge variants inside
it. Two files have gone since the figure was taken; nothing about the audit turns on this.

**But the count is the wrong denominator.** The forge editions do not live under `scripts/` — they
live under `plugins/`:

| tree | `.js` files |
|---|---|
| `scripts/` (canonical) | 81 |
| `plugins/kaola-workflow/scripts/` | 26 |
| `plugins/kaola-workflow-gitlab/scripts/` | 30 |
| `plugins/kaola-workflow-gitea/scripts/` | 30 |
| **total** | **167** |

An audit scoped to `scripts/` alone sees 48% of the script surface and, more importantly, cannot see
that a line deleted from a ported file is deleted up to four times.

## Premise 2 — "24% byte-identical duplication" → SURVIVES as a number, FRAMING REFUTED

Measured over all 167 `.js` files (10,406,933 bytes), grouping by MD5:

```
dup groups: 25 · redundant files (copies beyond first): 44 · redundant bytes: 2,421,305
BYTE-IDENTICAL DUPLICATION: 23.3% of bytes, 26.3% of files
```

23.3% against a filed 24% — the figure holds. **Its framing does not.** Decomposing that redundancy
by whether the duplicate is an edition port (same basename, one copy per edition root) or a genuine
second copy:

```
all redundant bytes:      2,421,305  (23.3% of tree)
edition-port redundancy:  2,417,612  (23.2%)
NON-PORT redundancy:          3,693  ( 0.04%)
```

- **No duplicate file lives twice inside a single edition tree.** Zero groups.
- Exactly one group has differing basenames — `kaola-gitlab-workflow-compact-context.js` /
  `kaola-gitea-workflow-compact-context.js`, 3,693 bytes. That is a *rename-normalized forge port*,
  which the repo's own release tooling already treats as a port. So it is not copy-paste either.

**Genuine, non-architectural duplication in this tree is effectively zero.**

The 23.2% is the deliberate four-edition port structure, which `CLAUDE.md` names as load-bearing —
`kaola-workflow-adaptive-schema.js` is "byte-identical across all four editions — the cross-edition
drift anchor" — and which `edition-sync.js --check` guards. It is not waste awaiting a cut; it is the
mechanism. The largest groups are the ones the design most depends on: `codex-preflight` (171 KB ×4),
`install-codex-agent-profiles` (128 KB ×3), `adaptive-schema` (97 KB ×4), `validation-runner`
(87 KB ×4).

### What this does to the audit

The issue asks for findings "ranked by net deletable lines". Two consequences:

1. **Duplication is not a finding class here.** Any reader who opens the tree, sees 25 duplicate
   groups, and files `delete:` findings against them is filing against the architecture. The audit
   brief must say so, or it will produce a report whose top-ranked findings are all wrong.
2. **"Net deletable lines" needs a multiplier rule.** One line cut from a ported canonical file is
   cut ×3 or ×4 downstream. Without a stated rule, two findings of equal real value rank differently
   depending only on whether their file happens to be ported — and the ported ones will dominate the
   ranking for a reason that has nothing to do with whether the cut is a good idea.

The live finding classes are therefore `yagni:`, `shrink:`, `stdlib:`, `native:` over **single-copy
material**, plus whatever `delete:` candidates survive a genuine zero-consumer search.

## Premise 3 — the docs/ surface

`docs/` is **198 files / 34,359 markdown lines**. Top level: `agents-source.md`, `api.md`,
`architecture.md`, `conventions.md`, `kimi-edition.md`, `opencode-edition.md`, `README.md`,
`workflow-state-contract.md`, plus `audits/`, `decisions/`, `investigations/`.

`docs/audits/` exists and holds one file (`opencode-edition-audit.md`, 29 KB) — so the report has a
home and a format precedent.

Not yet measured inline: which docs are test-consumed. `docs/api.md` is known to be
(editing it stales the chain receipt); others must be established by grepping the suite before any
doc is called deletable. **This is the one open item of this premise pass** and is carried into the
audit brief rather than left implicit.

## Premise 4 — the named exclusions

- `scripts/kaola-workflow-adaptive-schema.js` — confirmed ×4 byte-identical, 96,872 bytes each;
  excluding it removes 290,616 redundant bytes (12% of all redundancy) from the candidate surface.
- ADR 0017 "built once, removed, recoverable" rows — in
  `docs/decisions/0017-the-mission-list.md`; not re-verified inline (the #954 premise pass reads that
  file and will confirm).

## Verdict

The audit is worth running, but **not the audit as filed**. Its headline premise is a real number
attached to a wrong conclusion: the duplication it points at is the edition-port architecture, is
guarded, and is not deletable. Scoped to single-copy material with a stated multiplier rule for
ported files, there is a genuine surface — 81 canonical scripts and 198 docs — for `yagni:`,
`shrink:` and `delete:` findings.

### Method note

The first capture of the byte measurement died partway (`xargs: command line cannot be assembled,
too long`) and returned 82 of 167 files, which would have reported **0.2%** — a clean, plausible,
completely wrong number, and wrong in the direction that would have killed the audit. It was caught
only by asserting captured-lines == expected-files. That is the same failure
`scripts/measure-validator-duplication.js` documents in its header, which is why that file exists.
Every figure above comes from a capture proven complete (167 = 167).
