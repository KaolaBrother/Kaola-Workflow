'use strict';

// slots.js — slot + splice data for the routing-surface render engine.
//
// SLOTS are the larger structural pieces a skeleton fills per render context:
// the frontmatter (2-shape: command description/argument-hint vs skill
// name/description), the H1, the intro paragraph, and the setup-resolver
// runtime bash block. SPLICES are the smaller divergences where a command and
// a skill (or one forge and another) differ by only a clause, a route noun, or
// a script basename.
//
// Every value is either a string or an object keyed by surface_type and/or
// forge; the engine's resolveKeyed() descends surface_type first, then forge.
// The forge-noun renames the engine applies afterward (rename-table.js) never
// touch these values: every forge-specific basename here is already written
// out per forge.
//
// One resolver, two shapes. `*-scripts-resolver` sets KAOLA_SCRIPTS (the
// installed scripts directory) and CLAIM_JS for both surface shapes, so every
// sibling script invocation downstream is ONE shared skeleton line plus a
// forge-keyed basename — rather than a per-surface copy of the same recipe.
//
// EVERY resolver here is the same `kaola_script()` helper: it probes the
// runtime's install locations in order, prints the first hit, and RETURNS 1 when
// none matched. That return is the whole point — a lookup that missed must not
// be laundered into a plausible-looking path. `KAOLA_SCRIPTS="$(dirname
// "$CLAIM_JS")"` on an empty CLAIM_JS yields `.`, so a resolver that swallows
// its own miss sends the operator to `node ./kaola-…-claim.js` and a
// module-not-found that names the wrong problem.

const fs = require('fs');
const path = require('path');
const agentProfiles = require('../../scripts/generate-agent-profiles.js');
const GLOBAL_WORKFLOW_CONTRACT_SOURCE = path.join(
  __dirname, '..', 'global', 'kaola-workflow-global.md');

