// .opencode/plugins/kaola-workflow-hooks.js
//
// opencode edition hook adapter. opencode's hook model is plugin-based (not the
// shell + settings.json model Claude Code uses), so this plugin supplies the
// compact-resume context inline. It does not install a shell dispatch hook.
//
// Coverage (mirrors plugins/kaola-workflow/config/hooks.json):
//   experimental.session.compacting → inject active kaola-workflow resume state
//
// Fail-open everywhere: an unreadable state file, malformed state, or a non-git cwd
// never breaks the session. Only an explicit exit-2 deny throws.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Walk up from `start` to the repo/project root (a dir holding .opencode or the
// kaola-workflow/ state dir). Falls back to `start` itself.
function findRoot(start) {
  let cur = path.resolve(start || process.cwd());
  for (let i = 0; i < 24; i++) {
    if (existsSync(path.join(cur, ".opencode")) || existsSync(path.join(cur, "kaola-workflow"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(start || process.cwd());
}

function stateField(text, name, fallback = "unknown") {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}:\\s*(.*)$`, "m"));
  const value = match && match[1] ? match[1].trim() : "";
  return value || fallback;
}

// Build a compact resume summary from active kaola-workflow claim facts and the
// adjacent Mission List, to preserve the durable recovery index across context
// compaction. The Mission List is intentionally carried as authored: this hook
// does not parse, validate, or rewrite its H1/item/status/dispatched/result record.
function buildResumeContext(root) {
  const wfDir = path.join(root, "kaola-workflow");
  if (!existsSync(wfDir)) return null;
  const lines = [];
  let projects = [];
  try {
    projects = readdirSync(wfDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "archive")
      .map((e) => e.name);
  } catch {
    return null;
  }
  for (const proj of projects) {
    try {
      const state = path.join(wfDir, proj, "workflow-state.md");
      if (!existsSync(state)) continue;
      const txt = readFileSync(state, "utf8");
      const project = stateField(txt, "name", proj);
      const status = stateField(txt, "status");
      if (!/^active$/i.test(status)) continue;
      const branch = stateField(txt, "branch");
      const worktree = stateField(txt, "worktree_path");
      const sink = stateField(txt, "sink");
      const mission = path.join(wfDir, proj, "mission-list.md");
      const stateRel = path.relative(root, state);
      const missionRel = path.relative(root, mission);
      const missionLines = existsSync(mission)
        ? readFileSync(mission, "utf8").trim().split(/\r?\n/).map((line) => `    ${line}`)
        : [`    (missing: ${missionRel})`];
      lines.push(
        `- project \`${project}\`: status ${status}, branch ${branch}, worktree ${worktree}, sink ${sink}`,
        `  Claim state: ${stateRel}`,
        `  Mission List: ${missionRel}`,
        ...missionLines,
        "  Mission List discipline: a completed item and its result are immutable; one dispatch has one result including FAIL; repair or re-review work appends a new mission."
      );
    } catch {
      // skip unreadable project
    }
  }
  if (!lines.length) return null;
  return ["## Kaola-Workflow resume state (preserve across compaction)", ...lines].join("\n");
}

// THE DEFAULT EXPORT IS THE ONLY EXPORT, and that is a load-bearing constraint, not a style choice.
// opencode's plugin loader does `for (const value of Object.values(mod))` and treats EVERY exported
// value as a plugin factory: a non-function export throws `TypeError("Plugin export is not a
// function")` outright, and an exported helper is CALLED as `fn(PluginInput, options)` — which for
// anything taking a path first argument means `path.resolve(<object>)` and a thrown
// `The "paths[0]" argument must be of type string`. That aborts registration of this module.
//
// This file used to also export `hookPath` and `findRoot` "for the test suite only, inert for the
// runtime". They were not inert: they threw on every load. The hooks survived only because the
// loader pushes into the caller's array as it goes and ESM namespace keys are sorted, so `default`
// happened to be collected before `findRoot` threw — one export name sorting ahead of `default`
// would have silently killed every hook in this file.
//
// So helpers a test needs are reached through the default export instead of beside it: a property on
// a function is invisible to `Object.values(mod)`, and there is no ordering left to depend on.
export default async function KaolaWorkflowHooks({ directory, worktree }) {
  const root = findRoot(worktree || directory);
  return {
    "experimental.session.compacting": async (_input, output) => {
      try {
        const resume = buildResumeContext(root);
        if (resume && output && Array.isArray(output.context)) output.context.push(resume);
      } catch {
        // advisory; ignore
      }
    },

  };
}

// Test-only handle, hung off the default export rather than exported beside it — see the note above
// KaolaWorkflowHooks for why a named export here is not free. `Object.values(mod)` still yields
// exactly one value, the factory, so the loader has nothing else to call.
//   const { default: plugin } = await import(<plugin>);
//   plugin.findRoot(start)
KaolaWorkflowHooks.findRoot = findRoot;
