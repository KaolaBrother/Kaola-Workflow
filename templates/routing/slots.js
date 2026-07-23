'use strict';

// slots.js — slot + splice data for the routing-surface render engine.
//
// SLOTS are the larger structural pieces a skeleton fills per render context:
// the frontmatter (2-shape: command description/argument-hint vs skill
// name/description), the H1, the intro paragraph, the setup-resolver runtime
// bash block, and (for next) the routing table. SPLICES are the smaller
// mid-paragraph divergences where a command and skill (or a github vs forge
// command) differ by only a clause or a route noun.
//
// Every value is either a string or an object keyed by surface_type and/or
// forge; the engine's resolveKeyed() descends surface_type first, then forge.
// Values are byte-exact reverse-engineered from the current committed surfaces,
// so the generator is a no-op on a clean tree. The forge-noun renames that the
// engine applies afterward (rename-table.js) never touch these values (the
// forge branches already carry their forge basenames; the github branch is the
// canonical namespace).

const REPLAN_SCRIPTS = {
  github: 'kaola-workflow-replan.js',
  gitlab: 'kaola-gitlab-workflow-replan.js',
  gitea: 'kaola-gitea-workflow-replan.js',
};

const REPLAN_LOCAL_DIRS = {
  github: './plugins/kaola-workflow/scripts',
  gitlab: './plugins/kaola-workflow-gitlab/scripts',
  gitea: './plugins/kaola-workflow-gitea/scripts',
};

const REPLAN_CACHE_PACKAGES = {
  github: 'kaola-workflow',
  gitlab: 'kaola-workflow-gitlab',
  gitea: 'kaola-workflow-gitea',
};

function replanResolver(surfaceType, forge) {
  const script = REPLAN_SCRIPTS[forge];
  if (surfaceType === 'command') {
    const repoCandidate = forge === 'github' ? `./scripts/${script}` : `${REPLAN_LOCAL_DIRS[forge]}/${script}`;
    const pluginRootCandidate = `\${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/${script}}`;
    const installCandidate = `$HOME/.claude/${REPLAN_CACHE_PACKAGES[forge]}/scripts/${script}`;
    return `REPLAN_SCRIPT=""\nfor _p in "${repoCandidate}" "${pluginRootCandidate}" "${installCandidate}"; do\n  [ -f "$_p" ] && { REPLAN_SCRIPT="$_p"; break; }\ndone\n[ -n "$REPLAN_SCRIPT" ] || { echo "BLOCKED: ${script} unavailable" >&2; exit 1; }`;
  }
  const localCandidate = `${REPLAN_LOCAL_DIRS[forge]}/${script}`;
  const packageName = REPLAN_CACHE_PACKAGES[forge];
  return `REPLAN_SCRIPT="${localCandidate}"\nif [ ! -f "$REPLAN_SCRIPT" ]; then\n  REPLAN_SCRIPT="$(find "$HOME/.codex/plugins/cache" -path '*/${packageName}/*/scripts/${script}' -print -quit 2>/dev/null)"\nfi\n[ -n "$REPLAN_SCRIPT" ] && [ -f "$REPLAN_SCRIPT" ] || { echo "BLOCKED: ${script} unavailable" >&2; exit 1; }`;
}

function replanControlPlane(marker, surfaceType, forge) {
  const script = REPLAN_SCRIPTS[forge];
  return `## In-progress re-plan control plane

<!-- PIN: ${marker} -->

This fence outranks every normal startup, mirror, scheduler, handoff, validation, and
finalization route. Before any such action, read the project state and transaction status. When
either reports \`replan_in_progress\`, do not mutate or replace the frozen parent
\`workflow-plan.md\`. Read-only orientation must report the exact \`replan_phase\`,
\`transaction_id\`, \`parent_plan_hash\`, \`child_plan_hash\` (or \`none\`), and
\`last_cas_result\`; never reconstruct them from memory.

The single legal mutation while the fence is active is the edition-local re-plan resume command:

\`\`\`bash
${replanResolver(surfaceType, forge)}
node "$REPLAN_SCRIPT" resume --project {project} --json
\`\`\`

The installed aggregator is \`${script}\`. Do not run mirror/open/record/close/run-chains,
ordinary adaptive handoff, claim archive, task-mirror refresh, or finalize while an intermediate
phase remains. \`decision:ask\` remains advisory and never adds a pause or gate.

If resume returns \`replan_planner_dispatch_required\`, dispatch the genuine
\`workflow-planner\` profile in its Re-plan dispatch mode with an isolated brief containing only
the repository root, project, \`transaction_id\`, \`dispatch_nonce\`, profile identity, the exact
\`.cache/replan-planner-packet.json\` path, and the packet's reason/source evidence. No role
sequence, node ids, dependencies, write sets, cardinality, shape, model, or exact DAG fragment may
be supplied by the orchestrator; an attempt earns \`planner_control_boundary_violation\`. The
planner alone writes the seeded \`workflow-plan.next.md\` and
\`.cache/replan-planner-attestation.json\`, then returns through this same resume command. Missing,
stale, replayed, or mismatched dispatch proof/attestation is
\`replan_planner_attestation_invalid\`; main must never synthesize either artifact.

An invalid unfrozen child uses the bounded unfrozen child-repair loop: re-dispatch the same planner
with the verbatim validator errors and its own child draft, then resume. The main session never
repairs the child DAG. At the retry bound, stop with the typed evidence; do not create a competing
plan, restart the claim, or route to another path. A verified legacy-v1 parent follows this same
transaction into a schema-2 child; legacy normal startup behavior otherwise stays unchanged.`;
}

