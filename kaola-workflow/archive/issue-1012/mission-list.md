# Finish #1012 — stamp Grok subagent effort from the existing two canonical tiers

- item: Establish the current Grok generator and suite premise, then add acceptance pins that fail on HEAD when generated agents lack tiered `effort: medium|high` while retaining `model: inherit`.
  status: done
  dispatched: `tdd-guide` owns `scripts/test-grok-edition.js`; it added the acceptance pins and RED report at `kaola-workflow/issue-1012/.cache/tdd-red.md`, then received a follow-up to replace the obsolete `inherit_session_model` declaration key with the issue's explicit two-tier effort-pin declaration.
  result: `scripts/test-grok-edition.js` derives both rosters from canonical `model:` classes, pins inherited model plus medium/high effort across all three forge trees, and guards `GROK_RUNTIME_NATIVE.tiered_effort_pin`; `kaola-workflow/issue-1012/.cache/tdd-red.md` preserves baseline SHA `d681fd703bca25872b0a670730110eb0613e2488`, exit 1, and 70 intended missing-effort failures, followed by 543 green assertions after production landed.

- item: Make the Grok generator derive each emitted effort from the canonical agent class token, fail closed for unknown classes, and regenerate the additive edition without changing command-card model dispatch.
  status: done
  dispatched: `implementer` owns `scripts/sync-grok-edition.js`; it will implement the strict canonical-class mapping, keep model dispatch omitted, update now-false generated guidance, and leave GREEN evidence in `kaola-workflow/issue-1012/.cache/implementation.md`.
  result: `scripts/sync-grok-edition.js` now maps `sonnet|standard` to medium and `opus|reasoning` to high, throws on unknown or absent tokens, keeps `model: inherit`, and emits truthful model-free dispatch guidance; `kaola-workflow/issue-1012/.cache/implementation.md` records the 543-assertion green suite and three-tree parity.

- item: Dock the user-visible Grok tier binding in the edition guide, architecture pointer, and `[Unreleased]` changelog without leaking vendor literals into canonical consumer prompts.
  status: done
  dispatched: `doc-updater` owns `README.md`, `docs/grok-edition.md`, `docs/architecture.md`, `docs/README.md`, and `CHANGELOG.md`; the documentation diff lands directly in the issue worktree and its verification note lands at `kaola-workflow/issue-1012/.cache/docs.md` (follow-up expanded after repository scans found stale index and top-level README summaries).
  result: `README.md`, `docs/README.md`, `docs/grok-edition.md`, `docs/architecture.md`, and `CHANGELOG.md` now describe inherited Grok model plus canonical medium/high effort tiers; `kaola-workflow/issue-1012/.cache/docs.md` records clean diff and obsolete-prose scans, with `docs/api.md` correctly unchanged because no API or CLI surface moved.

- item: Produce live Grok close evidence from a parent at a different effort, showing one standard child at medium and one reasoning child at high on the inherited Grok 4.6 model.
  status: done
  dispatched: self — run one fresh Grok 4.6 parent at `xhigh`, dispatch `implementer` and `code-reviewer` with no per-call model override, and record parent/child session-summary evidence in `kaola-workflow/issue-1012/.cache/live-grok.md`.
  result: `kaola-workflow/issue-1012/.cache/live-grok.md` records passing actual-role evidence (`tdd-guide` medium, `code-reviewer` high, parent xhigh, all Grok 4.6, no spawn model override) and an additional A/B finding that Grok CLI 1.0.5 clamps the literal `implementer` name to high despite its emitted medium field.

- item: Review the finished diff, run the Grok edition suite plus required workflow validation, and record exact evidence before finalization.
  status: done
  dispatched: `code-reviewer` and `adversarial-verifier` independently inspect the finished issue diff and evidence, returning reports for `kaola-workflow/issue-1012/.cache/review.md` and `kaola-workflow/issue-1012/.cache/adversarial.md`; `tdd-guide` mutation-proves the new declaration guard in an isolated temporary copy and records `kaola-workflow/issue-1012/.cache/mutation.md`; self owns the executable validation and full walkthrough evidence.
  result: Both independent gates passed with zero blocking findings (`review.md`, `adversarial.md`); deletion of `tiered_effort_pin` made the isolated mutant suite exit 1 on the intended G2 assertions while the shared suite stayed green at 543 assertions (`mutation.md`); syntax, generator parity, three-tree Grok suite, 18 routing surfaces, canonical vendor-literal scan, and `git diff --check` passed, and the full workflow walkthrough passed 186/186 scenarios with 2,173 spawned processes (`validation.md`).

- item: Carry the observed Grok 1.0.5 `implementer` name clamp into the edition documentation and current issue record without adding a config, per-call override, or second pin path.
  status: done
  dispatched: `doc-updater` owns the measured limitation note in `docs/grok-edition.md` and `CHANGELOG.md`, with evidence amended in `kaola-workflow/issue-1012/.cache/docs.md`; self posts the same exact session-backed correction to issue #1012 after the wording lands.
  result: `docs/grok-edition.md` and `CHANGELOG.md` now identify the measured Grok CLI 1.0.5 literal-name clamp while preserving the single edition-owned tier pin; the matching session-backed issue correction is posted at https://github.com/KaolaBrother/Kaola-Workflow/issues/1012#issuecomment-5379633631.

- item: Complete the finalize-time documentation checklist and dock every changed surface against issue #1012 before the archive transaction.
  status: done
  dispatched: `doc-updater` at the standard-tier `gpt-5.6-luna` / `max` pair reviews the final seven-file diff, root `CLAUDE.md` documentation checklist, issue statement, and verified runtime/test evidence; it owns any required docs-only correction and records `kaola-workflow/issue-1012/.cache/doc-updater.md`.
  result: Finalize-time `doc-updater` returned `DOCKED` with no correction required; `kaola-workflow/issue-1012/.cache/doc-updater.md` and `.cache/doc-docking.md` reconcile all seven changed files, the user-visible checklist, issue correction, API/environment no-impact decisions, live evidence, and the green all-four chain receipt.
