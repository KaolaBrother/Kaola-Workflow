# Build ADR 0017: the mission list replaces the node/DAG executor (issue #877)

- item: Write the file format and the four fields — a written convention plus one real file (step 1). Nothing is deleted in this step.
  status: done
  dispatched: self
  result: docs/mission-list.md (the convention) and this file (the real one).

- item: Find what is load-bearing outside node execution before the host dies (step 3 input) — the finalize attribution sweep, the consent path in the guard prologue, nonce minting, and which adaptive-schema.js exports survive.
  status: in-flight
  dispatched: subagent `recon-loadbearing` (code-explorer, opus), read-only, reporting to kaola-workflow/.origin/877/loadbearing.md

- item: Inventory every surface that implements or describes the DAG — canonical scripts, tests, the four editions, prompt surfaces, installer wiring, docs (step 4/5 input).
  status: in-flight
  dispatched: subagent `recon-surfaces` (code-explorer, sonnet), read-only, reporting to kaola-workflow/.origin/877/surfaces.md

- item: Observe this run carrying itself end to end — decompose, dispatch, close, and resume after an interrupted dispatch. This item gates every deletion below it (step 2).
  status: todo

- item: Extract the load-bearing pieces onto the list form (step 3) — re-point the finalize door at recorded per-item locators, keep the consent path alive where it physically lives, and keep surviving constants in the byte-identical adaptive-schema.js.
  status: todo

- item: Delete the node executor and let its tests fall out (step 4). Tests are deleted with their mechanism, never repaired ahead of it.
  status: todo

- item: Propagate to the four editions and the runtime prompt surfaces (step 5), including agents/*.md and the three hand-maintained plugins/*/agents/*.toml twins that no generator owns.
  status: todo

- item: Rewrite CLAUDE.md to describe what ships and remove its ADR 0017 banner; update the rest of the docs (step 6, last).
  status: todo

- item: Independent verification before finalize — a Fable-model verifier reads the campaign against ADR 0017 and reports drift, over-reach, or a step claimed but not done.
  status: todo

- item: Finalize — validation chains receipt, CHANGELOG, roadmap, archive this run, close #877.
  status: todo
