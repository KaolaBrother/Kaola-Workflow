# Node `impl-model` evidence — issue #250 (`implementer` role) model wiring

## Change type
Config/model wiring only. No behavioral logic added. No natural failing unit test exists for inserting a key into a static lookup table. Verification is change-type-appropriate: resolver before/after + byte-identity check + syntax check + resolver unit test. Full install e2e gates blocked by T5 dependency (see below).

## Declared write set (6 files touched — no others)
1. `scripts/kaola-workflow-resolve-agent-model.js`
2. `plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js`
3. `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js`
4. `plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js`
5. `install.sh`
6. `uninstall.sh`

## Before (RED-ish) — resolver output BEFORE edit
```
node scripts/kaola-workflow-resolve-agent-model.js implementer
(no output — empty string, falls through to step 4 in resolver)
EXIT: 0
```

## After (GREEN) — resolver output AFTER edit
```
node scripts/kaola-workflow-resolve-agent-model.js implementer
sonnet
EXIT: 0
```

## Gate 3 — validate-script-sync.js (resolver ×4 byte-identity)
```
node scripts/validate-script-sync.js
OK: 14 common scripts and 5 byte-identical file group in sync.
EXIT: 0
```
Confirms all 4 resolver copies are byte-identical after the `'implementer': 'sonnet',` insertion.

## Gate 4 — bash -n (install.sh + uninstall.sh syntax)
```
bash -n install.sh uninstall.sh
(no output)
EXIT: 0
```

## Gate 5 — existing resolver unit test
```
node scripts/test-agent-model-resolver.js
Agent model resolver tests passed
EXIT: 0
```

## Gate 5 — test-install-model-rendering.js
```
EXIT: 1
Error: Required agent source not found: .../agents/implementer.md
```
Root cause: `install_agent_files` validates every REQUIRED_AGENTS member has a source `.md` before installing. `agents/implementer.md` is the T5 node's deliverable (separate node, out of this lane's write set). This is an end-to-end install gate; explore.md line 126 places `install.sh --dry-run` and these install tests at the **review node**, not the per-node barrier. The 6 in-lane edits are correct; the install e2e cannot pass until T5 lands `agents/implementer.md`.

## Gate 5 — test-install-upgrade-rewrite.js
```
EXIT: 1
Error: Required agent source not found: .../agents/implementer.md
```
Same root cause as above — identical T5 dependency.

## Gate 6 — install manifest verification
Cannot confirm end-to-end manifest until `agents/implementer.md` exists. The resolver logic is correct (gate 3 + after output confirm `implementer → sonnet`). Once T5 lands, the install will write `"implementer": "sonnet"` into `.kaola-agent-models.json` automatically via the `emit_agent_model_manifest` loop over `REQUIRED_AGENTS`.

## Summary
- Resolver before: (empty — no entry) | after: `sonnet`
- validate-script-sync: EXIT 0 (all 4 copies byte-identical)
- bash -n install.sh uninstall.sh: EXIT 0
- test-agent-model-resolver.js: EXIT 0
- test-install-model-rendering.js: EXIT 1 (T5 dependency — agents/implementer.md missing)
- test-install-upgrade-rewrite.js: EXIT 1 (T5 dependency — same)

In-lane wiring is complete and correct. Install e2e gates are review-node gates per explore.md L126; they cannot be green until T5 (agent profile node) delivers `agents/implementer.md`.
