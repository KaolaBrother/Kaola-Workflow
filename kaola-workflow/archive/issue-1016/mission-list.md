# Bind Cursor catalog ensure to a production script and sessionStart so /workflow-next does not impersonate via generalPurpose

- item: Author G10 RED pins in scripts/test-cursor-edition.js from the #1016 plan-of-record comments (5383907624 Layer 4, freshness amendment 5383958037 overrides Layer 1–2: global is source of truth, already-present is all-14 byte-identical to $CURSOR_HOME/agents, drop git-toplevel preference, no lone implementer.md sentinel for present); prove RED on HEAD f3642cb0; do not touch init.skeleton.md overlay; 3b sessionStart hook pins included
  status: done
  dispatched: tdd-guide named Task omit-model; worktree /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016; evidence to land at kaola-workflow/issue-1016/tdd-red.md in the main-root active folder
  result: kaola-workflow/issue-1016/tdd-red.md — 28 intended FAILs / 608 passed on f3642cb0; G10 follows amendment 5383958037 (global source, all-14 byte-identical); overlay-untouched and supportScripts exclusion stayed green; no git-toplevel-preference pin

- item: Implement ensure CLI self-contained under scripts/kaola-workflow-ensure-cursor-catalog.js, point CURSOR_MODEL_DISPATCH_BLOCK at it, extra-script deploy/uninstall in install-cursor.sh, second sessionStart ensure hook that prints {}, docs/README/CHANGELOG Unreleased; no consumer overlay; no Task(model=); no #1013 restamp; freshness rules from comment 5383958037
  status: done
  dispatched: implementer named Task omit-model; worktree /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016; do not author tests; evidence to kaola-workflow/issue-1016/implement.md in the main-root active folder
  result: kaola-workflow/issue-1016/implement.md — ensure CLI + block + extra-script + sessionStart hook + docs; orchestrator re-ran cursor-edition 687 assertions exit 0 and --check 0; overlay and install-manifest untouched

- item: Confirm GREEN on the G10 pins in scripts/test-cursor-edition.js after implement; tdd-guide holds the test artifact and does not write production
  status: done
  dispatched: tdd-guide named Task omit-model; worktree /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016; evidence to kaola-workflow/issue-1016/tdd-green.md; do not write production
  result: kaola-workflow/issue-1016/tdd-green.md — exit 0, 687 assertions; G10 RED labels now pass; overlay and install-manifest freeze hold

- item: Run node scripts/test-cursor-edition.js on the finished tree; no four-chain unless a skeleton edit leaked
  status: done
  dispatched: self; orchestrator already ran the suite after implement (687 assertions, exit 0); tdd-guide GREEN confirm is the custody check
  result: worktree `node scripts/test-cursor-edition.js` exit 0, 687 assertions; `sync-cursor-edition.js --check` exit 0; no four-chain (no skeleton leak)

- item: Live close evidence on a consumer-shaped repo with no project .cursor/agents and pinned ~/.cursor/agents — control Invalid-enum, ensure materializes catalog, new chat named omit-model envelopes cursor-grok-4.6-medium vs high, zero generalPurpose/inherit; mid-session copy does not count
  status: done
  dispatched: self via agent -p stream-json in isolated /tmp consumer; streams to kaola-workflow/issue-1016/.cache/; ensure CLI from worktree; do not re-init CLAUDE.md
  result: kaola-workflow/issue-1016/.cache/live-cursor.md — control session 27f72171 Invalid-enum, no generalPurpose retry; ensure copied then already-present; new chat 812b7b22 envelopes implementer cursor-grok-4.6-medium and code-reviewer cursor-grok-4.6-high; overlay sentence still in consumer CLAUDE.md

- item: Independently review the finished worktree diff and mutation-check that G10 cannot stay green if the ensure path is unbound; live streams independently parsed
  status: done
  dispatched: code-reviewer and adversarial-verifier named Task omit-model; evidence to kaola-workflow/issue-1016/.cache/review.md and adversarial.md
  result: review.md pass (0 blocking). adversarial.md refuted conjunct 1 (R1): G10-cli isolated is typeof-only and G10-hook dest pin is implementer.md only, so a shrunk isolated CANON_AGENT_NAMES stays green; other seven attacks not_refuted

- item: Close adversarial R1 — isolated ensure copy must actually copy all listCanonAgents() names; G10-cli must drive the isolated module not only typeof; drop sibling listCanonAgents prefer so in-tree and --global copies share one roster
  status: done
  dispatched: tdd-guide named Task omit-model owns the G10-cli isolated-drive pins in the worktree; production sibling-prefer already removed by orchestrator in kaola-workflow-ensure-cursor-catalog.js; evidence to kaola-workflow/issue-1016/.cache/r1-tdd.md
  result: kaola-workflow/issue-1016/.cache/r1-tdd.md — isolated-drive pins + G10-hook all-14 dest; worktree suite 778 assertions exit 0; /tmp shrunk CANON_AGENT_NAMES makes lone dest already-present (old typeof pin would stay green)

- item: Dock docs against the finished diff and CLAUDE.md user-visible checklist; then finalize
  status: done
  dispatched: doc-updater named Task omit-model; worktree; evidence to kaola-workflow/issue-1016/.cache/doc-updater.md and doc-docking.md
  result: kaola-workflow/issue-1016/.cache/doc-docking.md — verdict DOCKED; api.md + cursor-edition.md + Unreleased changelog gained status tokens and extra-script; architecture/.env.example no-impact

- item: Ledger `kaola-workflow-ensure-cursor-catalog.js copyFileSync` in test-kernel-conformance.js NON_ATOMIC_EXEMPT as mirror-copy (idempotent consumer-catalog copy, dest is not a kernel record); prove RED on HEAD 67e86616 then GREEN after the row; do not write production
  status: done
  dispatched: tdd-guide named Task omit-model; worktree /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016; evidence to kaola-workflow/issue-1016/.cache/kernel-ledger.md; do not write production
  result: kaola-workflow/issue-1016/.cache/kernel-ledger.md — RED on 67e86616 PART F unledgered copyFileSync; GREEN 252 assertions after mirror-copy row; production untouched
