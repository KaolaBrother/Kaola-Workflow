# Add a first-class additive Grok CLI edition for #1008

- item: Confirm the Grok 1.0.5 native surface (agents/commands/hooks/payloads/inspect) against live inspect and user-guide; pick one generated-tree layout
  status: done
  dispatched: self. Layout decision lands inline in this result. Measurement already on #1008 plus grok inspect 1.0.5.
  result: Layout is `.grok/{agents,commands,hooks}` (github); `.grok-<forge>/` siblings. Commands stay flat `*.md` (Grok inspect already treats Claude `commands/*.md` as slash skills). Agents are named `spawn_subagent` types with `model: inherit`, no `effort:`. Hooks are Claude-JSON with camelCase payload adaptation. Support scripts at `${GROK_HOME:-$HOME/.grok}/kaola-workflow/scripts`. Inherit-tier comment on #1008 is current.

- item: Generator + installer + hook adaptation so a Claude-free install yields three commands, 14 named roles, both hooks, `--runtime grok`, inherit-only model
  status: done
  dispatched: self (orchestrator) in worktree .kw/worktrees/grok-cli-edition.
  result: scripts/sync-grok-edition.js + install-grok.sh. 14 named agents (knowledge-lookup loads after YAML-quoting descriptions), 3 commands with spawn_subagent and --runtime grok, camelCase dispatch-log, hooks.json uses ${GROK_HOME:-$HOME/.grok}. Suite 442/442. Live grok inspect from this checkout sources commands+all 14 agents from .grok/.

- item: Author `scripts/test-grok-edition.js` from #1008 acceptance plus the inherit-tier comment; prove it fails on HEAD
  status: done
  dispatched: tdd-guide (reasoning tier). Write set is scripts/test-grok-edition.js plus a grok row in test-install-all.js, in the worktree.
  result: scripts/test-grok-edition.js (788+ lines). HEAD archive red: generator not present + install-all must name grok (2 fail / 6 pass). test-install-all.js gained KNOWN_INSTALLERS grok row; HEAD archive 5 fail / 252 pass.

- item: Wire `install-all.sh`, `generate-routing-surfaces.js --write` refresh, and claim `--runtime grok` help; keep grok out of `npm test` / `edition-sync.js` / `install.sh`
  status: done
  dispatched: self in the worktree.
  result: RUNTIMES includes grok; generate-routing-surfaces --write refreshes sync-grok-edition.js; claim help lists grok. test-install-all 259/259. edition-sync FORGES unchanged; npm test does not invoke test-grok-edition.js; install.sh has no grok. editions script does.

- item: Discoverability docs — `docs/grok-edition.md`, README, docs/README, architecture table grok column (inherited + pointer), CLAUDE.md additive sentence, CHANGELOG
  status: done
  dispatched: self in the worktree.
  result: docs/grok-edition.md; README table+install+reinstall; docs/README; architecture 5-column table (grok model cell: inherited → grok-edition.md); CLAUDE.md additive sentence + install command; CHANGELOG [Unreleased]; docs/api.md.

- item: Live install in this session and a dispatch-log line from a Grok `spawn_subagent` as close evidence
  status: done
  dispatched: self. ./install-grok.sh --target <main checkout> --yes; grok inspect; spawn explore; hook payload simulation.
  result: grok inspect from this checkout — 14 custom agents including knowledge-lookup from .grok/agents/; three commands from .grok/commands/; grok hooks registered. Mid-session spawn did not fire newly installed hooks (session started before install). Feeding the adapted hook a camelCase payload wrote kaola-workflow/grok-cli-edition/.cache/dispatch-log.jsonl (`agent_type: explore`). A new Grok session is what would fire SubagentStart live.
