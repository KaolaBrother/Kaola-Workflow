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
//   tool.execute.before · edit/write→ kaola-workflow-write-lane.sh   (#376 lane containment; dormant until enabled)
//   tool.execute.before · task      → kaola-workflow-subagent-dispatch-log.sh (record spawn for closure attestation)
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
  writeLane: "kaola-workflow-write-lane.sh",
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

// Resolve a hook script across the PROJECT and GLOBAL layouts. Project candidates come FIRST so a
// project-local install always wins; the trailing candidates handle the GLOBAL install, where the
// plugin lives at <config>/plugins/ and hooks at <config>/hooks/ (NOT under a nested .opencode/), a
// location findRoot — which walks the user's project tree — never reaches. SELF_DIR/../hooks works
// regardless of the config dir name; the explicit config-dir forms (flat + legacy nested) are belt
// and suspenders. Returns null if none exist (fail-open, matching runHook).
function hookPath(root, script) {
  const candidates = [
    path.join(root, ".opencode", "hooks", script),          // project: <project>/.opencode/hooks/
    path.join(root, "hooks", script),                       // project: canonical ./hooks/
    path.join(SELF_DIR, "..", "hooks", script),             // global: sibling of this plugin's dir
    path.join(OPENCODE_CONFIG_DIR, "hooks", script),        // global: <config>/hooks/ (post path-fix)
    path.join(OPENCODE_CONFIG_DIR, ".opencode", "hooks", script), // global: legacy nested layout
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

// Named exports for the test suite only — opencode loads the default export below; these are inert
// for the runtime but let test-opencode-edition.js assert hookPath's global-layout resolution (F3).
export { hookPath, findRoot };

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

export default async function KaolaWorkflowHooks({ directory, worktree }) {
  const root = findRoot(worktree || directory);
  return {
    "tool.execute.before": async (input, output) => {
      const tool = input && input.tool;
      const args = (output && output.args) || {};

      if (tool === "edit" || tool === "write") {
        const fp = args.filePath || args.path || args.file_path || "";
        if (fp) {
          const r = runHook(root, HOOK.writeLane, { tool_input: { file_path: fp } });
          if (r.status === 2) {
            throw new Error(
              r.stderr.trim() || "Kaola-Workflow: write-lane containment denied this write (#376)."
            );
          }
        }
        return;
      }

      // Subagent dispatch log — fire-and-forget; never blocks the dispatch.
      // opencode's tool.execute.before input carries { tool, sessionID, callID };
      // thread whichever is present into agent_id (prefer sessionID, fall back to
      // callID, then empty). Attestation keys on agent_type+cwd so this is a
      // non-blocking data-degradation fix, not a correctness change.
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
