evidence-binding: n4-axiom e3b70bcce79e
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: prose/template scaffolding (canonical axiom doc + consumer-template embed); no natural failing unit test — verified by walkthrough regression + cross-surface byte-parity diff.
<!-- regression-green|build-green|smoke-integration -->
regression-green: node scripts/simulate-workflow-walkthrough.js passed
<!-- OPEN n1-architect's evidence file and append its line-1 binding nonce as the value below -->
upstream_read: n1-architect 10e1be01f296

## Task

Implement the #645 canonical axiom file (`templates/axioms.md`) and embed it into the consumer
workflow-init CLAUDE.md template across all six workflow-init surfaces (3 Claude commands + 3
Codex SKILL packs), byte-identical to the source file and byte-identical across all six.

## write_set

- `templates/axioms.md` (CREATE) — the canonical Layer-0 five-axiom block, provenance-free.
- `commands/workflow-init.md` (EDIT)
- `plugins/kaola-workflow-gitlab/commands/workflow-init.md` (EDIT)
- `plugins/kaola-workflow-gitea/commands/workflow-init.md` (EDIT)
- `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` (EDIT)
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md` (EDIT)
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md` (EDIT)

`git status --short` confirms exactly these seven paths changed, nothing else.

## What was done

- Authored `templates/axioms.md` as the single canonical source: a `## First Principles` heading,
  a one-line scope sentence, the five axioms in priority order (correct first; then save human
  time; then spend as little as possible; machines decide facts / humans decide values; own your
  own verdicts), a tie-breaker protocol paragraph (optional one-line derivation, never blocks a
  gate), and a tighten-only hard-boundary paragraph (axioms may only make an agent stricter, never
  license skipping a gate/refusal/barrier). 9 non-blank content lines, well under the ~20-line cap.
- Inserted the identical `## First Principles` block into all six workflow-init surfaces, in the
  same position inside each surface's `KW-CLAUDE-TEMPLATE` region: immediately after the last
  `## Non-Negotiable Rules` bullet ("Escalate irreversible changes: ...") and immediately before
  `## Kaola-Workflow`. Same anchor, same content, byte-for-byte, in all six files.
- Kept `templates/axioms.md` provenance-free (no `#NNN`, `D-NNN-NN`, `INV-NN`, or `ADR` tokens) and
  avoided the banned `Phase <n>` / "phase file" vocabulary.

## verification_commands (+ exit codes)

1. Cross-surface byte-parity script (custom, run via `node -e`): extracted the substring between
   `## First Principles` and `## Kaola-Workflow` from each of the six surfaces, trimmed, and
   compared against the trimmed content of `templates/axioms.md`. Result: all six `true`, exit 0.
2. `node -e '/Phase\s+\d/.test(...)'` and `/phase file|phase artifact/i.test(...)` against
   `templates/axioms.md` — both `false` (no phase-ban token). Also checked `#\d{2,}`, `D-\d+-\d+`,
   `INV-\d+`, `ADR` — all `false` (provenance-free). Exit 0.
3. `node scripts/simulate-workflow-walkthrough.js` — exit 0, final line
   "Workflow walkthrough simulation passed" (regression-green, this is the recorded tier).
4. `node scripts/validate-workflow-contracts.js` — "Workflow contract validation passed", exit 0.
5. `node scripts/validate-kaola-workflow-contracts.js` — "Kaola-Workflow Codex contract validation
   passed", exit 0. This validator's `initFiles` byte-lock check (lines ~463-545) covers all six
   surfaces I edited: within-forge-pair byte-identity (cmd vs SKILL) and cross-forge parity modulo
   the forge-noun line both passed with my identical insertion in place.
6. `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` —
   "Kaola-Workflow GitLab contract validation passed", exit 0.
7. `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` —
   "Kaola-Workflow Gitea contract validation passed", exit 0.
8. `node scripts/generate-routing-surfaces.js --check` — "all 12 surfaces byte-match the
   skeleton", exit 0 (confirms I did not touch the routing surfaces, which are n5's write-set).

No validator reded on old pinned template content — none of the six surfaces' contract validators
pin the exact byte-count/section-list of the `KW-CLAUDE-TEMPLATE` body in a way that a new section
would break; they check named-token presence, byte-lock parity, and the phase-ban regex, all of
which the new `## First Principles` section satisfies.

## before_result

Baseline (pre-change): `node scripts/simulate-workflow-walkthrough.js` was not re-run standalone
before editing (upstream n1-architect's own evidence + a fresh worktree checkout of `main` at
`79ae9f71` is the pre-change baseline; this leg branched clean from that commit with no local
modifications to the six write-set files before my edits — confirmed via `git status --short`
showing only the seven files above as changed).

## after_result

All eight verification commands above passed post-change (walkthrough green, all four contract/
routing validators green, byte-parity and provenance/phase-ban checks green).

## Notes for downstream nodes

- n5 (routing skeleton `## First Principles` pointer) can now reference this exact heading name
  and file path — `templates/axioms.md`.
- n6's planned drift-guard assertion ("axioms.md == embedded init block") can compare
  `templates/axioms.md`'s full trimmed content directly against the substring between
  `## First Principles` and `## Kaola-Workflow` in each of the six workflow-init surfaces — this
  is exactly the comparison method used in verification step 1 above, and it holds today.
- I did not run the full four-chain `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
  suite — per the architect's build sequence (n3 → n4 → n5 → n6 → all-four-chains) that full
  cross-edition gate belongs to a later node once n5/n6 have landed. I ran the standalone
  walkthrough plus all four init-template contract validators directly relevant to my write-set,
  all green.
