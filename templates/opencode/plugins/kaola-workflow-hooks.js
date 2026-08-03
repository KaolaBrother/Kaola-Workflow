// .opencode/plugins/kaola-workflow-hooks.js
//
// opencode edition hook adapter. opencode's hook model is plugin-based (not the
// shell + settings.json model Claude Code uses), so this plugin bridges the two:
// it feeds Claude-style JSON payloads to the EXISTING runtime-neutral hook scripts
// (single source of truth, copied under .opencode/hooks/ from canonical hooks/),
// and honors their exit codes (2 = deny → throw, which opencode treats as a tool
// denial per the official .env-protection plugin pattern).
//
// Coverage (mirrors plugins/kaola-workflow/config/hooks.json):
//   tool.execute.before · task      → kaola-workflow-subagent-dispatch-log.sh (advisory spawn record)
//   experimental.session.compacting → inject active kaola-workflow resume state
//
// Fail-open everywhere (matches the scripts' own philosophy): a missing script, a
// malformed payload, or a non-git cwd never breaks the session. Only an explicit
// exit-2 deny throws.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// This plugin's own directory (…/<layout_root>/plugins/) — used to find hooks deployed alongside it
// at GLOBAL scope, where findRoot (which walks the user's PROJECT tree) never reaches the config root.
const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPENCODE_CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), ".config", "opencode");

const HOOK = {
  dispatchLog: "kaola-workflow-subagent-dispatch-log.sh",
};

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

// Resolve a DEPLOYED artifact across the PROJECT and GLOBAL layouts. Project candidates come FIRST
// so a project-local install always wins; the trailing candidates handle the GLOBAL install, where
// the plugin lives at <config>/plugins/ and its siblings at <config>/<dir>/ (NOT under a nested
// .opencode/), a location findRoot — which walks the user's project tree — never reaches.
// SELF_DIR/.. works regardless of the config dir name; the explicit config-dir forms (flat + legacy
// nested) are belt and suspenders. Returns null if none exist (fail-open, matching runHook).
//
// Parameterised by directory and name rather than hard-coding `hooks/`: the five candidates ARE the
// deployed-layout answer, and a second copy of them for a second artifact kind would drift the first
// time a layout moved. `hookPath` below is the only caller today.
function deployedPath(root, dir, name) {
  const candidates = [
    path.join(root, ".opencode", dir, name),          // project: <project>/.opencode/<dir>/
    path.join(root, dir, name),                       // project: canonical ./<dir>/
    path.join(SELF_DIR, "..", dir, name),             // global: sibling of this plugin's dir
    path.join(OPENCODE_CONFIG_DIR, dir, name),        // global: <config>/<dir>/ (post path-fix)
    path.join(OPENCODE_CONFIG_DIR, ".opencode", dir, name), // global: legacy nested layout
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // unreadable candidate — keep looking
    }
  }
  return null;
}

function hookPath(root, script) {
  return deployedPath(root, "hooks", script);
}

function runHook(root, script, payload) {
  const p = hookPath(root, script);
  if (!p) return { status: 0, stderr: "" }; // fail-open: script not deployed
  try {
    const r = spawnSync("bash", [p], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      timeout: 10000,
    });
    return { status: r.status == null ? 0 : r.status, stderr: r.stderr || "" };
  } catch {
    return { status: 0, stderr: "" };
  }
}

// Build a compact resume summary from active kaola-workflow project state, to
// preserve across context compaction (the opencode analog of the Codex
// compact-resume SessionStart hook).
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
      const status = (txt.match(/^status:\s*(.+)$/m) || [])[1] || "unknown";
      if (!/active/i.test(status)) continue;
      const phase = (txt.match(/^current_phase:\s*(.+)$/m) || [])[1] || "";
      const issue = (txt.match(/^issue:\s*(.+)$/m) || [])[1] || "";
      lines.push(
        `- project \`${proj}\`: status ${status.trim()}${phase ? `, phase ${phase.trim()}` : ""}${
          issue ? `, issue ${issue.trim()}` : ""
        }`
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
    "tool.execute.before": async (input, output) => {
      const tool = input && input.tool;
      const args = (output && output.args) || {};

      // Subagent dispatch log — fire-and-forget; never blocks the dispatch.
      // opencode's tool.execute.before input carries { tool, sessionID, callID };
      // thread whichever is present into agent_id (prefer sessionID, fall back to
      // callID, then empty). The log is advisory — a sparse agent_id degrades the
      // record, never an outcome.
      if (tool === "task") {
        try {
          const st = args.subagent_type || args.agent || "";
          const sid = (input && (input.sessionID || input.callID)) || "";
          runHook(root, HOOK.dispatchLog, { agent_type: st, agent_id: sid, cwd: directory || root });
        } catch {
          // advisory; ignore
        }
      }
    },

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

// Test-only handles, hung off the default export rather than exported beside it — see the note above
// KaolaWorkflowHooks for why a named export here is not free. `Object.values(mod)` still yields
// exactly one value, the factory, so the loader has nothing else to call.
//   const { default: plugin } = await import(<plugin>);
//   plugin.hookPath(root, script) · plugin.findRoot(start)
KaolaWorkflowHooks.hookPath = hookPath;
KaolaWorkflowHooks.findRoot = findRoot;
