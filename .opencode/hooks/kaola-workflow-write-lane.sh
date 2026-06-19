#!/usr/bin/env bash
set -uo pipefail

# #376 — write-lane containment PreToolUse(Write|Edit) hook.
#
# DENIES (exit 2) an out-of-lane Write/Edit at the moment of the write, instead of stranding
# finished work at seal-time (the #320/#364 leak). FAIL-OPEN everywhere else: a missing flag,
# a missing/malformed .cache/running-set.json manifest, unparseable stdin, or a non-git cwd all
# exit 0 — so non-adaptive sessions and serial runs are never interfered with.
#
# Enforcement is gated on KAOLA_LANE_CONTAINMENT (fail-closed default OFF) AND the presence of a
# running-set.json manifest of OPEN write-nodes (written by the #377 per-node scheduler). Until that
# manifest exists the hook is DORMANT-BUT-CORRECT (always exits 0). Forge-neutral (no forge-CLI names).
#
# Honest layering (AC8): this hook intercepts Write|Edit ONLY. Bash-mediated writes remain covered by
# the existing fail-closed accounting (per-node --barrier-check own-lane allowlist + seal vacuity).
# Hook = fast-fail containment; barrier = ground truth.

# Fail-closed flag gate: only an explicit 1/true/yes enforces (resolveLaneContainment shape).
case "${KAOLA_LANE_CONTAINMENT:-}" in
  1|true|yes) ;;
  *) exit 0 ;;
esac

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
export HOOK_INPUT
HOOK_INPUT="$(cat)"
[ -z "$HOOK_INPUT" ] && exit 0

# Write carries tool_input.file_path; Edit carries tool_input.file_path too. Fail-open on absence.
WL_FILE_PATH="$(node -e "try{const d=JSON.parse(process.env.HOOK_INPUT);process.stdout.write((d.tool_input&&d.tool_input.file_path)||'');}catch(e){process.stdout.write('');}" 2>/dev/null)" || exit 0
[ -z "$WL_FILE_PATH" ] && exit 0

export WL_FILE_PATH WL_GIT_ROOT="$GIT_ROOT"
node -e '
  var fs = require("fs"), path = require("path");
  var root = process.env.WL_GIT_ROOT;
  var fp = process.env.WL_FILE_PATH;
  if (!root || !fp) process.exit(0);
  // Normalize through symlinks (git --show-toplevel returns a realpath; a tool file_path may carry an
  // unresolved ancestor symlink, e.g. macOS /var -> /private/var). Realpath the deepest EXISTING
  // ancestor (the target file may not exist yet — it is about to be written) and re-append the tail.
  function realish(p) {
    var tail = [];
    var cur = path.resolve(p);
    while (cur && cur !== path.dirname(cur)) {
      if (fs.existsSync(cur)) {
        try { return path.join.apply(path, [fs.realpathSync(cur)].concat(tail.reverse())); } catch (e) { return path.resolve(p); }
      }
      tail.push(path.basename(cur));
      cur = path.dirname(cur);
    }
    return path.resolve(p);
  }
  root = realish(root);
  var abs = realish(path.resolve(root, fp));

  // Collect every open-write-node manifest: kaola-workflow/<project>/.cache/running-set.json (#377).
  var nodes = [];
  try {
    var wf = path.join(root, "kaola-workflow");
    fs.readdirSync(wf).forEach(function (d) {
      var m = path.join(wf, d, ".cache", "running-set.json");
      try {
        var parsed = JSON.parse(fs.readFileSync(m, "utf8"));
        if (parsed && Array.isArray(parsed.nodes)) nodes = nodes.concat(parsed.nodes);
      } catch (e) {}
    });
  } catch (e) {}
  if (!nodes.length) process.exit(0); // dormant: no open write-nodes -> never interfere

  function declSet(n) {
    var d = n.declared_write_set;
    if (Array.isArray(d)) return d.filter(Boolean);
    if (typeof d === "string") return d.split(/[\s,]+/).filter(function (x) { return x && x !== "-" && x !== "—"; });
    return [];
  }
  // A path is a "workflow band" (always allowed) when it is under kaola-workflow/ or any .cache/.
  function inWorkflowBand(rel) {
    return /^kaola-workflow\//.test(rel) || /(^|\/)\.cache\//.test(rel) || /^\.cache\//.test(rel);
  }
  function underDeclared(rel, set) {
    return set.some(function (p) { return rel === p || rel.indexOf(p + "/") === 0; });
  }

  // Deny rule (a): a write INSIDE a member worktree (.kw/node/<projTag>/<id>) outside that member
  // declared_write_set UNION the workflow bands.
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (!n.worktreePath) continue;
    var wt = path.resolve(root, n.worktreePath);
    if (abs === wt || abs.indexOf(wt + path.sep) === 0) {
      var rel = path.relative(wt, abs);
      var set = declSet(n);
      if (!set.length) process.exit(0); // cannot scope this node -> fail-open
      if (inWorkflowBand(rel) || underDeclared(rel, set)) process.exit(0);
      process.stderr.write("BLOCKED (write-lane #376): " + rel + " is outside member node " + (n.id || "?") + " declared lane (member worktree containment)\n");
      process.exit(2);
    }
  }

  // Deny rule (b): a write in the PARENT worktree matching ANY open node declared lane (#320 leak).
  var relRoot = path.relative(root, abs);
  if (inWorkflowBand(relRoot)) process.exit(0); // workflow bands always allowed in the parent
  for (var j = 0; j < nodes.length; j++) {
    var set2 = declSet(nodes[j]);
    if (underDeclared(relRoot, set2)) {
      // #386 (arch ii): SELF-EXEMPT the open WRITE node writing its OWN declared lane. With
      // KAOLA_LANE_CONTAINMENT off-by-default (the permanent serial fallback) a write node opens
      // ALONE in the parent worktree — its in-lane parent write IS the legitimate serial case, NOT a
      // #320 leak. Without this carve-out, enabling the env var bricks every serial write node on its
      // only legal target. The #320 leak shape is OTHER sessions/agents writing into an open lane;
      // only those (and the member-worktree rule (a) above) should deny. The barrier (own-lane
      // allowlist) remains the ground truth — see docs/decisions/0008. A non-write (read) lane match
      // is still a real leak (a read node should write nothing in that lane) and stays denied.
      if (nodes[j].kind === "write") process.exit(0);
      process.stderr.write("BLOCKED (write-lane #376): " + relRoot + " matches open node " + (nodes[j].id || "?") + " lane but is written in the PARENT worktree (#320 leak shape)\n");
      process.exit(2);
    }
  }
  process.exit(0);
'
exit $?
