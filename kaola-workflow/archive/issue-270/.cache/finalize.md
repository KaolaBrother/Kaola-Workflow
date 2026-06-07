# Node `finalize` (sink) — issue-270

Orchestrator-owned sink node (no finalize agent). Declared write set: CHANGELOG.md.

## Work done
- CHANGELOG.md `### Documentation` entry for #270 written under `## [Unreleased]` (the finalize node's sole declared write — a docs `.md` path, within the legal sink write band).

## Final validation evidence
- `npm test` (all 4 editions: claude/codex/gitlab/gitea) → exit 0. Evidence: `.cache/final-validation.md`. Sentinels: "Kaola-Workflow walkthrough simulation passed", "GitLab/Gitea workflow walkthrough simulation passed", contract validations passed, adaptive-node (104) / commit-node (27) / next-action (33) / adaptive-handoff (58) assertions PASSED, vendored agents (13) passed.

## Whole-plan barrier gates (Phase-6 merge gate) — all exit 0
- `--resume-check`: ok, planHash 9d95306b… matches.
- `--gate-verify`: ok, unsatisfied [] (no code/sensitive nodes → no reviewer gate required; trivial-docs band).
- `--barrier-check`: pass, errors [], sensitiveHits [], outOfAllow [] (docs + CHANGELOG paths exempt/allowed).
- `--verdict-check`: ok, failures [], checked [] (no gate-role nodes).

## Acceptance criteria (#270) — ALL MET
1. Status updated to "Shipped (#263, commit 84d6e23)" (L4 + top-of-section Resolution note). ✓
2. No conditional/future-tense/"planned"/"the one gap" framing remains in the Classify-And-Act material (residual "planned"/"missing tool" occurrences are correctly past-tense historical). ✓
3. Follow-ups referenced with ACCURATE status: #267 OPEN, #268 CLOSED, #269 CLOSED (verified via gh issue view + git). ✓
4. Rest of document unchanged: grammar examples (`select(fix)`, shape column), five-pattern table, G-SEL rule bodies, "What this is NOT"/"Out of scope" preserved; single-file diff. ✓

## Documentation docking
- DOCKED. Evidence: `.cache/doc-docking.md`.

## Sink
- merge → branch workflow/issue-270 → main; close #270. Base origin/main = 80b5e10 at finalize prep (re-check before sink; #277 in flight on another machine — CHANGELOG/ROADMAP are the collision band, rebase if origin/main advanced).
