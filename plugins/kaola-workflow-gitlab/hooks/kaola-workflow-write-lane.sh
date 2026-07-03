#!/usr/bin/env bash
set -uo pipefail

# #376 — write-lane containment PreToolUse(Write|Edit) hook.
#
# DENIES (exit 2) an out-of-lane Write/Edit at the moment of the write, instead of stranding
# finished work at seal-time (the #320/#364 leak). FAIL-OPEN everywhere else: a missing flag,
# a missing/malformed .cache/running-set.json manifest, unparseable stdin, or a non-git cwd all
# exit 0 — so non-adaptive sessions and serial runs are never interfered with.
#
# TWO independent enforcement switches, composed in the node block below:
#   (a)/(b) LANE CONTAINMENT — gated on KAOLA_LANE_CONTAINMENT (fail-closed default OFF) AND the
#           presence of a running-set.json manifest of OPEN write-nodes (written by the #377 per-node
#           scheduler). Until that manifest exists this arm is DORMANT-BUT-CORRECT (always exits 0).
#   (c)     GATE-WINDOW FENCE (#607) — DEFAULT-ON, opt-out via KAOLA_GATE_WINDOW_FENCE=0. Fires ONLY
#           while a main-session-gate is open (a manifest node with kind:'gate'), denying an in-worktree
#           out-of-band Write/Edit during the gate window. Safe by construction: it can only trigger
#           mid-adaptive-run with an open gate recorded in a manifest — non-adaptive sessions and serial
#           runs keep every existing fail-open exit (missing manifest / unparseable stdin / non-git cwd).
# Forge-neutral (no forge-CLI names).
#
# Honest layering (AC8): this hook intercepts Write|Edit ONLY. Bash-mediated writes remain covered by
# the existing fail-closed accounting (per-node --barrier-check own-lane allowlist + seal vacuity) for
# the lane arm; for the gate window the close barrier is net-zero-blind (write-then-delete), so layers 1
# (upstream provisioning) and 3 (close-time evidence token) are the backstop, not this hook.

# Resolve the two enforcement switches. Lane containment is fail-closed default-OFF; the gate-window
# fence is default-ON with an explicit KAOLA_GATE_WINDOW_FENCE=0 opt-out.
WL_LANE_ON=0
case "${KAOLA_LANE_CONTAINMENT:-}" in 1|true|yes) WL_LANE_ON=1 ;; esac
WL_GATE_FENCE_ON=1
case "${KAOLA_GATE_WINDOW_FENCE:-}" in 0|false|no) WL_GATE_FENCE_ON=0 ;; esac
# Fully dormant only when BOTH arms are off (byte-identical to the pre-#607 flag-off exit).
if [ "$WL_LANE_ON" = 0 ] && [ "$WL_GATE_FENCE_ON" = 0 ]; then exit 0; fi

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
export HOOK_INPUT
HOOK_INPUT="$(cat)"
[ -z "$HOOK_INPUT" ] && exit 0

# Write carries tool_input.file_path; Edit carries tool_input.file_path too. Fail-open on absence.
WL_FILE_PATH="$(node -e "try{const d=JSON.parse(process.env.HOOK_INPUT);process.stdout.write((d.tool_input&&d.tool_input.file_path)||'');}catch(e){process.stdout.write('');}" 2>/dev/null)" || exit 0
[ -z "$WL_FILE_PATH" ] && exit 0

export WL_FILE_PATH WL_GIT_ROOT="$GIT_ROOT" WL_LANE_ON WL_GATE_FENCE_ON
node -e '
  var fs = require("fs"), path = require("path");
  var root = process.env.WL_GIT_ROOT;
  var fp = process.env.WL_FILE_PATH;
  var laneOn = process.env.WL_LANE_ON === "1";
  var gateFenceOn = process.env.WL_GATE_FENCE_ON === "1";
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
  if (!nodes.length) process.exit(0); // dormant: no open nodes -> never interfere

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
  // A path under the gitignored `.kw/` band (member worktrees + per-leg worktrees + legs live here) is a
  // worktree-internal write, never a parent product-tree write — always allowed by the gate fence (#607).
  function inKwBand(rel) { return /^\.kw\//.test(rel) || /(^|\/)\.kw\//.test(rel); }
  function underDeclared(rel, set) {
    return set.some(function (p) { return rel === p || rel.indexOf(p + "/") === 0; });
  }
  // Is `abs` inside ANY manifest node worktreePath (a member worktree — governed by rule (a))?
  function inAnyMemberWorktree() {
    for (var k = 0; k < nodes.length; k++) {
      if (!nodes[k].worktreePath) continue;
      var wt = path.resolve(root, nodes[k].worktreePath);
      if (abs === wt || abs.indexOf(wt + path.sep) === 0) return true;
    }
    return false;
  }

  var relRoot = path.relative(root, abs);
  var insideRoot = (abs === root || abs.indexOf(root + path.sep) === 0);

  // -- Rule (c) #607 GATE-WINDOW FENCE (default-ON) — evaluated FIRST so it holds even when lane
  //    containment is off. When any open node is a main-session-gate (kind:'gate'), a Write/Edit landing
  //    INSIDE the active (parent) worktree, OUTSIDE the workflow bands, is DENIED unless it is:
  //      - under the `.kw/` band (member worktrees / legs / co-open speculative work) — allowed;
  //      - inside a member worktree (rule (a) governs it) — allowed;
  //      - under a co-open node`s declared lane (co-open writer lanes stay allowed — #596 speculative
  //        writes are eligible behind a gate; only writers carry a non-empty declared set) — allowed.
  //    Out-of-repo paths (scratchpad, /tmp) fall outside `insideRoot` -> allowed. There is no
  //    main-session-vs-subagent signal, so caller identity is approximated by WHERE the write lands.
  var gateOpen = nodes.some(function (n) { return n && n.kind === "gate"; });
  if (gateFenceOn && gateOpen && insideRoot && !inWorkflowBand(relRoot) && !inKwBand(relRoot) && !inAnyMemberWorktree()) {
    var underCoOpenLane = nodes.some(function (n) { return underDeclared(relRoot, declSet(n)); });
    if (!underCoOpenLane) {
      process.stderr.write("BLOCKED (write-lane #607 gate-window fence): " + relRoot + " is an in-worktree write during an open main-session-gate window. A gate is read-only by construction — it may only RUN instrumentation, never author it. Legal exits: provision the probe via an upstream writer node (tdd-guide/implementer, declared write set) / route-findings / repair-node / write-halt --reason consent. (opt out with KAOLA_GATE_WINDOW_FENCE=0)\n");
      process.exit(2);
    }
  }

  // Rules (a)/(b) are the #376 LANE CONTAINMENT arm — gated on KAOLA_LANE_CONTAINMENT (default OFF).
  if (!laneOn) process.exit(0);

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
