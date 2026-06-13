evidence-binding: n7_doc_contractor e0829e5474aa

## Files changed

### agents/contractor.md

Two additions, both structurally separate from the Step 8 gap-sweep region (no #435 regions touched):

1. New subsection "Step 8b — Sink routing for worktree runs (#429)" inserted between the existing Step 8b body and Step 7. Section instructs the contractor to check `run_posture` in `workflow-state.md` after Step 8b and, when `run_posture: worktree`, route the orchestrator to `kaola-workflow-sink-merge.js --sink` instead of the manual 8-step choreography.

2. New inline note "`inline_execution_suspected` verifier note (#434)" inserted at the end of the Step 8a bash fence block (just before Step 8b). Instructs the contractor to check for `inline_execution_suspected: true` in the prior node's `close-and-open-next` response and surface it under "Evidence Transcribed". Explicitly marked as informational and non-blocking.

### plugins/kaola-workflow/agents/contractor.toml

Two new bullet points added immediately before the existing "Boundary: Step 9" line in the Finalize bookkeeping subsection:
- Sink routing for worktree runs (#429) — forge-neutral prose, no binary names.
- inline_execution_suspected verifier note (#434) — forge-neutral prose, no binary names.

### plugins/kaola-workflow-gitlab/agents/contractor.toml

Same two bullet points added in the same position as the kaola-workflow toml. Content is byte-identical to the kaola-workflow toml (forge-neutral; no gh/glab/tea binary references).

### plugins/kaola-workflow-gitea/agents/contractor.toml

Same two bullet points added in the same position as the kaola-workflow toml. Content is byte-identical to the kaola-workflow toml (forge-neutral; no gh/glab/tea binary references).

## #435 gap-sweep isolation confirmation

No edits were made to the Step 8 gap-sweep region. The two additions are placed:
- The `inline_execution_suspected` note: at the tail of Step 8a (the artifact-mirror section), before Step 8b begins.
- The `--sink` routing note: as a new `### Step 8b — Sink routing for worktree runs (#429)` subsection, between the Step 8b body and Step 7.

Neither location overlaps with the Step 8 commit-gate or any parallel-batch / gap-sweep prose that a #435 node would own.