const SLOTS = {
  "nx-frontmatter": {"command":"---\ndescription: Workflow Next. Claims the work, writes the run's mission list, and runs it. Resumable from that one file.\nargument-hint: (optional project name, issue number, or task description)\n---","skill":"---\nname: kaola-workflow-next\ndescription: Use when starting, resuming, or running Kaola-Workflow for Codex work, also called kaola-workflow — claims the issue, writes the run's mission list, and runs it from that one file.\n---"},
  "nx-h1": {"command":"# Workflow Next","skill":"# Kaola-Workflow Next"},
  "nx-intro": {"command":"`/workflow-next` is the whole workflow: it claims the work, writes the run's mission list, and\nruns it. Everything the run needs in order to survive an interruption lives in\n`kaola-workflow/{project}/mission-list.md`, so a successor with no context at all resumes by\nreading one file.","skill":"This skill is the whole workflow: it claims the work, writes the run's mission list, and runs it.\nEverything the run needs in order to survive an interruption lives in\n`kaola-workflow/{project}/mission-list.md`, so a successor with no context at all resumes by\nreading one file."},
  "nx-scripts-resolver": {"command":{"github":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\" \"./scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\"","gitlab":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitlab/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\" \"./plugins/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitlab-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\"","gitea":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitea/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\" \"./plugins/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitea-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\""},"skill":{"github":"kaola_script(){ _n=\"$1\"; _p=\"plugins/kaola-workflow/scripts/$_n\"; [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; _p=\"$(find \"$HOME/.codex/plugins/cache\" -path \"*/kaola-workflow/*/scripts/$_n\" -print -quit 2>/dev/null)\"; [ -n \"$_p\" ] && [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\"","gitlab":"kaola_script(){ _n=\"$1\"; _p=\"plugins/kaola-workflow-gitlab/scripts/$_n\"; [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; _p=\"$(find \"$HOME/.codex/plugins/cache\" -path \"*/kaola-workflow-gitlab/*/scripts/$_n\" -print -quit 2>/dev/null)\"; [ -n \"$_p\" ] && [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitlab-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\"","gitea":"kaola_script(){ _n=\"$1\"; _p=\"plugins/kaola-workflow-gitea/scripts/$_n\"; [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; _p=\"$(find \"$HOME/.codex/plugins/cache\" -path \"*/kaola-workflow-gitea/*/scripts/$_n\" -print -quit 2>/dev/null)\"; [ -n \"$_p\" ] && [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitea-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\""}},
  "in-frontmatter": {"command":{"github":"---\ndescription: Initialize a project for Kaola-Workflow with CLAUDE.md guidance, docs structure, and Git/GitHub issue conventions.\nargument-hint: (optional project context)\n---","gitlab":"---\ndescription: Initialize a project for Kaola-Workflow with CLAUDE.md guidance, docs structure, and Git/GitLab issue conventions.\nargument-hint: (optional project context)\n---","gitea":"---\ndescription: Initialize a project for Kaola-Workflow with CLAUDE.md guidance, docs structure, and Git/Gitea issue conventions.\nargument-hint: (optional project context)\n---"},"skill":"---\nname: kaola-workflow-init\ndescription: Use when setting up a project for Kaola-Workflow for Codex, also called kaola-workflow or workflow-init, or refreshing its Codex-specific guidance and documentation scaffold.\n---"},
  "in-h1": {"command":"# Workflow Init","skill":"# Kaola-Workflow Init"},
  "fz-frontmatter": {"command":"---\ndescription: Kaola-Workflow Finalization. Final validation, documentation docking, closure, archive, commit, and sink.\nargument-hint: <project name>\n---","skill":"---\nname: kaola-workflow-finalize\ndescription: Use when Kaola-Workflow for Codex work, also called kaola-workflow, is finished and needs final validation, documentation docking, issue closure, archiving, and the sink.\n---"},
  "fz-h1": {"command":"# Kaola-Workflow Finalization","skill":"# Kaola-Workflow Finalize"},
  "fz-intro": {"command":"`/kaola-workflow-finalize` closes out a run and records what it delivered.","skill":"Closes out a run and records what it delivered."},
  "fz-scripts-resolver": {"command":{"github":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow/scripts/$_n\" \"./scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\"","gitlab":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitlab/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitlab/scripts/$_n\" \"./plugins/kaola-workflow-gitlab/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitlab-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\"","gitea":"kaola_script(){ _n=\"$1\"; _self=\"\"; [ -f \"./package.json\" ] && _self=\"$(node -e \"try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}\" 2>/dev/null)\"; if [ \"$_self\" = \"kaola-workflow\" ]; then for _p in \"./plugins/kaola-workflow-gitea/scripts/$_n\" \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; else for _p in \"${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}\" \"$HOME/.claude/kaola-workflow-gitea/scripts/$_n\" \"./plugins/kaola-workflow-gitea/scripts/$_n\"; do [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; done; fi; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitea-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\""},"skill":{"github":"kaola_script(){ _n=\"$1\"; _p=\"plugins/kaola-workflow/scripts/$_n\"; [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; _p=\"$(find \"$HOME/.codex/plugins/cache\" -path \"*/kaola-workflow/*/scripts/$_n\" -print -quit 2>/dev/null)\"; [ -n \"$_p\" ] && [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\"","gitlab":"kaola_script(){ _n=\"$1\"; _p=\"plugins/kaola-workflow-gitlab/scripts/$_n\"; [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; _p=\"$(find \"$HOME/.codex/plugins/cache\" -path \"*/kaola-workflow-gitlab/*/scripts/$_n\" -print -quit 2>/dev/null)\"; [ -n \"$_p\" ] && [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitlab-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\"","gitea":"kaola_script(){ _n=\"$1\"; _p=\"plugins/kaola-workflow-gitea/scripts/$_n\"; [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; _p=\"$(find \"$HOME/.codex/plugins/cache\" -path \"*/kaola-workflow-gitea/*/scripts/$_n\" -print -quit 2>/dev/null)\"; [ -n \"$_p\" ] && [ -f \"$_p\" ] && { printf '%s\\n' \"$_p\"; return; }; return 1; }\nCLAIM_JS=\"$(kaola_script kaola-gitea-workflow-claim.js)\"; KAOLA_SCRIPTS=\"$(dirname \"$CLAIM_JS\")\""}},
};