function replanSlot(marker) {
  const out = { command: {}, skill: {} };
  for (const surfaceType of Object.keys(out)) {
    for (const forge of Object.keys(REPLAN_SCRIPTS)) {
      out[surfaceType][forge] = replanControlPlane(marker, surfaceType, forge);
    }
  }
  return out;
}

const SLOTS = {
  // ---- plan-run --------------------------------------------------------
  'pr-frontmatter': {
    command: "---\ndescription: Kaola-Workflow Adaptive Executor. Executes a frozen workflow-plan.md via a running-set scheduler; each frontier unit dispatched concurrently up to the fan-out cap (critical-path-first); planner-proven-disjoint (parallel_safe) write frontiers co-open in isolated legs BY DEFAULT — no operator toggles; serial is the fallback only on a named serializer (a proven exact-path overlap, the retained net not holding, or a host without worktree support) — uncertain overlap co-opens too and reconciles at the join. Resume-safe.\nargument-hint: <project name>\n---",
    skill: "---\nname: kaola-workflow-plan-run\ndescription: Use when executing a frozen adaptive workflow-plan.md — executes via a running-set scheduler; each frontier unit dispatched concurrently up to the fan-out cap (critical-path-first); planner-proven-disjoint (parallel_safe) write frontiers co-open in isolated legs BY DEFAULT — no operator toggles; serial is the fallback only on a named serializer (a proven exact-path overlap, the retained net not holding, or a host without worktree support) — uncertain overlap co-opens too and reconciles at the join. Resume-safe. Mirror of commands/kaola-workflow-plan-run.md for Codex runtime.\n---",
  },
  'pr-h1': {
    command: "# Kaola-Workflow Plan Run",
    skill: {
      github: "# Skill: kaola-workflow-plan-run",
      gitlab: "# Skill: kaola-workflow-plan-run (GitLab)",
      gitea: "# Skill: kaola-workflow-plan-run (Gitea)",
    },
  },
  'pr-intro': {
    command: "Executes a frozen `workflow-plan.md` for an adaptive project (`workflow_path: adaptive`).\nReads and updates `kaola-workflow/{project}/workflow-state.md` throughout. The plan is\nguarded by `plan_hash`; tampering is a **typed refusal**. Drive every node in the\n`## Node Ledger` to `complete` or `n/a`, honoring the computed gates, then hand off to\nFinalization. Stop and surface on any consent-halt or typed refusal.",
    skill: "Adaptive executor. Runs a frozen `workflow-plan.md` (`workflow_path: adaptive`) by\ntraversing its DAG + `## Node Ledger` instead of the fixed phaseN ladder. Reads and\nupdates `kaola-workflow/{project}/workflow-state.md` throughout. The plan is guarded by\n`plan_hash`; tampering is a **typed refusal**. Drive every node to `complete` or `n/a`,\nhonoring the computed gates, then route to `kaola-workflow-finalize`.",
  },
  'pr-setup-resolver': {
    command: {
      github: "ACTIVE_WORKTREE_PATH=\"$(node -e \"try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}\" 2>/dev/null)\" || true\n[ -z \"$ACTIVE_WORKTREE_PATH\" ] || [ ! -d \"$ACTIVE_WORKTREE_PATH\" ] && ACTIVE_WORKTREE_PATH=\"$(pwd)\"\nkaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\" \"./scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nKAOLA_SCRIPTS=\"$(dirname \"$(kaola_script kaola-workflow-adaptive-node.js)\")\"",
      gitlab: "ACTIVE_WORKTREE_PATH=\"$(node -e \"try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}\" 2>/dev/null)\" || true\n[ -z \"$ACTIVE_WORKTREE_PATH\" ] || [ ! -d \"$ACTIVE_WORKTREE_PATH\" ] && ACTIVE_WORKTREE_PATH=\"$(pwd)\"\nkaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitlab/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\" \"./plugins/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nKAOLA_SCRIPTS=\"$(dirname \"$(kaola_script kaola-gitlab-workflow-adaptive-node.js)\")\"",
      gitea: "ACTIVE_WORKTREE_PATH=\"$(node -e \"try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}\" 2>/dev/null)\" || true\n[ -z \"$ACTIVE_WORKTREE_PATH\" ] || [ ! -d \"$ACTIVE_WORKTREE_PATH\" ] && ACTIVE_WORKTREE_PATH=\"$(pwd)\"\nkaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitea/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\" \"./plugins/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nKAOLA_SCRIPTS=\"$(dirname \"$(kaola_script kaola-gitea-workflow-adaptive-node.js)\")\"",
    },
    skill: {
      github: "ACTIVE_WORKTREE_PATH=\"$(node -e \"try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/' + process.env.KAOLA_PROJECT + '/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}\" 2>/dev/null)\" || true\n[ -z \"$ACTIVE_WORKTREE_PATH\" ] && ACTIVE_WORKTREE_PATH=\"$(pwd)\"\nKAOLA_SCRIPTS=\"plugins/kaola-workflow/scripts\"\nif [ ! -f \"$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js\" ]; then\n  KAOLA_SCRIPTS=\"$(dirname \"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow/*/scripts/kaola-workflow-adaptive-node.js' -print -quit 2>/dev/null)\")\"\nfi",
      gitlab: "ACTIVE_WORKTREE_PATH=\"$(node -e \"try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/' + process.env.KAOLA_PROJECT + '/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}\" 2>/dev/null)\" || true\n[ -z \"$ACTIVE_WORKTREE_PATH\" ] && ACTIVE_WORKTREE_PATH=\"$(pwd)\"\nKAOLA_SCRIPTS=\"plugins/kaola-workflow-gitlab/scripts\"\nif [ ! -f \"$KAOLA_SCRIPTS/kaola-gitlab-workflow-adaptive-node.js\" ]; then\n  KAOLA_SCRIPTS=\"$(dirname \"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitlab/*/scripts/kaola-gitlab-workflow-adaptive-node.js' -print -quit 2>/dev/null)\")\"\nfi",
      gitea: "ACTIVE_WORKTREE_PATH=\"$(node -e \"try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/' + process.env.KAOLA_PROJECT + '/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}\" 2>/dev/null)\" || true\n[ -z \"$ACTIVE_WORKTREE_PATH\" ] && ACTIVE_WORKTREE_PATH=\"$(pwd)\"\nKAOLA_SCRIPTS=\"plugins/kaola-workflow-gitea/scripts\"\nif [ ! -f \"$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js\" ]; then\n  KAOLA_SCRIPTS=\"$(dirname \"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-adaptive-node.js' -print -quit 2>/dev/null)\")\"\nfi",
    },
  },
  'pr-replan-control-plane': replanSlot('replan-plan-run'),
  'pr-review-validation-runner': {
    command: "Use the already-resolved `$KAOLA_SCRIPTS/kaola-workflow-validation-runner.js`; pass the exact hash-covered policy values and write one canonical JSON receipt per obligation without shell re-derivation.",
    skill: "Resolve `kaola-workflow-validation-runner.js` from the same installed runtime as the adaptive node; pass the exact hash-covered policy values and write one canonical JSON receipt per obligation without shell re-derivation.",
  },

  // ---- next (frontmatter 2-shape + H1; both forge-invariant) -----------
  "nx-frontmatter": {"command":"---\ndescription: Workflow Next. Thin router for Kaola-Workflow. Detects active work, reconstructs resume state, and routes to the correct phase command.\nargument-hint: (optional project name or task description)\n---","skill":"---\nname: kaola-workflow-next\ndescription: Use when resuming, routing, or starting a Kaola-Workflow for Codex project, also called kaola-workflow, from kaola-workflow state and phase artifacts.\n---"},
  "nx-h1": {"command":"# Workflow Next - thin router","skill":"# Kaola-Workflow Next"},
  'nx-replan-control-plane': replanSlot('replan-next'),
};

