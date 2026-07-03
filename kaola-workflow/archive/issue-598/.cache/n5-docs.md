evidence-binding: n5-docs 8c9f71d91b5f

## n5-docs (doc-updater) — issue #598 documentation pass

Leg: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/issue-598/n5-docs` (branch on top of
kw-synth `fc229372`, which carries n1-runtime-dispatch-contract + n2-delegation-gate-prose). All
writes below were made under that leg path only; the parent worktree was never touched except this
evidence file.

### Ground truth read before writing
- `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` — `deriveDispatchPosture`,
  `dispatchPostureRemediation`, `DISPATCH_POSTURE_VERSION_NOTE`, the AC1 report block printed
  before `status: ok`.
- `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js` — the same helpers mirrored,
  `inspectScope` threading the 4 fields into every scope (incl. `plugin_cache: 'n/a'`/`null`), the
  JSON/plain-text `warn:` lines on both the normal gate and `--doctor`.
- `git diff de49a0d5^..fc229372` for n2's exact prose (`## Gate-Role Degradation Notice`, the
  `.codex/agents/kaola-workflow/` + `~/.codex/agents/kaola-workflow/` dual-path probe) and the new
  `validate-kaola-workflow-contracts.js` needles it added.
- Existing docs (README Codex section, docs/api.md Codex Harness Scripts, docs/architecture.md
  Codex harness hardening bullet, the workflow-init command/SKILL config-audit blocks) and the two
  most recent ADRs (D-596-01, D-597-01) for structure/format precedent.
- Confirmed via `diff` that the workflow-init command blockquote (lines 164-174) and the SKILL
  audit block (lines 134-148) are byte-identical across all 3 editions (modulo the plugin-root
  edition name), i.e. genuine "byte-pairs" — edited all 6 with matching text.

### Per-file changes (all 10 declared write-set files, nothing else)

1. **README.md** — added a "posture report" paragraph after the existing "Config audit for
   effort-safe subagents" section: transcribes the actual installer stdout (posture line, exact
   `explicitRequestOnly` remediation text, version-guard line, `status: ok`), states the
   report-only/never-fatal/never-writes-effort design boundary, and cross-references
   `docs/api.md`. Text verified byte-for-byte against `deriveDispatchPosture('')`'s output shape
   (adjusted to the explicitRequestOnly branch) and `DISPATCH_POSTURE_VERSION_NOTE`.

2. **docs/api.md** — under "Script: `kaola-workflow-codex-preflight.js`": added a "Dispatch-posture
   report" paragraph (the 4 additive fields, their derivation, ATTESTATION-STYLE/NON-FATAL,
   version-guard); updated the success JSON example and the typed-refusal note to carry the 4
   fields; updated the Doctor-mode `--json` schema list and added a note that `plugin_cache` reports
   `dispatch_posture: 'n/a'` / nulls, and that non-JSON output prints a `warn:` line per scope (and
   for the normal gate) whenever posture is non-`proactive`. Did NOT touch the pre-existing
   `dispatch_mode`/`multi_agent_v2_enabled` (#584/#332) documentation gap in this file (it was
   already undocumented before this issue) — out of this node's declared scope; noted here as an
   aside, not fixed.

3. **docs/architecture.md** — extended the "Preflight gate" bullet (Codex harness hardening §) with
   a `**Dispatch-posture report (#598).**` clause: explains the effort-gated MultiAgentMode gap the
   old tool-exposure-only check missed, states report-only/non-fatal/version-guarded, and that this
   closes the "ok while model-refused" gap.

4-9. **workflow-init command + SKILL pairs, ×3 editions** (`commands/workflow-init.md`,
   `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`, and the gitlab/gitea mirrors of
   both): extended the "features enabled" dispatch-readiness wording so it is no longer sufficient
   on its own.
   - Command blockquote: added 2 sentences pointing at the doctor JSON's `dispatch_posture` field,
     naming `proactive` vs `explicitRequestOnly` and the remediation, before the existing
     "never silently edit" close.
   - SKILL classification block: added a lead-in paragraph explaining the posture values, changed
     `ok` to additionally require `dispatch_posture: proactive`, added a new `explicit_request_only`
     tier (explicitly barred from being reported as `ok`), and folded `dispatch_posture: none` into
     the existing `needs_update` tier. Kept the existing 4 tiers' meaning otherwise unchanged.
   - Re-diffed all 6 files after editing: the edited blocks stay byte-identical across editions
     (verified via `diff`, only the pre-existing plugin-root-name lines differ, unrelated to this
     edit).
   - Forge-neutral, no `gh`/`glab` tokens introduced; provenance grep (`#\d+`, `D-\d{3}-\d{2}`,
     `INV-\d+`, `ADR[ -]\d+`) over all 6 files found zero matches before and after (these files
     carried no provenance to begin with).

10. **docs/decisions/D-598-01.md** (new) — ADR recording: the one-derivation-mirrored-everywhere
    design, the REPORT-never-WRITE boundary (effort is a user-owned cost/latency choice), the
    version-guard rationale, the delegation-probe dual-path fix, and the gate-role
    consent-halt-vs-silent-self-review closure. `Related:` D-584-01 (the audit this extends), #571,
    #332. 4 "Alternatives considered" entries record why the installer doesn't just write the
    config, why the WARN isn't fatal, why the coupling is version-guarded, and why gate-role
    degradation isn't a blanket hard-fail. Followed the D-596-01/D-597-01 plain-label format
    (`Date:`/`Status:`/`Issue:`/`Related:`, no bold labels — the more recent of the two observed
    conventions).

### Verification (run from the leg)
- `node scripts/validate-workflow-contracts.js` — exit 0, "Workflow contract validation passed".
- `node scripts/validate-kaola-workflow-contracts.js` — exit 0, "Kaola-Workflow Codex contract
  validation passed".
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — exit 0.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — exit 0.
  (Real exit codes captured via `$?` after redirecting to a log file, not piped through `tail`.)
- Provenance grep (`#[0-9]{1,4}|D-[0-9]{3}-[0-9]{2}|INV-[0-9]+|ADR[ -][0-9]{2,4}|(PR|MR|AC)#[0-9]+`)
  over all 6 workflow-init surfaces — zero matches.
- `git status --porcelain` in the leg — exactly the 10 declared files (9 modified + 1 untracked new
  ADR); no stray writes anywhere else.
- Markdown code-fence balance check (```` ``` ```` count even) on README.md / docs/api.md /
  docs/architecture.md — all balanced.
- Spot-verified every transcribed console string and JSON field against a live `require()` of the
  actual `deriveDispatchPosture` / `dispatchPostureRemediation` / `DISPATCH_POSTURE_VERSION_NOTE`
  exports (not guessed) — outputs matched what was written into the docs, byte-for-byte.

### Deviations from the task brief
- Did not run the full four-chain / `test-install-model-rendering.js` / `validate-script-sync.js`
  suite named in the plan's `validation_command` — that is n6-finalize's job over the merged tree
  (docs-only changes have no runtime behavior to chain-test, and this leg does not carry n3/n4's
  work locally to shell against). Ran only the verification explicitly asked of this node (the two
  contract-validator families + provenance grep + git status), all green.
- Left the pre-existing `dispatch_mode`/`multi_agent_v2_enabled` (#584) documentation gap in
  `docs/api.md`'s success-JSON example untouched — out of this node's declared write purpose
  (the four #598 fields specifically); flagged above rather than silently expanded in scope.
- CHANGELOG.md untouched, as instructed (n6-finalize owns it).