SLOTS['runtime-delegation'] = {
  command: agentProfiles.renderRuntimeDelegationGuidanceForRuntime('claude'),
  skill: {
    github: agentProfiles.renderRuntimeDelegationGuidanceForRuntime('codex', 'github'),
    gitlab: agentProfiles.renderRuntimeDelegationGuidanceForRuntime('codex', 'gitlab'),
    gitea: agentProfiles.renderRuntimeDelegationGuidanceForRuntime('codex', 'gitea'),
  },
};

// One common dispatch contract is rendered beside each runtime adapter. Next,
// Finalization, and compact recovery consume the same bytes; runtime-specific
// guidance remains adapter-owned below it.
SLOTS['runtime-dispatch-common'] = fs.readFileSync(
  path.join(__dirname, 'dispatch-contract.md'), 'utf8').trimEnd();

// Compact-capable runtimes receive the exact machine-global source again after
// compaction. This slot is the same authoring source the installation
// transaction renders at session start; the compact skeleton adds only route
// recovery and the measured dispatch adapter.
SLOTS['global-workflow-contract'] = fs.readFileSync(
  GLOBAL_WORKFLOW_CONTRACT_SOURCE, 'utf8').trimEnd();

// resolverFor — the init surfaces resolve a sibling script the SAME way the
// next/finalize surfaces do, only into a different handle. The recipe is
// DERIVED from `nx-scripts-resolver` rather than copied: the helper definition
// is line 1 of every resolver value, so a change to how a script is found
// reaches every surface that finds one, and there is no second copy to drift.
function resolverFor(handle, basenameByForge) {
  const out = {};
  for (const surface of ['command', 'skill']) {
    out[surface] = {};
    for (const forge of ['github', 'gitlab', 'gitea']) {
      const base = SLOTS['nx-scripts-resolver'][surface][forge];
      const helper = base.slice(0, base.indexOf('\n'));
      out[surface][forge] = `${helper}\n${handle}="$(kaola_script ${basenameByForge[forge]})"`;
    }
  }
  return out;
}

SLOTS['in-claim-resolver'] = resolverFor('CLAIM_JS', {
  github: 'kaola-workflow-claim.js',
  gitlab: 'kaola-gitlab-workflow-claim.js',
  gitea: 'kaola-gitea-workflow-claim.js',
});