const SPLICES = {
  // ---- plan-run --------------------------------------------------------
  // step 2: envelope tail + finalize route (command carries the extra
  // dispatch-sub-object sentence + the slashed /kaola-workflow-finalize route).
  'pr-open-next-tail': {
    command: "evidence_file, required_tokens, dispatch:{...}}` or `{allDone:true}`; the `dispatch`\nsub-object there supersedes per-field assembly and is the only source for\n`dispatch.leg_path`. On `allDone`, run chains then route to `/kaola-workflow-finalize\n{project}`.",
    skill: "evidence_file, required_tokens, dispatch:{...}}` or `{allDone:true}`. On `allDone`, run chains\nthen route to finalize.",
  },
  // step 2: the re-run `open-next` line (command carries the crash-orphan clause).
  'pr-reopen-line': {
    command: "when no node is `in_progress` (first node, or orphan from a crash between commit and fused advance).",
    skill: "when no node is `in_progress`.",
  },
  // step 3: the lead-in to "Instruct the role to:" — 3 variants (github command
  // gets the base-role sentence at position A above; the forge commands fold it
  // here; the skill uses the Delegate/task-name phrasing).
  'pr-instruct-lead': {
    command: {
      github: "Pass `dispatch.nonce` (evidence-binding token). Instruct the role to:",
      gitlab: "Dispatch the base role profile in `dispatch.agent_type` (legacy `dispatch.role` is only\ndescriptive). Pass `dispatch.nonce` (evidence-binding token). Instruct the role to:",
      gitea: "Dispatch the base role profile in `dispatch.agent_type` (legacy `dispatch.role` is only\ndescriptive). Pass `dispatch.nonce` (evidence-binding token). Instruct the role to:",
    },
    skill: "Delegate to the base role profile matching `dispatch.agent_type`. Apply the task-name and\nreasoning-effort rule above. Pass `dispatch.nonce` (evidence-binding token). Instruct the role to:",
  },
  // step 3 bullet: command "from its work" clause.
  'pr-fill-stubs': {
    command: "- Fill in token stubs from its work; NEVER modify the `evidence-binding:` header line.",
    skill: "- Fill in token stubs; NEVER modify the `evidence-binding:` header line.",
  },
  // step 3 bullet vs continuation: test_thrash is a top-level bullet in the
  // command, a continuation line under the disjoint-frontier bullet in the skill.
  'pr-test-thrash': {
    command: "- `test_thrash` ≥ 3: escalate via `write-halt --reason test_thrash`.",
    skill: "  `test_thrash` ≥ 3: escalate via `write-halt --reason test_thrash`.",
  },
  // merge_conflict recovery: the synthesizer floor swap.
  'pr-synth-floor': {
    command: "  **Opus**-floor `synthesizer` agent resolves a real conflict by intent), re-running `close-node`; on",
    skill: "  (non-lowerable floor) `synthesizer` agent resolves a real conflict by intent), re-running `close-node`; on",
  },
  // step 4: command's "it is already open" suffix.
  'pr-dispatch-next': {
    command: "On `result: ok` + `opened`: dispatch the next node (step 3) — it is already open.",
    skill: "On `result: ok` + `opened`: dispatch the next node (step 3).",
  },
  // step 5 intro: 3 variants (github command splits run-chains into a bash
  // fence; the forge command + skill inline it; command uses proceed/slashed
  // route, skill uses delegate/unslashed route).
  'pr-alldone-intro': {
    command: {
      github: "When `allDone: true`, detect the repo type and run the terminal validation appropriate to that repo:\n\n**Self-host (npm) — `package.json` declares `test:kaola-workflow:*` scripts:**\n\n```bash\nnode \"$KAOLA_SCRIPTS/kaola-workflow-run-chains.js\" --project {project}\n```",
      gitlab: "When `allDone: true`, detect the repo type and run the terminal validation appropriate to that repo, then proceed to\n`/kaola-workflow-finalize {project}`. Finalization's sink step owns its own crash-resume journals\n(`sink-receipt.json` / `sink-fallback.json`) and disposes of them itself at terminal success; if a\nstray one turns up on a later `clean and synced` check, delete it — never commit it.\n\n**Self-host (npm) — `package.json` declares `test:kaola-workflow:*` scripts:** Run `run-chains.js`\nwith `--project {project}`.",
      gitea: "When `allDone: true`, detect the repo type and run the terminal validation appropriate to that repo, then proceed to\n`/kaola-workflow-finalize {project}`. Finalization's sink step owns its own crash-resume journals\n(`sink-receipt.json` / `sink-fallback.json`) and disposes of them itself at terminal success; if a\nstray one turns up on a later `clean and synced` check, delete it — never commit it.\n\n**Self-host (npm) — `package.json` declares `test:kaola-workflow:*` scripts:** Run `run-chains.js`\nwith `--project {project}`.",
    },
    skill: "When `allDone: true`, detect the repo type and run the terminal validation appropriate to that repo, then delegate to\n`kaola-workflow-finalize {project}`. Finalization's sink step owns its own crash-resume journals\n(`sink-receipt.json` / `sink-fallback.json`) and disposes of them itself at terminal success; if a\nstray one turns up on a later `clean and synced` check, delete it — never commit it.\n\n**Self-host (npm) — `package.json` declares `test:kaola-workflow:*` scripts:** Run `run-chains.js`\nwith `--project {project}`.",
  },

  // ---- next: forge-noun / structural substitutions (3-way, per-forge).
  // Machine-derived from a 3-way LCS merge of the committed surfaces; each
  // splice replaces one skeleton line with its github/gitlab/gitea variant.
  "nx-cmd-001": {"github":"- a GitHub issue number or free-form task description for new work","gitlab":"- a GitLab issue number or free-form task description for new work","gitea":"- a Gitea issue number or free-form task description for new work"},
  "nx-cmd-002": {"github":"this capture step.","gitlab":"this capture step. Use the forge's issue tracker to file follow-ups.","gitea":"this capture step. Use the forge's issue tracker to file follow-ups."},
  "nx-cmd-003": {"github":"   kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\" \"./scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\n   CLAIM_JS=\"$(kaola_script kaola-workflow-claim.js)\"","gitlab":"   kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitlab/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\" \"./plugins/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\n   CLAIM_JS=\"$(kaola_script kaola-gitlab-workflow-claim.js)\"","gitea":"   kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitea/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\" \"./plugins/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\n   CLAIM_JS=\"$(kaola_script kaola-gitea-workflow-claim.js)\""},
  "nx-cmd-004": {"github":"3. Validate the target exists in the active consumer repository before calling startup. The validation context is the cwd's git repo (the project consuming Kaola-Workflow), not `KaolaBrother/Kaola-Workflow` unless that is the active project.\n   - Online: `gh issue view \"$KAOLA_TARGET_ISSUE\" --json number,state` against cwd's `gh` context. If the fetch fails, stop and ask — do not fall back to a different issue.","gitlab":"3. Validate the target exists before calling startup. Validate against the active consumer repository, not against the Kaola-Workflow package repository unless that is the active project.\n   - Online: `glab issue view \"$KAOLA_TARGET_ISSUE\" --output json` against the active project. If the fetch fails, stop and ask — do not fall back to a different issue.","gitea":"3. Validate the target exists before calling startup. Validate against the active consumer repository, not against the Kaola-Workflow package repository unless that is the active project.\n   - Online: `tea issues view \"$KAOLA_TARGET_ISSUE\" --output json` against the active project. If the fetch fails, stop and ask — do not fall back to a different issue."},
  "nx-cmd-005": {"github":"(all-or-nothing). There is one merge/PR sink per bundle. The finalization step","gitlab":"(all-or-nothing). There is one merge/MR sink per bundle. The finalization step","gitea":"(all-or-nothing). There is one merge/PR sink per bundle. The finalization step"},
  "nx-cmd-006": {"github":"## Startup Step 0a — PR Intent Capture","gitlab":"## Startup Step 0a — MR Intent Capture","gitea":"## Startup Step 0a — PR Intent Capture"},
  "nx-cmd-007": {"github":"Before the startup transaction, check the user's initial prompt for PR sink intent.\nIf it contains \"open a PR\", \"create a PR\", \"pull request\", \"sink=pr\", \"KAOLA_SINK=pr\",\nor \"PR sink\" (case-insensitive), export `KAOLA_SINK=pr` before the startup call.","gitlab":"Before the startup transaction, check the user's initial prompt for MR sink intent.\nIf it contains \"open an MR\", \"create an MR\", \"merge request\", \"sink=mr\", \"KAOLA_SINK=mr\",\n\"MR sink\", or the compatibility aliases \"open a PR\" / \"create a PR\" (case-insensitive),\nexport `KAOLA_SINK=mr` before the startup call.","gitea":"Before the startup transaction, check the user's initial prompt for PR sink intent.\nIf it contains \"open a PR\", \"create a PR\", \"pull request\", \"sink=pr\", \"KAOLA_SINK=pr\",\n\"PR sink\" (case-insensitive),\nexport `KAOLA_SINK=pr` before the startup call."},
  "nx-cmd-008": {"github":"   `commands/kaola-workflow-adapt.md`.","gitlab":"   `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md`.","gitea":"   `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md`."},
  "nx-cmd-009": {"github":"   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-pr` once, then","gitlab":"   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-mr` once, then","gitea":"   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-pr` once, then"},
  "nx-cmd-010": {"github":"2. **Fresh adaptive.** Run `watch-pr` once for global PR-folder reconciliation, then route to","gitlab":"2. **Fresh adaptive.** Run `watch-mr` once for global MR-folder reconciliation, then route to","gitea":"2. **Fresh adaptive.** Run `watch-pr` once for global PR-folder reconciliation, then route to"},
  "nx-cmd-011": {"github":"   `kaola-workflow-claim.js startup --workflow-path adaptive --target-issue $KAOLA_TARGET_ISSUE`","gitlab":"   `kaola-gitlab-workflow-claim.js startup --workflow-path adaptive --target-issue $KAOLA_TARGET_ISSUE`","gitea":"   `kaola-gitea-workflow-claim.js startup --workflow-path adaptive --target-issue $KAOLA_TARGET_ISSUE`"},
  "nx-cmd-012": {"github":"If `kaola-workflow-claim.js` and `kaola-workflow-classifier.js` are available,","gitlab":"If `kaola-gitlab-workflow-claim.js` and `kaola-gitlab-workflow-classifier.js` are available,","gitea":"If `kaola-gitea-workflow-claim.js` and `kaola-gitea-workflow-classifier.js` are available,"},
  "nx-cmd-013": {"github":"validates the explicit target, refreshes PR-backed folders with `watch-pr`, and","gitlab":"validates the explicit target, refreshes MR-backed folders with `watch-mr`, and","gitea":"validates the explicit target, refreshes PR-backed folders with `watch-pr`, and"},
  "nx-cmd-014": {"github":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\" \"./scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-workflow-claim.js)\"","gitlab":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitlab/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\" \"./plugins/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitlab-workflow-claim.js)\"","gitea":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitea/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\" \"./plugins/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitea-workflow-claim.js)\""},
  "nx-cmd-015": {"github":"  node \"$CLAIM_JS\" watch-pr >/dev/null 2>&1 || true","gitlab":"  node \"$CLAIM_JS\" watch-mr >/dev/null 2>&1 || true","gitea":"  node \"$CLAIM_JS\" watch-pr >/dev/null 2>&1 || true"},
  "nx-cmd-016": {"github":"On startup, also run `watch-pr` to archive PR folders for merged or closed PRs","gitlab":"On startup, also run `watch-mr` to archive MR folders for merged or closed MRs","gitea":"On startup, also run `watch-pr` to archive PR folders for merged or closed PRs"},
  "nx-cmd-017": {"github":"If a GitHub remote and authenticated `gh` are available, fetch open issues:","gitlab":"If a GitLab remote and authenticated `glab` are available, fetch open issues:","gitea":"If a Gitea remote and authenticated `tea` are available, fetch open issues:"},
  "nx-cmd-018": {"github":"gh issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url","gitlab":"glab issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url","gitea":"tea issues list --limit 100 --output json"},
  "nx-cmd-019": {"github":"Ensure `kaola-workflow/ROADMAP.md` exists. If GitHub is unavailable, continue from the local","gitlab":"Ensure `kaola-workflow/ROADMAP.md` exists. If GitLab is unavailable, continue from the local","gitea":"Ensure `kaola-workflow/ROADMAP.md` exists. If Gitea is unavailable, continue from the local"},
  "nx-cmd-020": {"github":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\" \"./scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nROADMAP_JS=\"$(kaola_script kaola-workflow-roadmap.js)\"","gitlab":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitlab/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\" \"./plugins/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nROADMAP_JS=\"$(kaola_script kaola-gitlab-workflow-roadmap.js)\"","gitea":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitea/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\" \"./plugins/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nROADMAP_JS=\"$(kaola_script kaola-gitea-workflow-roadmap.js)\""},
  "nx-cmd-021": {"github":"To refresh: node .../kaola-workflow-roadmap.js generate && git add kaola-workflow/ROADMAP.md && git commit -m \"chore: refresh ROADMAP.md\"","gitlab":"To refresh: node .../kaola-gitlab-workflow-roadmap.js generate && git add kaola-workflow/ROADMAP.md && git commit -m \"chore: refresh ROADMAP.md\"","gitea":"To refresh: node .../kaola-gitea-workflow-roadmap.js generate && git add kaola-workflow/ROADMAP.md && git commit -m \"chore: refresh ROADMAP.md\""},
  "nx-cmd-022": {"github":"Commits stay phase-owned (Finalization Step 7). If `kaola-workflow-roadmap.js` is unavailable, skip validation.","gitlab":"Commits stay phase-owned (Finalization Step 7). If `kaola-gitlab-workflow-roadmap.js` is unavailable, skip validation.","gitea":"Commits stay phase-owned (Finalization Step 7). If `kaola-gitea-workflow-roadmap.js` is unavailable, skip validation."},
  "nx-cmd-023": {"github":"If multiple active folders exist from prior sessions (e.g., `issue-63` and `issue-65` in different states), they operate independently. Each folder has its own `workflow-state.md`, branch, and worktree metadata. The pre-commit hook prevents commits that stage multiple workflow project folders together.","gitlab":"If multiple active folders exist from prior sessions, they operate independently. Each folder has its own `workflow-state.md`, branch, and worktree metadata. The pre-commit hook prevents commits that stage multiple workflow project folders together.","gitea":"If multiple active folders exist from prior sessions, they operate independently. Each folder has its own `workflow-state.md`, branch, and worktree metadata. The pre-commit hook prevents commits that stage multiple workflow project folders together."},
  "nx-cmd-024": {"github":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\" \"./scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nREPAIR_JS=\"$(kaola_script kaola-workflow-repair-state.js)\"","gitlab":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitlab/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\" \"./plugins/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nREPAIR_JS=\"$(kaola_script kaola-gitlab-workflow-repair-state.js)\"","gitea":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitea/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\" \"./plugins/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nREPAIR_JS=\"$(kaola_script kaola-gitea-workflow-repair-state.js)\""},
  "nx-sk-001": {"github":"this capture step.","gitlab":"this capture step. Use the forge's issue tracker to file follow-ups.","gitea":"this capture step. Use the forge's issue tracker to file follow-ups."},
  "nx-sk-002": {"github":"   claim_script=\"plugins/kaola-workflow/scripts/kaola-workflow-claim.js\"","gitlab":"   claim_script=\"plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js\"","gitea":"   claim_script=\"plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js\""},
  "nx-sk-003": {"github":"     claim_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)\"","gitlab":"     claim_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitlab/*/scripts/kaola-gitlab-workflow-claim.js' -print -quit 2>/dev/null)\"","gitea":"     claim_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-claim.js' -print -quit 2>/dev/null)\""},
  "nx-sk-004": {"github":"2. Validate the target exists in the active consumer repository before calling startup. The validation context is the cwd's git repo (the project consuming Kaola-Workflow), not `KaolaBrother/Kaola-Workflow` unless that is the active project.\n   - Online: `gh issue view \"$KAOLA_TARGET_ISSUE\" --json number,state` against cwd's `gh` context. If the fetch fails, stop and ask — do not fall back to a different issue.","gitlab":"2. Validate the target exists before calling startup. Validate against the active consumer repository, not against the Kaola-Workflow package repository unless that is the active project.\n   - Online: `glab issue view \"$KAOLA_TARGET_ISSUE\" --output json` against the active project. If the fetch fails, stop and ask — do not fall back to a different issue.","gitea":"2. Validate the target exists before calling startup. Validate against the active consumer repository, not against the Kaola-Workflow package repository unless that is the active project.\n   - Online: `tea issues view \"$KAOLA_TARGET_ISSUE\" --output json` against the active project. If the fetch fails, stop and ask — do not fall back to a different issue."},
  "nx-sk-005": {"github":"(all-or-nothing). There is one merge/PR sink per bundle. The finalization step","gitlab":"(all-or-nothing). There is one merge/MR sink per bundle. The finalization step","gitea":"(all-or-nothing). There is one merge/PR sink per bundle. The finalization step"},
  "nx-sk-006": {"github":"## Startup Step 0a — PR Intent Capture","gitlab":"## Startup Step 0a — MR Intent Capture","gitea":"## Startup Step 0a — PR Intent Capture"},
  "nx-sk-007": {"github":"Before the startup transaction, check the user's initial prompt for PR sink intent.","gitlab":"Before the startup transaction, check the user's initial prompt for MR sink intent.","gitea":"Before the startup transaction, check the user's initial prompt for PR sink intent."},
  "nx-sk-008": {"github":"- \"open a PR\"\n- \"create a PR\"\n- \"pull request\"\n- \"sink=pr\"\n- \"KAOLA_SINK=pr\"\n- \"PR sink\"","gitlab":"- \"open an MR\"\n- \"create an MR\"\n- \"merge request\"\n- \"sink=mr\"\n- \"KAOLA_SINK=mr\"\n- \"MR sink\"\n- \"open a PR\" (compatibility alias)\n- \"create a PR\" (compatibility alias)","gitea":"- \"open a PR\"\n- \"create a PR\"\n- \"pull request\"\n- \"sink=pr\"\n- \"KAOLA_SINK=pr\"\n- \"PR sink\""},
  "nx-sk-009": {"github":"Then export `KAOLA_SINK=pr` before the startup call. The existing","gitlab":"The PR phrases are accepted only as compatibility aliases. Then export\n`KAOLA_SINK=mr` before the startup call. The existing","gitea":"The PR phrases are accepted only as compatibility aliases. Then export\n`KAOLA_SINK=pr` before the startup call. The existing"},
  "nx-sk-010": {"github":"   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-pr` once, then","gitlab":"   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-mr` once, then","gitea":"   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-pr` once, then"},
  "nx-sk-011": {"github":"2. **Fresh adaptive.** Run `watch-pr` once, then route to `kaola-workflow-adapt $KAOLA_TARGET_ISSUE`.\n   The adapt skill's `workflow-planner` runs `kaola-workflow-claim.js startup --workflow-path","gitlab":"2. **Fresh adaptive.** Run `watch-mr` once, then route to `kaola-workflow-adapt $KAOLA_TARGET_ISSUE`.\n   The adapt skill's `workflow-planner` runs `kaola-gitlab-workflow-claim.js startup --workflow-path","gitea":"2. **Fresh adaptive.** Run `watch-pr` once, then route to `kaola-workflow-adapt $KAOLA_TARGET_ISSUE`.\n   The adapt skill's `workflow-planner` runs `kaola-gitea-workflow-claim.js startup --workflow-path"},
  "nx-sk-012": {"github":"   \"Agent Issue Selection — Bundle Lane\" above for selection, and the Bundle Lane\n   section of `kaola-workflow-adapt` for the planner's claim contract.","gitlab":"   the Bundle Lane sections (above and in `kaola-workflow-adapt`) for the planner's claim contract.","gitea":"   the Bundle Lane sections (above and in `kaola-workflow-adapt`) for the planner's claim contract."},
  "nx-sk-013": {"github":"preflight_script=\"plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js\"","gitlab":"preflight_script=\"plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js\"","gitea":"preflight_script=\"plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js\""},
  "nx-sk-014": {"github":"  preflight_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow/*/scripts/kaola-workflow-codex-preflight.js' -print -quit 2>/dev/null)\"","gitlab":"  preflight_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitlab/*/scripts/kaola-workflow-codex-preflight.js' -print -quit 2>/dev/null)\"","gitea":"  preflight_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitea/*/scripts/kaola-workflow-codex-preflight.js' -print -quit 2>/dev/null)\""},
  "nx-sk-015": {"github":"the explicit issue, refreshes PR-backed folders with `watch-pr`, and atomically","gitlab":"the explicit issue, refreshes MR-backed folders with `watch-mr`, and atomically","gitea":"the explicit issue, refreshes PR-backed folders with `watch-pr`, and atomically"},
  "nx-sk-016": {"github":"claim_script=\"plugins/kaola-workflow/scripts/kaola-workflow-claim.js\"","gitlab":"claim_script=\"plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js\"","gitea":"claim_script=\"plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js\""},
  "nx-sk-017": {"github":"  claim_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)\"","gitlab":"  claim_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitlab/*/scripts/kaola-gitlab-workflow-claim.js' -print -quit 2>/dev/null)\"","gitea":"  claim_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-claim.js' -print -quit 2>/dev/null)\""},
  "nx-sk-018": {"github":"  node \"$claim_script\" watch-pr >/dev/null 2>&1 || true","gitlab":"  node \"$claim_script\" watch-mr >/dev/null 2>&1 || true","gitea":"  node \"$claim_script\" watch-pr >/dev/null 2>&1 || true"},
  "nx-sk-019": {"github":"  no plan/ledger exists yet at claim time.\nIf the startup script is unavailable, stop for repair. If startup returns `claim: \"none\"`, stop normal routing. Before\nstopping, print the refusal diagnostics:","gitlab":"  no plan/ledger exists yet at claim time. If the startup script is unavailable, stop for repair.\nIf startup returns `claim: \"none\"`, stop normal routing. Do not inspect active\nproject folders unless the user explicitly names the project to resume.","gitea":"  no plan/ledger exists yet at claim time."},
  "nx-sk-020": {"github":"If GitHub is available, refresh open issues:","gitlab":"### Git Freshness Block Recovery","gitea":"### Git Freshness Block Recovery"},
  "nx-sk-021": {"github":"gh issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url","gitlab":"git fetch --prune\ngit pull --ff-only\ngit status --short --branch","gitea":"git fetch --prune\ngit pull --ff-only\ngit status --short --branch"},
  "nx-sk-022": {"github":"repair_script=\"plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js\"","gitlab":"repair_script=\"plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js\"","gitea":"repair_script=\"plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js\""},
  "nx-sk-023": {"github":"  repair_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow/*/scripts/kaola-workflow-repair-state.js' -print -quit 2>/dev/null)\"","gitlab":"  repair_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitlab/*/scripts/kaola-gitlab-workflow-repair-state.js' -print -quit 2>/dev/null)\"","gitea":"  repair_script=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-repair-state.js' -print -quit 2>/dev/null)\""},
  "nx-sk-024": {"github":"unambiguous open GitHub issue and no active project, select it without asking","gitlab":"unambiguous open GitLab issue and no active project, select it without asking","gitea":"unambiguous open Gitea issue and no active project, select it without asking"},
  "nx-sk-025": {"github":"removes every matching `.roadmap/issue-N.md` source, regenerates `ROADMAP.md` once,\narchives one bundle folder, and then stops. To start additional work, the user must\ninvoke kaola-workflow-next again.","gitlab":"removes each `.roadmap/issue-N.md` source, regenerates `kaola-workflow/ROADMAP.md` once,\narchives one bundle folder, and then stops.","gitea":"removes each `.roadmap/issue-N.md` source, regenerates `kaola-workflow/ROADMAP.md` once,\narchives one bundle folder, and then stops."},
};

module.exports = { SLOTS, SPLICES };
