# Finalization — Summary: issue-949

Retire the model badge repo-wide. The owner's rule governed every classification: *cosmetic
redundancy is deleted; functioning mechanism is kept.* Applying it honestly cut against deletion
twice, and the run measured before it removed anything.

## Delivered

**The badge is retired as a goal; the mechanism it was used to justify is not.** The finalize
command's `## Agent Model Badge` section told the orchestrator the `model=` line "is what shows the
model badge" — a visual side effect stated as the purpose. Measured against this project's own 283
subagent transcripts, that is backwards: the literal **is** the effective-model override. Where the
requested model differs from the parent's, the dispatch follows the request in **69 of 71** cases;
where a dispatch carries no `model=` and the role's declared tier differs from the parent, it follows
the **parent in 22 of 22**, never the tier map. Corroborated by the runtime's own schema strings
("Use `inherit` to match the spawning conversation"). Deleting the literals as cosmetic would have
moved `tdd-guide` and `doc-updater` off their assigned model on every finalize and un-pinned
`build-error-resolver` in any session not already running its tier.

**The heading was renamed, not deleted, because its string is a live anchor.** Six code sites match
on it. Measured on a mirror, deleting it reds three of the four chains — and the opencode and kimi
transforms do not fail at all: they silently no-op, dropping the sentence that tells those runtimes
their task tool has no model parameter. Both are re-anchored to `## Agent Model Dispatch` and now
**report** a stale anchor instead of missing it in silence, via a deliberately looser near-miss probe
scanned over the canonical body so an edition's own emitted heading cannot self-trigger it.

**Removed as cosmetic**: the badge explanation, the visibility-by-session-model blockquote, the
"restart Claude Code for the badges to take effect" instruction, the troubleshooting entry, and the
false purpose clause. **Kept as mechanism**: every `model=` placeholder, the dispatch rule,
`assertEveryDispatchHasModel`, the `REGION:command` directive, and the edition guidance. A negative
pin now keeps the retired heading from returning.

**Two findings the run surfaced and closed.** `DEFAULT_AGENT_MODELS` claimed to be "THE EFFECTIVE
TIER OF EVERY INSTALLED AGENT" — false for Claude Code, and precisely what made the literals look
redundant; its scope is now stated exactly, across all four byte-identical copies. And a measured
coverage asymmetry: deleting the canonical section was caught by the opencode suite while kimi passed
silently at 516 assertions; kimi gains the twin anchor assertion.

## Files Changed

20 files. Implementation commit `340351c5`.

| area | files | change |
|---|---|---|
| authoring source + generated | `templates/routing/finalize.skeleton.md` + 3 `kaola-workflow-finalize.md` | heading renamed, badge clause cut, rule restated with its real reason; regenerated, never hand-edited |
| edition transforms | `scripts/sync-opencode-edition.js`, `scripts/sync-kimi-edition.js` | re-anchored, de-badged identifiers/comments, near-miss anchor guard added |
| guards | `scripts/validate-workflow-contracts.js`, gitlab + gitea + codex copies | anchor repointed; negative pin added against the retired heading |
| edition suites | `scripts/test-opencode-edition.js`, `scripts/test-kimi-edition.js` | anchors repointed; `K2-anchor` added to kimi |
| resolver | `kaola-workflow-resolve-agent-model.js` ×4 | comment-only scope correction, byte-identical |
| prose | `README.md`, `docs/architecture.md`, `install.sh` | cosmetic badge wording removed, functional sentences kept |
| record | `CHANGELOG.md` | `[Unreleased]` under Changed + Fixed |

Test custody held: four `implementer` agents wrote production; `tdd-guide` alone wrote every
test/guard path, last, and verified against the final tree.

## Test Coverage

Re-run **serially by the orchestrator** in the worktree, absolute paths, real exit codes — no
subagent's green taken on faith:

| suite | result |
|---|---|
| `simulate-workflow-walkthrough.js` (FULL scope) | 209/209, `"total":1` unsharded, exit 0 |
| `test-opencode-edition.js` | 563 assertions, exit 0 (unchanged — correct for a pure re-anchor) |
| `test-kimi-edition.js` | **521**, exit 0 (was 516; +5 for `K2-anchor`) |
| `validate-workflow-contracts.js` + gitlab + gitea + codex | exit 0 ×4 |
| `generate-routing-surfaces.js --check` | 18 surfaces byte-match, exit 0 |
| `test-generate-routing-surfaces.js` | 434, exit 0 |
| `test-route-reachability.js` | 331, exit 0 |
| `validate-script-sync.js`, `test-agent-model-resolver.js`, `test-install-model-rendering.js` | exit 0 |

Live badge sweep, case-insensitive, excluding `CHANGELOG.md`, `kaola-workflow/archive`,
`kaola-workflow/.origin`, `docs/decisions`, `docs/investigations`, `docs/audits`: the **only**
survivors are the four `assertNotIncludes(file, 'Agent Model Badge')` pins and their comments — the
ratchet that keeps the retired heading out, which is functional and therefore correctly kept.

Guards proven armed, not merely green: `K2-anchor` reds on a mirror with the section removed **and
the pre-change kimi suite passed at 516 against that same tree**, which is what makes the new
assertion meaningful; the near-miss anchor probe fires on a stale anchor; the resolver parity guard
was re-proven against shipped bytes with a vacuity interlock, drifting a different copy than the
first pass; and the two validator assertion families unreachable since the rename were mutation-
proved on restoration.

## Validation

## Changed Paths

## Documentation Docking

`DOCKED`. `CHANGELOG.md` written **before** the receipt run. `README.md`, `docs/architecture.md` and
`install.sh` are the docking targets and were edited in-run — `README.md` is in
`SELF_HOST_TEST_CONSUMED`, so that edit is code-relevant and had to land before the chains, which it
did. `docs/api.md`, `docs/workflow-state-contract.md` and `docs/agents-source.md` carry nothing this
diff changed. `docs/decisions/`, `docs/investigations/` and `docs/audits/` are dated historical
records, sanctioned residue per `docs/README.md:26-42`, deliberately untouched.

## Run gaps

- manual:filed-premise-refuted (#949 was originally filed as "two doc surfaces overclaim badge coverage"): noise: a defect in this issue's own original wording, not in the tree, and already corrected by rewriting #949 in place before any code was touched. Measured, "every dispatch" is 3 of 3 and assertEveryDispatchHasModel is what keeps it true. Recorded so the refuted overclaim is not re-filed from the old text.
- manual:codex-validator-copy-exits-1-standalone (`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` exits 1 when invoked directly): noise: pre-existing and unrelated to this run. It resolves its root to a directory with no commands/, so a direct invocation fails at the first assertion; it is a shipped byte copy never run from that location, as scripts/kaola-workflow-prose-census.js:175 states. Identical before and after the anchor rename, so its exit code is not a regression.
- manual:badge-word-survives-only-as-negative-pin (after the retirement, the only live case-insensitive occurrences of "badge" outside CHANGELOG): noise: intentional and functional. The four assertNotIncludes pins and their comments are the ratchet keeping the retired heading out, so they are exactly what the owner's rule preserves. Recorded so a later census does not read them as missed removal targets and delete the ratchet.

## Follow-Up Items

- #950 — `docs/conventions.md:325` cites an assertion count stale by 6. Untouched by this run.
- #951 — A30 cannot see the source-edit footer line being dropped. Untouched by this run.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-949/.cache/badge-census.md
- kaola-workflow/archive/issue-949/.cache/chain-receipt.json
- kaola-workflow/archive/issue-949/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-949/.cache/impl-guards.md
- kaola-workflow/archive/issue-949/.cache/impl-prose.md
- kaola-workflow/archive/issue-949/.cache/impl-resolver-comment.md
- kaola-workflow/archive/issue-949/.cache/impl-skeleton.md
- kaola-workflow/archive/issue-949/.cache/impl-sync.md
- kaola-workflow/archive/issue-949/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-949/.cache/premise-model-literal.md
- kaola-workflow/archive/issue-949/.cache/run-gaps-manual.md
- kaola-workflow/archive/issue-949/.cache/run-gaps.json
- kaola-workflow/archive/issue-949/finalization-summary.md
- kaola-workflow/archive/issue-949/mission-list.md
- kaola-workflow/archive/issue-949/workflow-state.md