const SPLICES = {
  // ---- next: forge nouns, route nouns, and the per-forge invocations. ----
  "nx-issue-fetch": {"github":"If a GitHub remote and an authenticated `gh` are available, read the open issues:","gitlab":"If a GitLab remote and an authenticated `glab` are available, read the open issues:","gitea":"If a Gitea remote and an authenticated `tea` are available, read the open issues:"},
  "nx-watch-run": {"github":"node \"$CLAIM_JS\" watch-pr >/dev/null 2>&1 || true","gitlab":"node \"$CLAIM_JS\" watch-mr >/dev/null 2>&1 || true","gitea":"node \"$CLAIM_JS\" watch-pr >/dev/null 2>&1 || true"},
  // The shortlist read (ADR 0018 §5 item 5): gh and glab expose issue body + comments through a
  // single porcelain call; tea has no such view, so the gitea variant goes through
  // kaola-gitea-forge.js's own `tea api` transport (already the module's established way of
  // reaching endpoints tea's porcelain does not cover) rather than reimplementing owner/repo
  // discovery as a second copy in shell.
  "nx-issue-detail-fetch": {"github":"gh issue view {N} --json body,comments","gitlab":"glab issue view {N} --comments -F json","gitea":"node -e \"try{const f=require(require('path').join(process.argv[1],'kaola-gitea-forge.js'));const n=process.argv[2];const p=f.discoverProject();const iss=f.viewIssue(n);const cm=f.listIssueComments(p,n);console.log(JSON.stringify({body:iss.body,comments:cm}));}catch(e){console.error(e.message)}\" \"$KAOLA_SCRIPTS\" {N}"},
  "nx-claim-run": {"command":"node \"$CLAIM_JS\" startup --runtime claude --target-issues \"$KAOLA_TARGET_ISSUES\"","skill":"node \"$CLAIM_JS\" startup --runtime codex --target-issues \"$KAOLA_TARGET_ISSUES\""},
  "nx-finalize-route": {"command":"```text\n/kaola-workflow-finalize {project}\n```","skill":"```text\nkaola-workflow-finalize\n```"},
  "nx-required-next": {"command":"Next: {the next command, or the frontier item you are opening}","skill":"Next: {the next skill, or the frontier item you are opening}"},

  // ---- init: command/skill + forge-noun substitutions (3-way, per-forge).
  // Machine-derived from a 3-way LCS merge of the committed surfaces; each
  // splice replaces one skeleton line (or one contiguous run of lines) with
  // its github/gitlab/gitea variant. `-shared-` splices sit outside any
  // REGION and render on both surface shapes.
  "in-cmd-001": {"github":"If this is not a Git repository, ask before running `git init`. If it is a Git repository without a remote, record that GitHub issue sync is pending until a GitHub remote exists.","gitlab":"If this is not a Git repository, ask before running `git init`. If it is a Git repository without a remote, record that GitLab issue sync is pending until a GitLab remote exists.","gitea":"If this is not a Git repository, ask before running `git init`. If it is a Git repository without a remote, record that Gitea issue sync is pending until a Gitea remote exists."},
  "in-cmd-002": {"github":"If `gh` is available and a GitHub repo can be inferred from `origin`, inspect open issues:","gitlab":"If `glab` is available and a GitLab repo can be inferred from `origin`, inspect open issues:","gitea":"If `tea` is available and a Gitea repo can be inferred from `origin`, inspect open issues:"},
  "in-cmd-003": {"github":"gh issue list --limit 100","gitlab":"glab issue list --limit 100","gitea":"tea issues list --limit 100"},
  "in-cmd-004": {"github":"If there is no GitHub remote, or if `gh` is unavailable or unauthenticated, skip issue fetching immediately and note that GitHub issue sync is pending. Do not spend time retrying GitHub calls during init.","gitlab":"If there is no GitLab remote, or if `glab` is unavailable or unauthenticated, skip issue fetching immediately and note that GitLab issue sync is pending. Do not spend time retrying GitLab calls during init.","gitea":"If there is no Gitea remote, or if `tea` is unavailable or unauthenticated, skip issue fetching immediately and note that Gitea issue sync is pending. Do not spend time retrying Gitea calls during init."},
  "in-sk-001": {"github":"   Active folder lifecycle: `kaola-workflow-claim.js` manages claim/startup (atomic folder create), status, release/discard, watch-pr, and finalize/archive. No legacy coordination layer is used.","gitlab":"   Active folder lifecycle: `kaola-gitlab-workflow-claim.js` manages claim/startup (atomic folder create), status, release/discard, watch-mr, and finalize/archive. No legacy coordination layer is used.","gitea":"   Active folder lifecycle: `kaola-gitea-workflow-claim.js` manages claim/startup (atomic folder create), status, release/discard, watch-pr, and finalize/archive. No legacy coordination layer is used."},
  "in-shared-001": {"github":"- GitHub issues are the backlog: title, labels and comments are what the work is — comments override the body.","gitlab":"- GitLab issues are the backlog: title, labels and comments are what the work is — comments override the body.","gitea":"- Gitea issues are the backlog: title, labels and comments are what the work is — comments override the body."},
  "in-sk-002": {"github":"plugin_root=\"plugins/kaola-workflow\"","gitlab":"plugin_root=\"plugins/kaola-workflow-gitlab\"","gitea":"plugin_root=\"plugins/kaola-workflow-gitea\""},
  "in-sk-003": {"github":"  script_path=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow/*/scripts/install-codex-agent-profiles.js' -print -quit 2>/dev/null)\"","gitlab":"  script_path=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitlab/*/scripts/install-codex-agent-profiles.js' -print -quit 2>/dev/null)\"","gitea":"  script_path=\"$(find \"$HOME/.codex/plugins/cache\" -path '*/kaola-workflow-gitea/*/scripts/install-codex-agent-profiles.js' -print -quit 2>/dev/null)\""},
  "in-next-route": {"command":"/workflow-next","skill":"kaola-workflow-next"},
  // The legacy-backlog reconcile pass and the closing summary are Steps 5 and 6 of
  // the command's numbered procedure; the skill has no Step sequence to continue, so
  // it carries the same two sections unnumbered.
  "in-migration-heading": {"command":"## Step 5 — Legacy Backlog Layer","skill":"## Legacy Backlog Layer"},
  "in-summary-heading": {"command":"## Step 6 — Git And Issue Summary","skill":"## Git And Issue Summary"},
  "in-shared-007": {"github":"If a GitHub issue is known, create the active workflow folder before starting:","gitlab":"If a GitLab issue is known, create the active workflow folder before starting:","gitea":"If a Gitea issue is known, create the active workflow folder before starting:"},
  "in-shared-008": {"github":"Replace `{project}` with the workflow project folder name (e.g., `multi-session-substrate`) and `{N}` with the GitHub issue number. If the issue number is unknown, omit `--issue`.","gitlab":"Replace `{project}` with the workflow project folder name (e.g., `multi-session-substrate`) and `{N}` with the GitLab issue number. If the issue number is unknown, omit `--issue`.","gitea":"Replace `{project}` with the workflow project folder name (e.g., `multi-session-substrate`) and `{N}` with the Gitea issue number. If the issue number is unknown, omit `--issue`."},
  "in-shared-009": {"github":"If `kaola-workflow-claim.js` is unavailable (manual install without the script), skip this step and proceed with local workflow artifacts.","gitlab":"If `kaola-gitlab-workflow-claim.js` is unavailable (manual install without the script), skip this step and proceed with local workflow artifacts.","gitea":"If `kaola-gitea-workflow-claim.js` is unavailable (manual install without the script), skip this step and proceed with local workflow artifacts."},
  "in-shared-010": {"github":"   - whether a GitHub remote exists","gitlab":"   - whether a GitLab remote exists","gitea":"   - whether a Gitea remote exists"},
  "in-shared-011": {"github":"   - whether GitHub issues were available for sync","gitlab":"   - whether GitLab issues were available for sync","gitea":"   - whether Gitea issues were available for sync"},

  // ---- finalize: forge nouns + the per-forge script invocations. ---------
  "fz-runchains-run": {"github":"node \"$KAOLA_SCRIPTS/kaola-workflow-run-chains.js\" --project {project}","gitlab":"node \"$KAOLA_SCRIPTS/kaola-gitlab-workflow-run-chains.js\" --project {project}","gitea":"node \"$KAOLA_SCRIPTS/kaola-gitea-workflow-run-chains.js\" --project {project}"},
  // gap-sweep's two modes are exclusive and both are spliced: the scanner writes the artifact and
  // reports `sweptClasses` (Step 6, before the section those classes are written into), the gate
  // reads it back (Step 7). A surface carrying only the gate can just refuse `artifact_missing`.
  "fz-gapsweep-scan": {"github":"node \"$KAOLA_SCRIPTS/kaola-workflow-gap-sweep.js\" --project {project} --json","gitlab":"node \"$KAOLA_SCRIPTS/kaola-gitlab-workflow-gap-sweep.js\" --project {project} --json","gitea":"node \"$KAOLA_SCRIPTS/kaola-gitea-workflow-gap-sweep.js\" --project {project} --json"},
  "fz-gapsweep-run": {"github":"node \"$KAOLA_SCRIPTS/kaola-workflow-gap-sweep.js\" --project {project} --check","gitlab":"node \"$KAOLA_SCRIPTS/kaola-gitlab-workflow-gap-sweep.js\" --project {project} --check","gitea":"node \"$KAOLA_SCRIPTS/kaola-gitea-workflow-gap-sweep.js\" --project {project} --check"},
  "fz-issue-closure": {"github":"If the project links issues, close every GitHub issue in the set — but only","gitlab":"If the project links issues, close every GitLab issue in the set — but only","gitea":"If the project links issues, close every Gitea issue in the set — but only"},
  "fz-sink-issue": {"github":"SINK_ISSUE=$(grep '^issue_number:' \"$SINK_STATE_FILE\" | awk '{print $2}')","gitlab":"SINK_ISSUE=$(grep '^issue_iid:' \"$SINK_STATE_FILE\" | awk '{print $2}')\n[ -z \"$SINK_ISSUE\" ] && SINK_ISSUE=$(grep '^issue_number:' \"$SINK_STATE_FILE\" | awk '{print $2}')","gitea":"SINK_ISSUE=$(grep '^issue_number:' \"$SINK_STATE_FILE\" | awk '{print $2}')"},
  "fz-keepopen-comment": {"github":"# keep-open is merge-sink-only — a PR sink would close the kept-open issue.","gitlab":"# keep-open is merge-sink-only — an MR sink would close the kept-open issue.","gitea":"# keep-open is merge-sink-only — a PR sink would close the kept-open issue."},
  "fz-sink-pr-case": {"github":"  pr)\n    node \"$KAOLA_SCRIPTS/kaola-workflow-sink-pr.js\" --branch \"$SINK_BRANCH\" $SINK_ISSUE_FLAG --project {project}","gitlab":"  mr|pr)\n    node \"$KAOLA_SCRIPTS/kaola-gitlab-workflow-sink-mr.js\" --branch \"$SINK_BRANCH\" $SINK_ISSUE_FLAG --project {project}","gitea":"  mr|pr)\n    node \"$KAOLA_SCRIPTS/kaola-gitea-workflow-sink-pr.js\" --branch \"$SINK_BRANCH\" $SINK_ISSUE_FLAG --project {project}"},
  "fz-sink-merge-run": {"github":"    node \"$KAOLA_SCRIPTS/kaola-workflow-sink-merge.js\" --branch \"$SINK_BRANCH\" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project} --sink --json","gitlab":"    node \"$KAOLA_SCRIPTS/kaola-gitlab-workflow-sink-merge.js\" --branch \"$SINK_BRANCH\" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project} --sink --json","gitea":"    node \"$KAOLA_SCRIPTS/kaola-gitea-workflow-sink-merge.js\" --branch \"$SINK_BRANCH\" $SINK_ISSUE_FLAG $SINK_ISSUE_NUMBERS_FLAG $SINK_KEEP_OPEN_FLAG --project {project} --sink --json"},
  "fz-sink-review-resolution": {"github":"- **file a pull request instead** — a perfectly good resolution precisely because it stages the","gitlab":"- **file a merge request instead** — a perfectly good resolution precisely because it stages the","gitea":"- **file a pull request instead** — a perfectly good resolution precisely because it stages the"},
  "fz-closure-audit-run": {"github":"node \"$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js\" --project {project}            # scoped verdict, dry-run (default)\n# node \"$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js\" --project {project} --execute  # repair safe local drift, scoped","gitlab":"node \"$KAOLA_SCRIPTS/kaola-gitlab-workflow-closure-audit.js\" --project {project}            # scoped verdict, dry-run (default)\n# node \"$KAOLA_SCRIPTS/kaola-gitlab-workflow-closure-audit.js\" --project {project} --execute  # repair safe local drift, scoped","gitea":"node \"$KAOLA_SCRIPTS/kaola-gitea-workflow-closure-audit.js\" --project {project}            # scoped verdict, dry-run (default)\n# node \"$KAOLA_SCRIPTS/kaola-gitea-workflow-closure-audit.js\" --project {project} --execute  # repair safe local drift, scoped"},
};

module.exports = { SLOTS, SPLICES, GLOBAL_WORKFLOW_CONTRACT_SOURCE };
