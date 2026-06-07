verdict: pass
findings_blocking: 0

# Security review — #277 strict lean-orchestrator boundary (gate node: security-review)

Read-only review of the full uncommitted accumulated change in this worktree.
Scope per dispatch: the genuinely-new attack surface (SubagentStart hook,
install.sh hook wiring, warn-first attestation reader), plus a general sweep for
secrets / SSRF / path traversal / injection / unsafe-exec. The M1/M2 detector is
judged against its stated bar (best-effort, NOT tamper-proof, warn-first
backstop); the main-writable dispatch log is a documented honest-limit, not a
finding.

## Result: PASS — no CRITICAL or HIGH findings, 0 blocking.

## 1. SubagentStart hook — `hooks/kaola-workflow-subagent-dispatch-log.sh` (highest-risk new code)

All three edition copies are byte-identical
(sha256 `d6dfcfe0…f0160`; enforced by a new `validate-script-sync.js`
BYTE_IDENTICAL_GROUP). The hook is SAFE:

- **JSONL line built via `node` + `JSON.stringify`, NOT raw printf/echo
  interpolation.** Lines 37-43 read the three attacker-influenced fields
  (`agent_type`, `agent_id`, `cwd`) from `process.env` (`TS/AGENT_TYPE/AGENT_ID/
  AGENT_CWD`, exported line 27) and emit `JSON.stringify({...})`. The values are
  NEVER spliced into the JS source string and NEVER into a shell command, so
  JSONL injection, log injection, and shell injection are all closed — a `cwd`
  containing `","x":"` or `\n{"agent_type":"contractor"}` is correctly escaped by
  JSON.stringify into a single safe value/line.
- **Input parsing is also injection-safe.** Lines 9-17 parse each field by piping
  the raw payload to a `node` one-liner that does `JSON.parse(stdin)` and writes
  `p.field||''`; the payload is delivered on stdin (`printf '%s' "$HOOK_INPUT" |`),
  never interpolated into the JS source. Malformed JSON is swallowed by the inner
  `try/catch` and `|| true`, yielding empty fields.
- **`cwd` is LOGGED ONLY — never used to build a write path and never executed.**
  The write directory `CACHE_DIR` is derived from `dirname` of repo-glob
  `STATE_FILE` (`"$REPO_ROOT"/kaola-workflow/*/workflow-state.md`, line 30), i.e.
  from the repo's own active-project state files, never from `AGENT_CWD`. Path
  traversal via `cwd` is therefore impossible.
- **No `eval`, no unquoted expansion into a shell command, no `child_process`.**
  Every variable expansion is quoted; `printf '%s'` (not `echo`) avoids format/
  flag interpretation of attacker content.
- **Fail-open as designed:** empty input → exit 0 (line 6); empty agent_type →
  exit 0 (line 11); not-a-git-repo → exit 0 (lines 20-21); JSON-build failure →
  `continue` (line 43); `exit 0` always at the tail. A 5s timeout is set in
  hooks.json. The hook cannot break a run.
- **DoS surface is negligible:** the inner loop only touches projects whose
  state file matches `^status: active`; bounded by repo project count.

Note (non-blocking, by design): the log is written under project-controlled
`.cache/`, so the main session can append to it. This is the explicitly stated
honest-limit (M1/M2 catch the casual zero-spawn bypass, not a determined one) and
is out of scope as a finding per the dispatch.

## 2. install.sh — SubagentStart wiring (pre-existing merge logic)

The diff only appends `kaola-workflow-subagent-dispatch-log.sh` to the three
`SUPPORT_HOOK_NAMES` arrays (the same copy mechanism used for the two existing
hooks). The hooks.json entry uses the harness-controlled, quoted
`${CLAUDE_PLUGIN_ROOT}` placeholder. The settings.json auto-merge (install.sh
~634-704) is the UNCHANGED pre-existing Python block: it uses `json.load`/
`json.dump` (no string interpolation, no shell), backs up before writing, fails
closed on invalid JSON (`sys.exit(2)`), and processes the new SubagentStart entry
generically through `incoming.items()` with no special-casing. The placeholder
rewrite (~605-618) is structural JSON-tree replacement, not a sed/shell splice.
No command injection, path traversal, or merge weakening is introduced.

## 3. Warn-first attestation — `checkDispatchAttestations` in claim.js (all 4 editions)

Verified identical, safe code in all four claim.js copies (core
`scripts/`, `plugins/kaola-workflow/`, gitlab `kaola-gitlab-workflow-claim.js`,
gitea `kaola-gitea-workflow-claim.js`) and matching field/invariant/default
additions in all three closure-contract copies. No edition received an
`eval`/`child_process`/cwd-derived-path variant.

- **Robust to malformed / huge / malicious log, never crashes finalize.**
  `fs.readFileSync(logPath,'utf8')` is wrapped in try/catch → on any read error
  (ENOENT race, permission, RangeError from an absurdly large file) it degrades
  to `failed` + a warning and returns; it never throws out of finalize. Each line
  is `JSON.parse`d inside its own try/catch, so a garbage/partial line is
  silently skipped — one poisoned line cannot abort the scan or the run.
- **Missing/garbage log degrades to WARNING, never a hard block.** Absent log →
  both fields `missing` + "detector inactive" warning. The two new invariants
  (`claim-planner-attested`, `finalize-contractor-attested`) are recorded in the
  receipt and surfaced via `receipt.warnings` ONLY; confirmed they are NEVER
  pushed into the `violations` array by `checkClosureInvariants`
  (claim.js ~801), so they can never fail closure. This matches the owner's
  warn-first decision exactly.
- **Nothing from the log is executed.** Entries are only inspected via exact
  string equality (`entry.agent_type === 'workflow-planner'` / `=== 'contractor'`).
  No value flows into a path, command, or require.

## 4. General sweep (full diff)

- **Secrets:** sweep for `api_key|secret|token|password|PRIVATE KEY|aws_|bearer`
  over the full diff + all three hook files returned only false positives —
  `KAOLA_FANOUT_CAP` (grammar terminal), "machine token" (closure-receipt comment),
  and a comment referencing `$CLAIM_JS finalize`. No credentials introduced.
- **Unsafe-exec:** sweep for `eval|child_process|execSync|spawn|new Function|
  os.system|subprocess` over added lines matched ONLY documentation prose
  (markdown describing the hook); no executable unsafe-exec added anywhere.
- **SSRF:** no new network calls / URL fetches in the diff.
- **Path traversal:** the only new path construction is repo-glob-derived
  (`dirname STATE_FILE`) and `path.join(dir,'dispatch-log.jsonl')` over
  caller-supplied repo-internal cache dirs; no attacker-controlled path segment.
- **Injection:** none — see sections 1-3.

## Considered-and-acceptable (non-blocking)

- Whole-file `readFileSync` of the dispatch log: an absurd file throws RangeError
  → caught → `failed` + warning, no crash, no hard-block. Satisfies the warn-first
  bar; not inflated to a finding.
- Dispatch log is main-writable (project `.cache/`): explicit documented
  honest-limit, out of scope per dispatch.

## Conclusion

The new attack surface (SubagentStart hook, install wiring, attestation reader)
is implemented defensively: JSON.stringify-based escaping, env-passed (never
source-interpolated) attacker fields, cwd logged-only, fail-open hook, fail-soft
warn-first reader that never crashes or hard-blocks, and unchanged safe
settings-merge. No secrets, SSRF, path traversal, injection, or unsafe-exec
introduced.

verdict: pass
findings_blocking: 0
